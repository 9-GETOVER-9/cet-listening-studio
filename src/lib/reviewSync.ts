import { db } from '@/db/schema'
import { supabase } from '@/lib/supabase'
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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user || !navigator.onLine) return

  await processReviewOutbox(async (job) => {
    const card = await db.cards.get(job.cardId)
    const { error } = await supabase.from('card_states').upsert({
      user_id: session.user.id,
      card_id: job.cardId,
      fsrs_main: job.fsrsState,
      ai_unlocked: card?.aiUnlocked ?? false,
      updated_at: new Date(job.reviewedAt).toISOString(),
    }, { onConflict: 'user_id,card_id' })

    if (error) throw error
  })
}
