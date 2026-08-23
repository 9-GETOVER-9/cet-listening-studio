import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/schema'
import { clearAllData } from './dataLoader'

describe('clearAllData', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('removes pending review synchronization jobs', async () => {
    await db.syncOutbox.put({
      operationId: 'pending-review',
      kind: 'card-review',
      cardId: 'card-1',
      rating: 3,
      reviewedAt: Date.now(),
      fsrsState: {
        due: new Date(),
        stability: 1,
        difficulty: 1,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 1,
        lapses: 0,
        learning_steps: 0,
        state: 2,
      },
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
    })

    await clearAllData()

    await expect(db.syncOutbox.count()).resolves.toBe(0)
  })
})
