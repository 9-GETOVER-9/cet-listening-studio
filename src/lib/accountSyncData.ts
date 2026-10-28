import { db } from '@/db/schema'
import Dexie, { type IndexableType, type Table, type Transaction } from 'dexie'
import { frequencyDB } from './ieltsFrequencyProgress'
import { readingDB } from './ieltsReadingStore'
import { historyDB } from './ieltsHistory'
import { listeningTimeDB } from './listeningTime'
import { personalDB } from './ieltsPersonal'
import { ieltsReviewDB } from './ieltsReview'
import { createInitialFSRSState } from './fsrsScheduler'
import { normalizeFSRSState } from './fsrsState'
import { deserialize, serialize, sameValue } from './accountSyncProtocol'

type Row = Record<string, unknown>
interface Source { prefix: string; table: Table<Row, IndexableType>; owned: boolean }
const source = (prefix: string, table: unknown, owned = true): Source => ({ prefix, table: table as Table<Row, IndexableType>, owned })
const sources = [
  source('frequency/progress', frequencyDB.progress), source('frequency/receipts', frequencyDB.receipts),
  source('frequency/annotations', frequencyDB.annotations), source('frequency/practice', frequencyDB.practiceState),
  source('reading/progress', readingDB.progress), source('reading/annotations', readingDB.annotations),
  source('reading/archived', readingDB.archivedCards),
  source('reading/logs', readingDB.logs), source('reading/sessions', readingDB.sessions),
  source('ieltsReview/progress', ieltsReviewDB.progress), source('ieltsReview/logs', ieltsReviewDB.logs),
  source('ieltsReview/sessions', ieltsReviewDB.sessions),
  source('history', historyDB.rounds), source('listeningTime', listeningTimeDB.slices),
  source('personal', personalDB.words), source('notebook', db.notebook, false),
  source('notebookReview', db.notebookReviews, false), source('study', db.studyLog, false),
  source('listening', db.listeningLog, false), source('setting', db.settings, false),
]
export function settingBelongsTo(key: string, owner: string): boolean {
  if (key === 'hundredDayCompletionDates') return true // global projection is snapshotted and reset on account switch
  if (key.startsWith('nce-shadowing:session:') || key.startsWith('nce-shadowing:names:')) {
    try { return JSON.parse(key.slice(key.indexOf(':', 14) + 1))[0] === owner } catch { return false }
  }
  if (key.startsWith(`nce-shadowing:receipt:${JSON.stringify(owner)}:`)) return true
  if (key === `cloud-resume:${owner}`) return true
  if (key.startsWith(`ielts-dictation:session:${owner}:`)) return true
  return ['session', 'receipt', 'settings', 'mistakes', 'notebook-mistakes'].some(kind => key === `word-practice:${kind}:${owner}` || key.startsWith(`word-practice:${kind}:${owner}:`))
}
function primary(source: Source, row: Row): IndexableType {
  const paths = source.table.schema.primKey.keyPath
  return (Array.isArray(paths) ? paths.map(p => Dexie.getByKeyPath(row, p)) : Dexie.getByKeyPath(row, paths as string)) as IndexableType
}
function rowKey(source: Source, row: Row) { return `${source.prefix}/${encodeURIComponent(JSON.stringify(primary(source, row)))}` }
const isLog = (prefix: string) => ['study', 'listening'].includes(prefix)
export async function collectLearningData(owner: string): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>()
  for (const s of sources) {
    const rows = s.owned ? await s.table.where('owner').equals(owner).toArray() : await s.table.toArray()
    for (const raw of rows) {
      if (!s.owned && raw.owner && raw.owner !== owner) continue
      if (s.prefix === 'setting' && !settingBelongsTo(raw.key as string, owner)) continue
      if (s.prefix === 'frequency/practice' && String(raw.key).endsWith(':backup')) continue
      const row = { ...raw }
      // Portable operation identities prevent duplicate history when IndexedDB auto IDs differ.
      if (isLog(s.prefix)) {
        if (!row.operationId) {
          row.operationId = crypto.randomUUID()
          await s.table.update(primary(s, raw), { operationId: row.operationId })
        }
        delete row.id
        result.set(`${s.prefix}/${encodeURIComponent(String(row.operationId))}`, serialize(row))
        continue
      }
      if (s.prefix === 'personal') { delete row.audioData; delete row.chineseAudioData }
      result.set(rowKey(s, row), serialize(row))
    }
  }
  for (const card of await db.cards.where('cloudTracked').equals(1).toArray()) {
    if (!card.fsrsMain.reps && !card.aiUnlocked && !card.cardId.startsWith('merged_')) continue
    result.set(`card/${encodeURIComponent(card.cardId)}`, serialize({ cardId: card.cardId, fsrsMain: card.fsrsMain, aiUnlocked: card.aiUnlocked ?? false,
      ...(card.cardId.startsWith('merged_') ? { custom: card } : {}) }))
  }
  if (typeof localStorage !== 'undefined') for (const scope of ['main', 'notebook', 'reading']) {
    const text = localStorage.getItem('fsrs-personal-v1:' + JSON.stringify([owner, scope]))
    if (text) result.set(`parameters/${scope}`, JSON.parse(text))
  }
  return result
}

