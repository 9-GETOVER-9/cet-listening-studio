import { describe, expect, it } from 'vitest'

import {
  buildJourneyProgress,
  getCompletionFeedbackKind,
} from '@/lib/hundredDayJourney'

describe('hundred day journey', () => {
  it('keeps accumulated completion days when the streak is broken', () => {
    const progress = buildJourneyProgress([
      '2026-08-20',
      '2026-08-21',
      '2026-08-23',
    ], '2026-08-24')

    expect(progress.completedDays).toBe(3)
    expect(progress.currentStreak).toBe(1)
    expect(progress.dayOfHundred).toBe(3)
  })

  it('counts today in the current streak when today has been completed', () => {
    const progress = buildJourneyProgress([
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
    ], '2026-08-24')

    expect(progress.completedDays).toBe(3)
    expect(progress.currentStreak).toBe(3)
  })

  it('shows a weekly review on each seventh completion day', () => {
    expect(getCompletionFeedbackKind(7)).toBe('weekly')
    expect(getCompletionFeedbackKind(14)).toBe('weekly')
    expect(getCompletionFeedbackKind(15)).toBe('daily')
  })
})
