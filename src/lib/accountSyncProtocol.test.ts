import { describe, expect, it } from 'vitest'
import { reconcile, serialize, deserialize, type LocalRecord, type CloudRecord } from './accountSyncProtocol'

describe('account sync protocol', () => {
  const local: LocalRecord = { key: 'card/a', value: { reps: 2 }, baseVersion: 1, mutationId: 'local', modifiedAt: 30 }
  const remote: CloudRecord = { key: 'card/a', value: { reps: 1 }, version: 2, modifiedAt: 20 }
  it('rebases a newer offline review rather than losing it to a concurrent snapshot', () => {
    const result = reconcile(local, remote)
    expect(result.pending?.value).toEqual({ reps: 2 })
    expect(result.pending?.baseVersion).toBe(2)
    expect(result.pending?.mutationId).not.toBe('local')
  })
  it('older device accepts a newer cloud review and remote deletion', () => {
    expect(reconcile({ ...local, modifiedAt: 10 }, remote).pending).toBeNull()
    expect(reconcile({ ...local, modifiedAt: 10 }, { ...remote, value: null }).value).toBeNull()
  })
  it('round trips nested FSRS dates and never interprets arbitrary answer strings as dates', () => {
    const date = new Date('2026-10-24T01:00:00Z')
    expect(deserialize(serialize({ fsrs: { due: date }, answer: date.toISOString() }))).toEqual({ fsrs: { due: date }, answer: date.toISOString() })
  })
})
