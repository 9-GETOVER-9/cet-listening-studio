import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { db } from './schema'
import { commitCardRating } from './reviewRepository'
import { Rating, type Card } from '@/types'

const card: Card = {
  cardId: 'card-1',
  moduleId: 'module-1',
  audioFile: 'card-1.mp3',
  englishText: 'Hello',
  chineseText: '你好',
  tags: [],
  difficulty: 'basic',
  aiAnalysis: { phrases: [], pronunciation: [], grammar: [] },
  level: 'CET4',
  fsrsMain: {
    due: new Date('2026-08-16T00:00:00.000Z'),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: State.New,
  },
}

describe('commitCardRating', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.cards.put(structuredClone(card))
  })

  it('atomically saves the scheduled card, review log, and sync job', async () => {
    const result = await commitCardRating({
      cardId: card.cardId,
      rating: Rating.Good,
      operationId: 'review-operation-1',
      reviewedAt: new Date('2026-08-16T00:00:00.000Z'),
    })

    const savedCard = await db.cards.get(card.cardId)
    const logs = await db.studyLog.toArray()
    const jobs = await db.syncOutbox.toArray()

    expect(savedCard?.fsrsMain).toEqual(result.fsrsState)
    expect(logs).toMatchObject([{
      operationId: 'review-operation-1',
      cardId: card.cardId,
      rating: Rating.Good,
      action: 'review',
    }])
    expect(jobs).toMatchObject([{
      operationId: 'review-operation-1',
      cardId: card.cardId,
      kind: 'card-review',
      attempts: 0,
    }])
  })

  it('does not apply the same review operation twice', async () => {
    const input = {
      cardId: card.cardId,
      rating: Rating.Good,
      operationId: 'review-operation-duplicate',
      reviewedAt: new Date('2026-08-16T00:00:00.000Z'),
    }

    const first = await commitCardRating(input)
    const second = await commitCardRating(input)

    expect(second).toEqual(first)
    await expect(db.studyLog.count()).resolves.toBe(1)
    await expect(db.syncOutbox.count()).resolves.toBe(1)
  })

  it('keeps only the newest pending sync state for a card', async () => {
    await commitCardRating({
      cardId: card.cardId,
      rating: Rating.Again,
      operationId: 'review-operation-old',
      reviewedAt: new Date('2026-08-16T00:00:00.000Z'),
    })
    await commitCardRating({
      cardId: card.cardId,
      rating: Rating.Good,
      operationId: 'review-operation-new',
      reviewedAt: new Date('2026-08-16T00:01:00.000Z'),
    })

    const jobs = await db.syncOutbox.toArray()
    expect(jobs.map((item) => item.operationId)).toEqual(['review-operation-new'])
    await expect(db.studyLog.count()).resolves.toBe(2)
  })
})
