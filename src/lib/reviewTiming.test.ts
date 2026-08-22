import { describe, expect, it } from 'vitest'
import { isDueNow, isDueToday } from './reviewTiming'

describe('review timing', () => {
  it('keeps a card due in ten minutes out of the ready queue but in today forecast', () => {
    const now = new Date(2026, 7, 16, 8, 0, 0, 0)
    const due = new Date(2026, 7, 16, 8, 10, 0, 0)

    expect(isDueNow(due, now)).toBe(false)
    expect(isDueToday(due, now)).toBe(true)
  })
})
