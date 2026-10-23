import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { db } from '@/db/schema'
import { readingDB } from './ieltsReadingStore'
import { loadTrainingDataset } from './fsrsHistory'
import { createInitialFSRSState, scheduleFSRSState } from './fsrsScheduler'
import type { Card } from '@/types'

const first = new Date('2026-01-01T00:00:00Z'), second = new Date('2026-01-03T00:00:00Z')
function state() {
  return scheduleFSRSState(scheduleFSRSState(createInitialFSRSState(first), 3, first), 1, second)
}
beforeEach(async () => { await db.delete(); await db.open(); await readingDB.delete(); await readingDB.open() })
it('loads actual logs with identity confirmation and rejects imported state gaps', async () => {
  const card = { cardId: 'c', fsrsMain: state() } as Card
  await db.cards.put(card)
  await db.studyLog.bulkAdd([
    { cardId: 'c', action: 'review', rating: 3, timestamp: +first },
    { cardId: 'c', action: 'bookmark', timestamp: +first },
    { cardId: 'c', action: 'review', rating: 1, timestamp: +second },
  ])
  expect((await loadTrainingDataset('a', 'main', false)).cards).toHaveLength(0)
  expect((await loadTrainingDataset('a', 'main', true)).cards).toHaveLength(1)
  await db.cards.update('c', { fsrsMain: { ...state(), reps: 7 } })
  expect((await loadTrainingDataset('a', 'main', true)).cards).toHaveLength(0)
})
it('excludes reading retries and other owners', async () => {
  await readingDB.progress.put({ owner: 'a', cardId: 'r', fsrs: state(), covered: [], updatedAt: +second })
  await readingDB.logs.bulkAdd([
    { owner: 'a', operationId: '1', cardId: 'r', mode: 'recall', rating: 3, selected: [], shown: [], missed: [], extra: [], passed: true, reviewedAt: +first },
    { owner: 'a', operationId: '2', cardId: 'r', mode: 'recall', rating: 1, selected: [], shown: [], missed: [], extra: [], passed: false, reviewedAt: +second },
    { owner: 'a', operationId: '3', cardId: 'r', mode: 'retry', rating: 3, selected: [], shown: [], missed: [], extra: [], passed: true, reviewedAt: +second + 1000 },
  ])
  expect((await loadTrainingDataset('a', 'reading', false)).reviews).toBe(2)
  expect((await loadTrainingDataset('b', 'reading', true)).cards).toHaveLength(0)
})
