import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { Rating } from '@/types'
import { frequencyDB, type FrequencyProgress } from './ieltsFrequencyProgress'
import * as review from './ieltsReview'

beforeEach(async () => {
  await review.ieltsReviewDB.delete()
  await review.ieltsReviewDB.open()
  await frequencyDB.delete()
  await frequencyDB.open()
})

it('migrates legacy correct and wrong word outcomes to Good and Again using their original dates', async () => {
  const oldDate = Date.UTC(2024, 0, 1)
  const legacy: FrequencyProgress[] = [
    { owner: 'alice', cardId: 'known', passed: true, attempts: 3, mistakes: 1, reason: null, updatedAt: oldDate },
    { owner: 'alice', cardId: 'missed', passed: false, attempts: 2, mistakes: 2, reason: 'spelling', updatedAt: oldDate + 1000 },
    { owner: 'bob', cardId: 'private', passed: true, attempts: 1, mistakes: 0, reason: null, updatedAt: oldDate },
  ]
  expect(await review.migrateLegacyFrequencyProgress('alice', legacy)).toBe(2)
  expect(await review.migrateLegacyFrequencyProgress('alice', legacy)).toBe(0)
  const rows = await review.listIELTSReviewProgress('alice', 'frequency')
  expect(rows).toHaveLength(2)
  expect(rows.find(row => row.itemId === 'known')).toMatchObject({ lastRating: Rating.Good, updatedAt: oldDate })
  expect(rows.find(row => row.itemId === 'missed')).toMatchObject({ lastRating: Rating.Again, updatedAt: oldDate + 1000 })
  expect(rows.find(row => row.itemId === 'known')!.fsrs.due.getTime()).toBeLessThan(Date.now())
  expect(await review.listIELTSReviewProgress('bob', 'frequency')).toEqual([])
})

it('schedules four ratings once per operation and rejects reusing an operation id for another result', async () => {
  const at = new Date('2026-01-01T00:00:00.000Z')
  const first = await review.recordIELTSReview('alice', 'sentence', 'p1-a01-s005', Rating.Good, at, 'op-1')
  const duplicate = await review.recordIELTSReview('alice', 'sentence', 'p1-a01-s005', Rating.Good, at, 'op-1')
  expect(duplicate).toEqual(first)
  await expect(review.recordIELTSReview('alice', 'sentence', 'p1-a01-s006', Rating.Again, at, 'op-1')).rejects.toThrow('其他评分')
  for (const rating of [Rating.Again, Rating.Hard, Rating.Easy]) {
    const row = await review.recordIELTSReview('alice', 'cambridge', `track-${rating}`, rating, at, `track-${rating}`)
    expect(row.lastRating).toBe(rating)
    expect(row.fsrs.reps).toBe(1)
    expect(row.fsrs.due.getTime()).toBeGreaterThan(at.getTime())
  }
  expect(await review.ieltsReviewDB.logs.where('owner').equals('alice').count()).toBe(4)
})

it('counts learned, due and new items and stores the per-module resume state', async () => {
  await review.recordIELTSReview('alice', 'wanglu', 'old', Rating.Good, new Date('2024-01-01T00:00:00.000Z'), 'old-1')
  const rows = await review.listIELTSReviewProgress('alice', 'wanglu')
  expect(review.summarizeIELTSReviews(rows, 3)).toMatchObject({ learned: 1, due: 1, fresh: 2 })
  await review.saveIELTSReviewSession('alice', 'wanglu', { chapter: 3, cardId: 'fresh-2', mode: 'due' })
  expect(await review.readIELTSReviewSession('alice', 'wanglu')).toEqual({ chapter: 3, cardId: 'fresh-2', mode: 'due' })
  expect(await review.readIELTSReviewSession('bob', 'wanglu')).toBeNull()
})
