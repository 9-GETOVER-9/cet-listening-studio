import { create } from 'zustand'
import { db } from '@/db/schema'
import { syncModuleStats } from '@/db/crud'
import { useSettingsStore } from '@/store/settingsStore'
import { supabase } from './supabase'
import { collectLearningData, applyLearningRecord, resetGlobalLearning, observeLearningWrites, clearOwnedLearning } from './accountSyncData'
import { accountSyncDB, createAccountSyncEngine, type ExchangeResponse } from './accountSyncEngine'
import { deserialize, type LocalRecord } from './accountSyncProtocol'
import { setFSRSOwner } from './fsrsPreferences'
import { setListeningOwner } from './audioTimeTracker'
import { normalizeFSRSState } from './fsrsState'
import { pullCardStates, pullNotebookItems } from './sync'

type Phase = 'guest' | 'pending' | 'syncing' | 'synced' | 'offline' | 'error'
interface SyncStatus { phase: Phase; owner: string; lastSynced: number; pending: number; message: string; ready: boolean; remoteRevision: number }
export const useAccountSyncStatus = create<SyncStatus>(() => ({ phase: 'guest', owner: 'guest', lastSynced: 0, pending: 0, message: '', ready: false, remoteRevision: 0 }))
let activeOwner = ''
let stopped = false
let inFlight: Promise<void> | null = null
let switching = Promise.resolve()
const legacyOwnerHint = useSettingsStore.getState().currentUserId || 'guest'
const unloadedCardStates = new Map<string, { fsrsMain: unknown; aiUnlocked: boolean }>()

// Lessons are lazy-loaded. Apply downloaded progress when their base cards first appear.
db.cards.hook('creating', (_key, card) => {
  const saved = unloadedCardStates.get(card.cardId)
  if (saved) { card.fsrsMain = normalizeFSRSState(saved.fsrsMain as never); card.aiUnlocked = saved.aiUnlocked; card.cloudTracked = card.fsrsMain.reps > 0 || saved.aiUnlocked ? 1 : 0 }
})

async function exchange(owner: string, changes: LocalRecord[], cursor: number): Promise<ExchangeResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || session.user.id !== owner || activeOwner !== owner) throw new Error('登录账号已变化，请重新同步')
  const response = await fetch('/api/learning-sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ changes, cursor }), signal: AbortSignal.timeout(25_000), cache: 'no-store',
  })
  if (!response.ok) throw new Error(response.status === 401 ? '登录已过期，请重新登录后同步' : '云同步暂时失败，进度已保存在本机')
  return response.json() as Promise<ExchangeResponse>
}
const engine = createAccountSyncEngine({
  storage: accountSyncDB, collect: collectLearningData,
  apply: async (owner, key, value, expected) => {
    if (key.startsWith('card/')) {
      const id = decodeURIComponent(key.slice(5)), decoded = deserialize(value) as { fsrsMain: unknown; aiUnlocked: boolean } | null
      if (decoded) unloadedCardStates.set(id, decoded); else unloadedCardStates.delete(id)
    }
    return applyLearningRecord(owner, key, value, expected)
  },
  mayDelete: async key => !key.startsWith('card/') || Boolean(await db.cards.get(decodeURIComponent(key.slice(5)))) || Boolean(await db.settings.get('dataVersion')),
  exchange,
  active: owner => !stopped && activeOwner === owner,
})

