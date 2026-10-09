import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { historyDB, saveIELTSHistory, readIELTSHistory } from './ieltsHistory'
import * as history from './ieltsHistory'

const session = { id: 'round-1', owner: 'alice', book: 'wanglu' as const, chapter: 3, section: 'all',
  corpusVersion: 'v2', startedAt: 100, finishedAt: 200, total: 20,
  results: [{ id: 'a', answer: 'a', passed: true }, { id: 'b', answer: '', passed: false }] }

describe('durable IELTS scores', () => {
  beforeEach(async () => { await historyDB.delete(); await historyDB.open() })
  it('keeps separate started rounds distinct when their study selections match', async () => {
    expect(history.createIELTSHistorySession).toBeTypeOf('function')
    const metadata = { owner: 'guest', book: 'wanglu' as const, chapter: 3, section: 'all', corpusVersion: 'v2', total: 20 }
    const before = Date.now()
    const first = history.createIELTSHistorySession(metadata)
    const second = history.createIELTSHistorySession(metadata)
    expect(first.id).not.toBe(second.id)
    expect(first.startedAt).toBeGreaterThanOrEqual(before)
    expect(first.startedAt).toBeLessThanOrEqual(Date.now())
    expect(await readIELTSHistory('guest')).toEqual([])
    await saveIELTSHistory({ ...first, results: session.results, finishedAt: Date.now() })
    await saveIELTSHistory({ ...second, results: session.results, finishedAt: Date.now() })
    expect(await readIELTSHistory('guest')).toHaveLength(2)
  })
  it('persists partial-round accuracy across a database reopen', async () => {
    await saveIELTSHistory(session)
    historyDB.close(); await historyDB.open()
    expect(await readIELTSHistory('alice')).toMatchObject([{ answered: 2, passed: 1, failed: 1, accuracy: 50, total: 20, completed: false }])
  })
  it('records repeated finish events only once, including concurrent saves', async () => {
    await Promise.all([saveIELTSHistory(session), saveIELTSHistory(session)])
    expect(await readIELTSHistory('alice')).toHaveLength(1)
  })
  it('separates accounts and guest logs and orders newest first', async () => {
    await saveIELTSHistory(session)
    await saveIELTSHistory({ ...session, id: 'round-2', finishedAt: 300 })
    await saveIELTSHistory({ ...session, id: 'round-3', owner: 'guest' })
    expect((await readIELTSHistory('alice')).map(r => r.id)).toEqual(['round-2', 'round-1'])
    expect(await readIELTSHistory('bob')).toEqual([])
    expect(await readIELTSHistory('guest')).toHaveLength(1)
  })
  it('does not log an empty round or hide failed storage writes', async () => {
    expect(await saveIELTSHistory({ ...session, results: [] })).toBeNull()
    expect(await readIELTSHistory('alice')).toEqual([])
    await expect(saveIELTSHistory({ ...session, total: 1 })).rejects.toThrow()
  })
  it('propagates storage failures without creating a saved score', async () => {
    const write = vi.spyOn(historyDB.rounds, 'add').mockRejectedValueOnce(new Error('storage quota'))
    try {
      await expect(saveIELTSHistory(session)).rejects.toThrow('storage quota')
      expect(await readIELTSHistory('alice')).toEqual([])
    } finally { write.mockRestore() }
  })
})
