import { describe, expect, it } from 'vitest'
import { formatReviewInterval } from './reviewInterval'

describe('formatReviewInterval', () => {
  const now = new Date('2026-08-16T00:00:00.000Z')

  it.each([
    [30_000, '<1分钟'],
    [60_000, '1分钟'],
    [3_600_000, '1小时'],
    [86_400_000, '1天'],
    [2_592_000_000, '1个月'],
  ])('formats an interval of %i milliseconds', (offset, expected) => {
    expect(formatReviewInterval(new Date(now.getTime() + offset), now)).toBe(expected)
  })
})
