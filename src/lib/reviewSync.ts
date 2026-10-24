import { db } from '@/db/schema'
import type { SyncOutboxItem } from '@/types'

export type ReviewUploader = (job: SyncOutboxItem) => Promise<void>

const BASE_RETRY_MS = 60_000
const MAX_RETRY_MS = 60 * 60_000

export async function processReviewOutbox(
  upload: ReviewUploader,
  now = Date.now(),
): Promise<void> {
  const jobs = await db.syncOutbox
    .where('nextAttemptAt')
    .belowOrEqual(now)
    .sortBy('createdAt')

  for (const job of jobs) {
    try {
      await upload(job)
      await db.syncOutbox.delete(job.operationId)
    } catch {
      const attempts = job.attempts + 1
      const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** job.attempts)
      await db.syncOutbox.update(job.operationId, {
        attempts,
        nextAttemptAt: now + delay,
      })
    }
  }
}

export async function processReviewOutboxForCurrentUser(): Promise<void> {
  // The unified journal owns account attribution and retry. Legacy unowned jobs are never sent as a new user.
  const { syncAccountNow } = await import('./accountSync')
  await syncAccountNow()
}
