import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createAccountSyncEngine, SyncDB, type ExchangeResponse } from './accountSyncEngine'
import type { CloudRecord, LocalRecord } from './accountSyncProtocol'

const stores: SyncDB[] = []
afterEach(async () => { for (const s of stores) await s.delete(); stores.length = 0 })
function cloud() {
  const rows = new Map<string, CloudRecord>(); let version = 0
  const ops = new Map<string, ExchangeResponse['acks'][number]>()
  return async (owner: string, changes: LocalRecord[], cursor: number): Promise<ExchangeResponse> => {
    const acks = changes.map(c => {
      const id = owner + c.mutationId
      if (ops.has(id)) return ops.get(id)!
      const key = owner + c.key, old = rows.get(key)
      if ((old?.version || 0) !== c.baseVersion) return { mutationId: c.mutationId, status: 'conflict' as const, record: old! }
      const record = { key: c.key, value: c.value, version: ++version, modifiedAt: c.modifiedAt }
      rows.set(key, record)
      const ack = { mutationId: c.mutationId, status: 'accepted' as const, record }; ops.set(id, ack); return ack
    })
    return { acks, records: [...rows].filter(([k, v]) => k.startsWith(owner) && v.version > cursor).map(([, v]) => v), cursor: version, more: false }
  }
}
function device(exchange: ReturnType<typeof cloud>, owner = 'alice') {
  const storage = new SyncDB(crypto.randomUUID()); stores.push(storage)
  const data = new Map<string, unknown>(); let active = owner
  const engine = createAccountSyncEngine({ storage, exchange, collect: async () => new Map(data),
    apply: async (_, k, v) => { if (v === null) data.delete(k); else data.set(k, v); return true },
    mayDelete: async () => true, active: o => o === active, now: () => 100 })
  return { ...engine, storage, data, deactivate: () => { active = '' } }
}
describe('durable per-record account sync', () => {
  it('resumes another device, propagates deletions, and keeps another account isolated', async () => {
    const exchange = cloud(), phone = device(exchange), pc = device(exchange), bob = device(exchange, 'bob')
    phone.data.set('frequency/progress/a', { passed: true, updatedAt: 10 })
    await phone.run('alice'); await pc.run('alice'); await bob.run('bob')
    expect(pc.data.get('frequency/progress/a')).toEqual({ passed: true, updatedAt: 10 })
    expect(bob.data.size).toBe(0)
    phone.data.delete('frequency/progress/a'); await phone.run('alice'); await pc.run('alice')
    expect(pc.data.size).toBe(0)
  })
  it('retries the same durable operation after network failure without duplicates', async () => {
    const exchange = cloud(); let fail = true
    const pc = device(async (...args) => { const result = await exchange(...args); if (fail) { fail = false; throw new Error('offline') }; return result })
    pc.data.set('study/a', { timestamp: 10 })
    await expect(pc.run('alice')).rejects.toThrow('offline')
    const before = (await pc.storage.records.toArray())[0].pending?.mutationId
    expect(before).toBeTruthy()
    await pc.run('alice')
    expect((await pc.storage.records.toArray())[0].version).toBe(1)
    expect((await pc.storage.records.toArray())[0].pending).toBeNull()
  })
  it('preserves changes made while a request is in flight', async () => {
    const exchange = cloud(); let change = true
    const pc = device(async (...args) => { const result = await exchange(...args); if (change) { change = false; pc.data.set('card/a', { reps: 2 }) }; return result })
    pc.data.set('card/a', { reps: 1 })
    await pc.run('alice')
    const phone = device(exchange); await phone.run('alice')
    expect(phone.data.get('card/a')).toEqual({ reps: 2 })
  })
  it('does not apply an in-flight response after account changed', async () => {
    const exchange = cloud(); const phone = device(exchange)
    phone.data.set('card/a', { reps: 1 }); await phone.run('alice')
    const pc = device(async (...args) => { const result = await exchange(...args); pc.deactivate(); return result })
    await pc.run('alice'); expect(pc.data.size).toBe(0)
  })
})
