import { expect, it } from 'vitest'
import { getDailyEncouragement } from './dailyEncouragement'

it('keeps a daily encouragement stable and changes it on the next day', () => {
  const today = new Date(2026, 9, 7, 1)
  expect(getDailyEncouragement(today)).toBe(getDailyEncouragement(new Date(2026, 9, 7, 23)))
  expect(getDailyEncouragement(today).length).toBeGreaterThan(10)
  expect(getDailyEncouragement(today)).not.toBe(getDailyEncouragement(new Date(2026, 9, 8)))
})
