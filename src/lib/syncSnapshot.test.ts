import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { db } from '@/db/schema'
import { createInitialFSRSState } from '@/lib/fsrsScheduler'
import { applyRemoteCardSnapshotToLocal, type CardStateRow } from './sync'
import type { Card, FSRSState } from '@/types'

function reviewedState(reviewedAt: Date): FSRSState {
  return {
    due: new Date(reviewedAt.getTime() + 86_400_000),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    learning_steps: 1,
    state: State.Learning,
    last_review: reviewedAt,
  }
}

function card(cardId: string, fsrsMain: FSRSState): Card {
  return {
    cardId,
    moduleId: 'module-1',
    audioFile: '',
    englishText: '',
    chineseText: '',
    tags: [],
    difficulty: 'basic',
    aiAnalysis: { phrases: [], pronunciation: [], grammar: [] },
    fsrsMain,
    level: 'CET4',
  }
}

describe('applyRemoteCardSnapshotToLocal', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('makes local cards exactly match the remote card progress snapshot', async () => {
    const remoteState = reviewedState(new Date('2026-08-26T08:00:00.000Z'))
    await db.cards.bulkPut([
      card('card-from-phone', createInitialFSRSState(new Date('2026-08-20T00:00:00.000Z'))),
      card('extra-computer-card', reviewedState(new Date('2026-08-25T08:00:00.000Z'))),
    ])

    const remoteRows: CardStateRow[] = [
      {
        card_id: 'card-from-phone',
        fsrs_main: remoteState,
        ai_unlocked: true,
        updated_at: '2026-08-26T08:00:00.000Z',
      },
    ]

    const result = await applyRemoteCardSnapshotToLocal(remoteRows)

    const phoneCard = await db.cards.get('card-from-phone')
    const extraComputerCard = await db.cards.get('extra-computer-card')
    expect(result).toEqual({ cardsApplied: 1, cardsReset: 1 })
    expect(phoneCard?.fsrsMain.reps).toBe(1)
    expect(phoneCard?.aiUnlocked).toBe(true)
    expect(extraComputerCard?.fsrsMain.reps).toBe(0)
    expect(extraComputerCard?.aiUnlocked).toBe(false)
  })
})
