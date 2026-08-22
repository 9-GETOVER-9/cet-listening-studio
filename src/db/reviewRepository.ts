import { db } from '@/db/schema'
import { scheduleFSRSState } from '@/lib/fsrsScheduler'
import type { FSRSState, Rating, SyncOutboxItem } from '@/types'

export interface CommitCardRatingInput {
  cardId: string
  rating: Rating
  operationId: string
  reviewedAt: Date
}

export interface CommitCardRatingResult {
  operationId: string
  fsrsState: FSRSState
}

export async function commitCardRating({
  cardId,
  rating,
  operationId,
  reviewedAt,
}: CommitCardRatingInput): Promise<CommitCardRatingResult> {
  const result = await db.transaction(
    'rw',
    [db.cards, db.studyLog, db.syncOutbox],
    async () => {
      const existingJob = await db.syncOutbox.get(operationId)
      if (existingJob) {
        return {
          operationId,
          fsrsState: existingJob.fsrsState,
        }
      }

      const card = await db.cards.get(cardId)
      if (!card) {
        throw new Error(`Card not found: ${cardId}`)
      }

      const fsrsState = scheduleFSRSState(card.fsrsMain, rating, reviewedAt)
      const timestamp = reviewedAt.getTime()
      const syncJob: SyncOutboxItem = {
        operationId,
        kind: 'card-review',
        cardId,
        rating,
        reviewedAt: timestamp,
        fsrsState,
        attempts: 0,
        nextAttemptAt: timestamp,
        createdAt: timestamp,
      }

      await db.cards.update(cardId, { fsrsMain: fsrsState })
      await db.studyLog.add({
        operationId,
        cardId,
        action: 'review',
        rating,
        timestamp,
      })
      await db.syncOutbox.where('cardId').equals(cardId).delete()
      await db.syncOutbox.add(syncJob)

      return { operationId, fsrsState }
    },
  )

  void import('@/lib/reviewSync')
    .then(({ processReviewOutboxForCurrentUser }) => processReviewOutboxForCurrentUser())
    .catch(() => {})

  return result
}