async function withDeviceLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('learning-account-sync', work)
  return work()
}
async function migrateLegacy(owner: string) {
  const meta = await accountSyncDB.accounts.get(owner)
  if (meta?.migrated) return
  // Never resurrect old Supabase snapshots after a unified account already exists.
  const cloud = await exchange(owner, [], 0)
  if (!cloud.records.length) {
    const [cards, notebooks] = await Promise.all([pullCardStates(owner), pullNotebookItems(owner)])
    if (activeOwner !== owner) return
    for (const row of cards) {
      const local = await db.cards.get(row.card_id)
      const fsrsMain = normalizeFSRSState(row.fsrs_main)
      const localTime = local?.fsrsMain.last_review?.getTime() || 0
      if (!local || (fsrsMain.last_review?.getTime() || 0) > localTime) {
        const value = { cardId: row.card_id, fsrsMain, aiUnlocked: row.ai_unlocked }
        unloadedCardStates.set(row.card_id, value)
        if (local) await db.cards.update(row.card_id, value)
        else {
          const key = `card/${encodeURIComponent(row.card_id)}`
          const { serialize } = await import('./accountSyncProtocol')
          const serialized = serialize(value)
          await accountSyncDB.records.put({ owner, key, value: null, observed: serialized, version: 0, modifiedAt: 0,
            pending: { key, value: serialized, baseVersion: 0, modifiedAt: fsrsMain.last_review?.getTime() || 0, mutationId: crypto.randomUUID() } })
        }
      }
    }
    for (const row of notebooks) {
      const local = await db.notebook.get(row.notebook_id), fsrs = normalizeFSRSState(row.fsrs_notebook)
      if (local && (local.fsrsNotebook.last_review?.getTime() || 0) >= (fsrs.last_review?.getTime() || 0)) continue
      await db.notebook.put({ notebookId: row.notebook_id, type: row.type as never, content: row.content,
        exampleSentence: row.example_sentence, sourceCardId: row.source_card_id, sourceTag: row.source_tag,
        fsrsNotebook: fsrs, createdAt: row.created_at })
    }
  }
  await accountSyncDB.accounts.put({ owner, cursor: meta?.cursor || 0, migrated: true })
}

export async function syncAccountNow(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = withDeviceLock(async () => {
    const owner = activeOwner
    if (!owner || owner === 'guest' || stopped) return
    let pending = 0
    try {
      await engine.capture(owner)
      pending = await accountSyncDB.records.where('owner').equals(owner).filter(r => r.pending !== null).count()
      if (!navigator.onLine) { useAccountSyncStatus.setState({ phase: 'offline', pending }); return }
      useAccountSyncStatus.setState({ phase: 'syncing', pending, message: '' })
      await migrateLegacy(owner)
      const result = await engine.run(owner)
      if (owner !== activeOwner) return
      await db.syncOutbox.clear() // superseded only after durable unified upload
      if (pending > 0 || (result?.remoteApplied ?? 0) > 0) await syncModuleStats()
      useAccountSyncStatus.setState(s => ({ phase: 'synced', pending: 0, lastSynced: Date.now(), message: '', remoteRevision: s.remoteRevision + (result?.remoteApplied ?? 0) }))
      window.dispatchEvent(new Event('learning-cloud-updated'))
    } catch (error) {
      if (owner === activeOwner) useAccountSyncStatus.setState({ phase: navigator.onLine ? 'error' : 'offline', pending,
        message: error instanceof Error ? error.message : '同步失败，已保存在本机，请重试' })
    }
  }).finally(() => { inFlight = null })
  return inFlight
}

