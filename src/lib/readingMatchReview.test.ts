import { afterEach, expect, it, vi } from 'vitest'
import { getDueMatchGroups, nextMatchReviewDay, saveMatchReview } from './readingMatchReview'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('deduplicates missed groups, isolates owners and schedules review by local day', () => {
  const records = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => records.get(key), setItem: (key: string, value: string) => records.set(key, value) })
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 20, 23, 59))
  saveMatchReview('guest', ['first', 'second', 'first'])
  expect(getDueMatchGroups('guest')).toEqual([])
  vi.setSystemTime(nextMatchReviewDay())
  expect(getDueMatchGroups('guest')).toEqual(['first', 'second'])
  expect(getDueMatchGroups('other')).toEqual([])
  saveMatchReview('guest', ['first'], true)
  saveMatchReview('guest', ['second'])
  expect(getDueMatchGroups('guest')).toEqual([])
  vi.setSystemTime(nextMatchReviewDay())
  expect(getDueMatchGroups('guest')).toEqual(['second'])
})
