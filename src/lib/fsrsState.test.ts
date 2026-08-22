import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { normalizeFSRSState } from './fsrsState'

describe('normalizeFSRSState', () => {
  it('preserves legacy memory data while adding the missing learning step', () => {
    const due = '2026-08-18T00:10:00.000Z'
    const lastReview = '2026-08-16T00:10:00.000Z'

    const normalized = normalizeFSRSState({
      due,
      stability: 3.2,
      difficulty: 5.6,
      elapsed_days: 2,
      scheduled_days: 2,
      reps: 3,
      lapses: 1,
      state: State.Review,
      last_review: lastReview,
    })

    expect(normalized).toEqual({
      due: new Date(due),
      stability: 3.2,
      difficulty: 5.6,
      elapsed_days: 2,
      scheduled_days: 2,
      reps: 3,
      lapses: 1,
      learning_steps: 0,
      state: State.Review,
      last_review: new Date(lastReview),
    })
  })
})