export function activateLearningAccount(owner: string): Promise<void> {
  if (activeOwner !== owner) useAccountSyncStatus.setState({ ready: false })
  switching = switching.catch(() => {}).then(async () => {
    if (activeOwner === owner && useAccountSyncStatus.getState().ready) return
    useAccountSyncStatus.setState({ ready: false })
    await inFlight
    await withDeviceLock(async () => {
      const previous = (await accountSyncDB.meta.get('main-owner'))?.value || legacyOwnerHint
      activeOwner = previous
      await engine.capture(previous) // durable snapshot; never upload guest data into another owner
      const hadMerged = previous !== owner && await db.cards.filter(c => c.cardId.startsWith('merged_')).count() > 0
      if (previous !== owner) await resetGlobalLearning()
      activeOwner = owner
      unloadedCardStates.clear()
      const cached = await accountSyncDB.records.where('owner').equals(owner).toArray()
      for (const row of cached) {
        const value = row.pending?.value ?? row.observed
        if (row.key.startsWith('card/') && value) unloadedCardStates.set(decodeURIComponent(row.key.slice(5)), deserialize(value) as never)
        if (previous !== owner) await applyLearningRecord(owner, row.key, value)
      }
      await accountSyncDB.meta.put({ key: 'main-owner', value: owner })
      if (hadMerged) {
        await db.settings.delete('dataVersion')
        if (navigator.onLine) {
          const { initializeData } = await import('./dataLoader')
          await initializeData()
        }
      }
      setFSRSOwner(owner); setListeningOwner(owner)
      useAccountSyncStatus.setState({ owner, phase: owner === 'guest' ? 'guest' : 'pending', pending: 0, lastSynced: 0 })
    })
    // Local ownership and cached progress are restored before exposing the UI.
    // Cloud exchange has its own retry/error state and must not gate first paint.
    useAccountSyncStatus.setState({ ready: true })
    if (owner !== 'guest') void syncAccountNow()
  })
  return switching
}

export function startAccountSync(): () => void {
  stopped = false
  const tick = () => { void syncAccountNow() }
  let debounce: ReturnType<typeof setTimeout> | undefined
  const changed = () => {
    if (!activeOwner || activeOwner === 'guest' || !useAccountSyncStatus.getState().ready) return
    if (useAccountSyncStatus.getState().phase !== 'syncing') useAccountSyncStatus.setState({ phase: navigator.onLine ? 'pending' : 'offline' })
    clearTimeout(debounce); debounce = setTimeout(tick, 1200)
  }
  const unwatch = observeLearningWrites(changed)
  const visible = () => { if (document.visibilityState === 'visible') tick() }
  const offline = () => useAccountSyncStatus.setState({ phase: activeOwner === 'guest' ? 'guest' : 'offline' })
  const timer = setInterval(tick, 10_000)
  window.addEventListener('online', tick); window.addEventListener('offline', offline)
  window.addEventListener('focus', tick); document.addEventListener('visibilitychange', visible)
  window.addEventListener('pagehide', tick)
  window.addEventListener('fsrs-parameters-changed', changed)
  return () => { stopped = true; clearInterval(timer); clearTimeout(debounce); unwatch(); window.removeEventListener('fsrs-parameters-changed', changed); window.removeEventListener('online', tick); window.removeEventListener('offline', offline); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', tick) }
}

export async function saveLearningResume(owner: string, path: string, label = '继续上次学习') {
  if (owner !== activeOwner || !/^\/(card|nce\/shadowing|word-practice|ielts\/reading-538|ielts\/listening)(\/|\?|$)/.test(path)) return
  await db.settings.put({ key: `cloud-resume:${owner}`, value: { path, label, updatedAt: Date.now() } })
}

/** Called only by the existing explicit clear-data confirmation. Never during normal sync. */
export async function clearAccountLearning(owner: string) {
  await inFlight
  await withDeviceLock(async () => {
    if (owner !== activeOwner) throw new Error('账号已切换')
    if (owner !== 'guest') {
      if (!navigator.onLine) throw new Error('请联网后清除账号云端记录')
      const { data, error } = await supabase.auth.getUser()
      if (error || data.user?.id !== owner) throw new Error('请重新登录后再清除')
      await engine.run(owner)
    }
    await clearOwnedLearning(owner)
    unloadedCardStates.clear()
    const records = await accountSyncDB.records.where('owner').equals(owner).toArray()
    for (const record of records) await accountSyncDB.records.put({ ...record, observed: null,
      pending: { key: record.key, value: null, baseVersion: record.version, mutationId: crypto.randomUUID(), modifiedAt: Date.now() } })
    if (owner !== 'guest') await engine.run(owner)
    await syncModuleStats()
  })
}
