import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { db } from '@/db/schema'
import { getDueCardsNow, getTodayDueCards } from './fsrs'
import type { Card, FSRSState } from '@/types'

function fsrsState(due: Date): FSRSState {
  return {
    due,
    stability: 1,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    learning_steps: 0,
    state: State.Review,
    last_review: new Date('2026-09-03T08:00:00'),
  }
}

function card(cardId: string, due: Date): Card {
  return {
    cardId,
    moduleId: 'module-1',
    audioFile: `${cardId}.mp3`,
    englishText: `${cardId} sentence`,
    chineseText: `${cardId} 中文`,
    tags: [],
    difficulty: 'basic',
    aiAnalysis: { phrases: [], pronunciation: [], grammar: [] },
    fsrsMain: fsrsState(due),
    level: 'NCE',
  }
}

describe('due review queue', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('includes cards due later today in the user-facing review queue', async () => {
    const alreadyDue = new Date(Date.now() - 60_000)
    const laterToday = new Date()
    laterToday.setHours(23, 59, 0, 0)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(8, 0, 0, 0)

    await db.cards.bulkPut([
      card('already-due', alreadyDue),
      card('later-today', laterToday),
      card('tomorrow', tomorrow),
    ])

    await expect(getDueCardsNow(undefined, undefined, true).then((cards) => cards.map((item) => item.cardId)))
      .resolves.toEqual(['already-due'])
    await expect(getTodayDueCards(undefined, undefined, true).then((cards) => cards.map((item) => item.cardId)))
      .resolves.toEqual(['already-due', 'later-today'])
  })
})