export async function applyLearningRecord(owner: string, key: string, input: unknown, expected?: { value: unknown }): Promise<boolean> {
  const s = sources.find(s => key.startsWith(s.prefix + '/'))
  const table = key.startsWith('card/') ? db.cards : s?.table
  const work = async () => {
    if (expected) {
      let current: unknown = null
      if (key.startsWith('card/')) {
        const card = await db.cards.get(decodeURIComponent(key.slice(5)))
        if (card && (card.fsrsMain.reps || card.aiUnlocked || card.cardId.startsWith('merged_'))) current = { cardId: card.cardId, fsrsMain: card.fsrsMain, aiUnlocked: card.aiUnlocked ?? false, ...(card.cardId.startsWith('merged_') ? { custom: card } : {}) }
      } else if (s) {
        const suffix = decodeURIComponent(key.slice(s.prefix.length + 1))
        const raw = isLog(s.prefix) ? await s.table.filter(r => r.operationId === suffix).first() : await s.table.get(JSON.parse(suffix))
        if (raw) { const copy = { ...raw }; if (isLog(s.prefix)) delete copy.id; if (s.prefix === 'personal') { delete copy.audioData; delete copy.chineseAudioData }; current = copy }
      } else if (key.startsWith('parameters/')) {
        const raw = localStorage.getItem('fsrs-personal-v1:' + JSON.stringify([owner, key.slice(11)]))
        current = raw ? JSON.parse(raw) : null
      }
      if (!sameValue(current, expected.value)) throw new Error('本机有新修改，正在保留并重新同步')
    }
    return applyRecord(owner, key, input)
  }
  return table ? table.db.transaction('rw', table, work) : work()
}
async function applyRecord(owner: string, key: string, input: unknown): Promise<boolean> {
  const value = deserialize(input) as Row | null
  if (key.startsWith('card/')) {
    const id = decodeURIComponent(key.slice(5)), card = await db.cards.get(id)
    if (!card && !value?.custom) return false // deferred until this lesson is imported
    if (value && (value.cardId !== id || !value.fsrsMain)) throw new Error('云端卡片无效')
    if (!card && value?.custom) await db.cards.put(value.custom as never)
    if (value?.custom && id.startsWith('merged_')) {
      const custom = value.custom as { mergedFrom?: string[] }
      if (custom.mergedFrom?.length) await db.cards.bulkDelete(custom.mergedFrom.filter(source => source !== id))
    }
    if (!value && id.startsWith('merged_')) await db.cards.delete(id)
    else await db.cards.update(id, { fsrsMain: value ? normalizeFSRSState(value.fsrsMain as never) : createInitialFSRSState(), aiUnlocked: Boolean(value?.aiUnlocked) })
    return true
  }
  if (key.startsWith('parameters/')) {
    const scope = key.slice(11)
    if (!['main', 'notebook', 'reading'].includes(scope)) throw new Error('参数范围无效')
    const storageKey = 'fsrs-personal-v1:' + JSON.stringify([owner, scope])
    if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey)
    window.dispatchEvent(new Event('fsrs-parameters-changed'))
    return true
  }
  const s = sources.find(s => key.startsWith(s.prefix + '/'))
  if (!s) throw new Error('未知学习数据类型')
  const suffix = key.slice(s.prefix.length + 1)
  if (isLog(s.prefix)) {
    const operationId = decodeURIComponent(suffix)
    const previous = await s.table.filter(r => r.operationId === operationId).first()
    if (value) {
      if (value.operationId !== operationId || value.owner && value.owner !== owner) throw new Error('历史记录账号无效')
      await s.table.put({ ...value, ...(previous ? { id: previous.id } : {}) })
    } else if (previous) await s.table.delete(primary(s, previous))
    return true
  }
  const parsedKey: unknown = JSON.parse(decodeURIComponent(suffix))
  const pk = parsedKey as IndexableType
  const previous = await s.table.get(pk)
  if (s.owned && (value ? value.owner !== owner : Array.isArray(parsedKey) ? parsedKey[0] !== owner : s.prefix === 'reading/sessions' ? parsedKey !== owner : previous && previous.owner !== owner)) throw new Error('云端记录不属于当前账号')
  if (s.prefix === 'setting' && !settingBelongsTo(String(pk), owner)) throw new Error('设置账号无效')
  if (!value) { await s.table.delete(pk); return true }
  if (JSON.stringify(primary(s, value)) !== JSON.stringify(pk)) throw new Error('记录主键无效')
  if (value.fsrsNotebook) value.fsrsNotebook = normalizeFSRSState(value.fsrsNotebook as never)
  if (value.fsrs) value.fsrs = normalizeFSRSState(value.fsrs as never)
  if (s.prefix === 'personal') {
    const previous = await s.table.get(pk)
    if (previous) { value.audioData = previous.audioData; value.chineseAudioData = previous.chineseAudioData }
  }
  await s.table.put(value)
  return true
}

