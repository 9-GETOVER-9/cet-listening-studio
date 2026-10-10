import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { readingDB, saveReadingAnnotation, readReadingSnapshot, commitReadingReview, exportReadingBackup, restoreReadingBackup, saveReadingSession } from './ieltsReadingStore'
import type { ReadingCard } from './ieltsReading'
import { Rating } from '@/types'

const card: ReadingCard = { id: 'domestic', word: 'domestic', meaning: '家庭的；国内的', category: 1, order: 0, sourceRow: 1, relation: 'lexical', status: 'verified', expressions: [{ id: 'home', text: 'home' }] }
beforeEach(async () => { await readingDB.delete(); await readingDB.open() })
const review = { owner: 'alice', operationId: 'r1', card, question: { cardId: card.id, options: [{ id: 'home', text: 'home', correct: true }] }, rating: Rating.Again, mode: 'quiz' as const, selected: [], shown: ['home'], missed: ['home'], extra: [], passed: false, reviewedAt: new Date('2026-10-09T04:00:00Z') }

it('merges notes and individual marks without creating progress, and isolates owners', async () => {
  await saveReadingAnnotation('alice', card, { note: '我的笔记' })
  await saveReadingAnnotation('alice', card, { marked: ['home'] })
  const a = await readReadingSnapshot('alice')
  expect(a.annotations[0]).toMatchObject({ note: '我的笔记', marked: ['home'] })
  expect(a.progress).toEqual([])
  expect((await readReadingSnapshot('bob')).annotations).toEqual([])
  await expect(saveReadingAnnotation('alice', card, { marked: ['unknown'] })).rejects.toThrow()
})
it('persists a failed rating atomically and deduplicates double submissions', async () => {
  await Promise.all([commitReadingReview(review), commitReadingReview(review)])
  readingDB.close(); await readingDB.open()
  const data = await readReadingSnapshot('alice')
  expect(data.progress).toHaveLength(1)
  expect(data.progress[0].fsrs.reps).toBe(1)
  expect(data.logs).toHaveLength(1)
  expect(data.progress[0].covered).toEqual(['home'])
  expect(data.logs[0]).toMatchObject({ passed: false, missed: ['home'] })
  expect(data.logs[0].question).toEqual(review.question)
  await expect(commitReadingReview({ ...review, operationId: 'bad', rating: Rating.Hard })).rejects.toThrow()
})
it('rolls back progress when log persistence fails and retries once', async () => {
  const spy = vi.spyOn(readingDB.logs, 'add').mockRejectedValueOnce(new Error('quota'))
  await expect(commitReadingReview(review)).rejects.toThrow('quota')
  spy.mockRestore()
  expect((await readReadingSnapshot('alice')).progress).toEqual([])
  await commitReadingReview(review)
  expect((await readReadingSnapshot('alice')).progress[0].fsrs.reps).toBe(1)
})
it('retry practice logs results without altering FSRS', async () => {
  await commitReadingReview(review)
  const previous = (await readReadingSnapshot('alice')).progress
  await commitReadingReview({ ...review, operationId: 'practice', mode: 'retry', rating: Rating.Good, selected: ['home'], missed: [], passed: true })
  expect((await readReadingSnapshot('alice')).progress).toEqual(previous)
  expect((await readReadingSnapshot('alice')).logs).toHaveLength(2)
})
it('restores validated backups to current owner without changing another owner', async () => {
  await commitReadingReview(review)
  await saveReadingAnnotation('alice', card, { note: '备份内容', marked: ['home'] })
  const backup = await exportReadingBackup('alice')
  await restoreReadingBackup('bob', backup, [card])
  expect((await readReadingSnapshot('bob')).annotations[0].note).toBe('备份内容')
  expect((await readReadingSnapshot('alice')).logs).toHaveLength(1)
  const broken = { ...backup, progress: [{ ...backup.progress[0], fsrs: { ...backup.progress[0].fsrs, reps: -1 } }] }
  await expect(restoreReadingBackup('bob', broken, [card])).rejects.toThrow()
  expect((await readReadingSnapshot('bob')).progress[0].fsrs.reps).toBe(1)
})
it('stores and restores active sessions for one owner independently', async () => {
  const session = { owner: 'alice', id: 'round', mode: 'quiz' as const, cardIds: ['domestic'], cursor: 0, selected: ['home'], revealed: false, graded: false, completed: 0, correct: 0, createdAt: Date.now() }
  await saveReadingSession(session)
  readingDB.close(); await readingDB.open()
  expect((await readReadingSnapshot('alice')).session).toEqual(session)
  expect((await readReadingSnapshot('bob')).session).toBeUndefined()
})
it('rejects unknown selected answers and incomplete omission logs before replacing records', async () => {
  await commitReadingReview(review)
  const backup = await exportReadingBackup('alice')
  const unknown = { ...backup, logs: [{ ...backup.logs[0], selected: ['not-in-corpus'], extra: ['not-in-corpus'] }] }
  await expect(restoreReadingBackup('alice', unknown, [card])).rejects.toThrow()
  const inconsistent = { ...backup, logs: [{ ...backup.logs[0], selected: [], missed: [], passed: true, rating: Rating.Good }] }
  await expect(restoreReadingBackup('alice', inconsistent, [card])).rejects.toThrow()
  expect((await readReadingSnapshot('alice')).logs).toHaveLength(1)
})
it('rejects backup quiz selections lacking a saved question', async () => {
  const session = { owner: 'alice', id: 'round', mode: 'quiz' as const, cardIds: ['domestic'], cursor: 0, selected: ['home'], revealed: false, graded: false, completed: 0, correct: 0, createdAt: Date.now() }
  await saveReadingSession(session)
  const backup = await exportReadingBackup('alice')
  await expect(restoreReadingBackup('bob', backup, [card])).rejects.toThrow()
})
