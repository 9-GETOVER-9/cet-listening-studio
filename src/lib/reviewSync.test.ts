import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { db } from '@/db/schema'
import { processReviewOutbox } from './reviewSync'
import { Rating, type SyncOutboxItem } from '@/types'

const job: SyncOutboxItem = {
  operationId: 'operation-1',
  kind: 'card-review',
  cardId: 'card-1',
  rating: Rating.Good,
  reviewedAt: 1_000,
  fsrsState: {
    due: new Date(2_000), stability: 1, difficulty: 5,
    elapsed_days: 0, scheduled_days: 1, reps: 1, lapses: 0,
    learning_steps: 1, state: State.Learning, last_review: new Date(1_000),
  },
  attempts: 0,
  nextAttemptAt: 1_000,
  createdAt: 1_000,
}

describe('processReviewOutbox', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.syncOutbox.put(structuredClone(job))
  })

  it('keeps a failed upload and schedules an exponential retry', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('offline'))
    await processReviewOutbox(upload, 2_000)

    const saved = await db.syncOutbox.get(job.operationId)
    expect(saved?.attempts).toBe(1)
    expect(saved?.nextAttemptAt).toBe(62_000)
  })

  it('removes a job only after a successful upload', async () => {
    const upload = vi.fn().mockResolvedValue(undefined)
    await processReviewOutbox(upload, 2_000)

    expect(upload).toHaveBeenCalledOnce()
    await expect(db.syncOutbox.count()).resolves.toBe(0)
  })
})