export async function clearOwnedLearning(owner: string) {
  await resetGlobalLearning()
  for (const s of sources) {
    if (s.owned) await s.table.where('owner').equals(owner).delete()
    else if (s.prefix === 'setting') await s.table.filter(row => settingBelongsTo(String(row.key), owner)).delete()
  }
  for (const scope of ['main', 'notebook', 'reading']) localStorage.removeItem('fsrs-personal-v1:' + JSON.stringify([owner, scope]))
}
export async function resetGlobalLearning(): Promise<void> {
  await db.transaction('rw', [db.cards, db.notebook, db.studyLog, db.listeningLog, db.notebookReviews, db.syncOutbox, db.settings], async () => {
    await db.cards.toCollection().modify(card => { card.fsrsMain = createInitialFSRSState(); card.aiUnlocked = false })
    await db.cards.filter(c => c.cardId.startsWith('merged_')).delete()
    await Promise.all([db.notebook.clear(), db.studyLog.clear(), db.listeningLog.clear(), db.notebookReviews.clear(), db.syncOutbox.clear()])
    await db.settings.delete('hundredDayCompletionDates')
  })
}

/** Watch only the explicit text/state tables. Recordings and cached audio are deliberately absent. */
export function observeLearningWrites(onWrite: () => void): () => void {
  const tables = [...sources.map(s => s.table), db.cards as unknown as Table<Row, IndexableType>]
  function changed(this: unknown, _a: unknown, _b: unknown, tx?: Transaction) {
    // Dexie hook signatures differ: creating/deleting receive tx in argument 3,
    // updating in argument 4, handled by wrappers below.
    if (tx) tx.on('complete', onWrite)
  }
  const disposers = tables.map(table => {
    const create = (_key: IndexableType, _row: Row, tx: Transaction) => changed(undefined, undefined, tx)
    const update = (_mods: unknown, _key: IndexableType, _row: Row, tx: Transaction) => changed(undefined, undefined, tx)
    table.hook('creating', create); table.hook('updating', update); table.hook('deleting', create)
    return () => { table.hook('creating').unsubscribe(create); table.hook('updating').unsubscribe(update); table.hook('deleting').unsubscribe(create) }
  })
  return () => disposers.forEach(dispose => dispose())
}
