import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { Rating } from '@/types'
import {
  createInitialFSRSState,
  previewFSRSRatings,
  scheduleFSRSState,
} from './fsrsScheduler'

describe('FSRS scheduler', () => {
  it('graduates a learning card when its learning step is preserved', () => {
    const firstReviewAt = new Date('2026-08-16T00:00:00.000Z')
    const first = scheduleFSRSState(
      createInitialFSRSState(firstReviewAt),
      Rating.Good,
      firstReviewAt,
    )

    expect(first.state).toBe(State.Learning)
    expect(first.learning_steps).toBe(1)
    expect(first.due).toEqual(new Date('2026-08-16T00:10:00.000Z'))

    const second = scheduleFSRSState(first, Rating.Good, first.due)

    expect(second.state).toBe(State.Review)
    expect(second.learning_steps).toBe(0)
    expect(second.due.getTime()).toBeGreaterThan(first.due.getTime())
  })

  it('applies the same result that was previewed at the same time', () => {
    const now = new Date('2026-08-16T00:00:00.000Z')
    const state = createInitialFSRSState(now)
    const preview = previewFSRSRatings(state, now)

    for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
      expect(scheduleFSRSState(state, rating, now)).toEqual(preview[rating])
    }

    expect(preview[Rating.Again].due.getTime()).toBeLessThan(preview[Rating.Hard].due.getTime())
    expect(preview[Rating.Hard].due.getTime()).toBeLessThan(preview[Rating.Good].due.getTime())
    expect(preview[Rating.Good].due.getTime()).toBeLessThan(preview[Rating.Easy].due.getTime())
  })
})
