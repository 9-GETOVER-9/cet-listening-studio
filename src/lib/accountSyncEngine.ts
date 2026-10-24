import Dexie, { type Table } from 'dexie'
import { reconcile, sameValue, type CloudRecord, type LocalRecord } from './accountSyncProtocol'

export interface CachedRecord extends CloudRecord { owner: string; observed: unknown; pending: LocalRecord | null }
export interface AccountMeta { owner: string; cursor: number; migrated?: boolean }
class SyncDB extends Dexie {
  records!: Table<CachedRecord, [string, string]>
  accounts!: Table<AccountMeta, string>
  meta!: Table<{ key: string; value: string }, string>
  constructor(name = 'account-learning-sync') {
    super(name)
    this.version(1).stores({ records: '[owner+key],owner', accounts: 'owner', meta: 'key' })
  }
}
export const accountSyncDB = new SyncDB()
export interface ExchangeResponse {
  acks: { mutationId: string; status: 'accepted' | 'conflict'; record: CloudRecord }[]
  records: CloudRecord[]; cursor: number; more: boolean
}
interface EngineDeps {
  storage: SyncDB
  collect: (owner: string) => Promise<Map<string, unknown>>
  apply: (owner: string, key: string, value: unknown, expected?: { value: unknown }) => Promise<boolean>
  mayDelete: (key: string) => Promise<boolean>
  exchange: (owner: string, changes: LocalRecord[], cursor: number) => Promise<ExchangeResponse>
  active: (owner: string) => boolean
  now?: () => number
}
function sourceTime(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const outer = value as Record<string, unknown>
  const v = outer.value && typeof outer.value === 'object' ? { ...outer, ...outer.value as Record<string, unknown> } : outer
  const state = (v.fsrsMain || v.fsrsNotebook || v.fsrs) as Record<string, unknown> | undefined
  const lastReview = state?.last_review as { $syncDate?: string } | undefined
  const stamp = Number(v.updatedAt || v.reviewedAt || v.timestamp || v.finishedAt || v.endedAt || v.addedAt || v.createdAt || v.savedAt || (lastReview?.$syncDate ? Date.parse(lastReview.$syncDate) : 0))
  return Number.isFinite(stamp) && stamp > 0 ? Math.min(stamp, Date.now()) : 0
}
export function createAccountSyncEngine(deps: EngineDeps) {
  const now = deps.now || Date.now
  async function capture(owner: string) {
    if (!deps.active(owner)) return
    const current = await deps.collect(owner)
    const cached = await deps.storage.records.where('owner').equals(owner).toArray()
    const old = new Map(cached.map(r => [r.key, r]))
    for (const [key, value] of current) {
      const row = old.get(key)
      if (row && sameValue(row.observed, value)) continue
      const modifiedAt = row ? now() : sourceTime(value)
      await deps.storage.records.put({ owner, key, value: row?.value ?? null, version: row?.version ?? 0, modifiedAt: row?.modifiedAt ?? 0,
        observed: value, pending: { key, value, baseVersion: row?.version ?? 0, mutationId: crypto.randomUUID(), modifiedAt } })
    }
    for (const row of cached) if (row.observed !== null && !current.has(row.key) && await deps.mayDelete(row.key)) {
      await deps.storage.records.put({ ...row, observed: null, pending: { key: row.key, value: null, baseVersion: row.version, mutationId: crypto.randomUUID(), modifiedAt: now() } })
    }
  }
  async function accept(owner: string, remote: CloudRecord, acceptedIds: Set<string>, currentValues: Map<string, unknown>) {
    if (!deps.active(owner)) return
    const old = await deps.storage.records.get([owner, remote.key])
    if (old && old.version > remote.version) return
    let pending = old?.pending || null
    if (pending && acceptedIds.has(pending.mutationId)) pending = null
    const resolved = reconcile(pending, remote)
    const changed = !old || !sameValue(old.observed, resolved.value)
    if (changed) {
      // Recheck immediately before replacing a local record; edits made during the request win next capture.
      const current = currentValues.get(remote.key) ?? null
      if (old && !sameValue(current, old.observed)) return
      await deps.apply(owner, remote.key, resolved.value, { value: current })
    }
    await deps.storage.records.put({ ...remote, owner, observed: resolved.value, pending: resolved.pending })
  }
  async function run(owner: string) {
    await capture(owner)
    let remoteApplied = 0
    let more = true
    while (more && deps.active(owner)) {
      const meta = await deps.storage.accounts.get(owner) || { owner, cursor: 0 }
      const rows = await deps.storage.records.where('owner').equals(owner).toArray()
      const changes = rows.flatMap(r => r.pending ? [r.pending] : []).slice(0, 250)
      const response = await deps.exchange(owner, changes, meta.cursor)
      if (!deps.active(owner)) return
      await capture(owner) // preserve changes made while network request was in flight
      const accepted = new Set(response.acks.filter(a => a.status === 'accepted').map(a => a.mutationId))
      const incoming = new Map<string, CloudRecord>()
      for (const r of [...response.acks.map(a => a.record), ...response.records]) {
        const prev = incoming.get(r.key)
        if (!prev || prev.version <= r.version) incoming.set(r.key, r)
      }
      const currentValues = await deps.collect(owner)
      for (const remote of incoming.values()) {
        const old = await deps.storage.records.get([owner, remote.key])
        if (!sameValue(old?.observed ?? null, remote.value) && !old?.pending) remoteApplied++
        await accept(owner, remote, accepted, currentValues)
      }
      await deps.storage.accounts.put({ ...meta, cursor: response.cursor })
      more = response.more || (await deps.storage.records.where('owner').equals(owner).filter(r => r.pending !== null).count()) > 0
    }
    return { remoteApplied }
  }
  return { capture, run }
}
export { SyncDB }
