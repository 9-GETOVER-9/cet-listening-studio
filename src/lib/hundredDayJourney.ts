import { getLocalDateStr } from '@/lib/utils'

export type CompletionFeedbackKind = 'daily' | 'weekly'

export interface JourneyProgress {
  completedDays: number
  currentStreak: number
  dayOfHundred: number
  progressPercent: number
  isHundredComplete: boolean
}

function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

function diffDays(laterDateStr: string, earlierDateStr: string): number {
  return Math.round((parseLocalDate(laterDateStr).getTime() - parseLocalDate(earlierDateStr).getTime()) / 86400000)
}

export function normalizeCompletionDates(completionDates: string[]): string[] {
  return Array.from(new Set(completionDates)).sort()
}

export function buildJourneyProgress(
  completionDates: string[],
  todayStr = getLocalDateStr(),
): JourneyProgress {
  const dates = normalizeCompletionDates(completionDates)
  const completedDays = dates.length
  const dayOfHundred = Math.min(completedDays, 100)
  const lastDate = dates.at(-1)
  let currentStreak = 0

  if (lastDate && diffDays(todayStr, lastDate) <= 1) {
    currentStreak = 1
    for (let index = dates.length - 2; index >= 0; index -= 1) {
      if (diffDays(dates[index + 1], dates[index]) !== 1) break
      currentStreak += 1
    }
  }

  return {
    completedDays,
    currentStreak,
    dayOfHundred,
    progressPercent: Math.min(100, dayOfHundred),
    isHundredComplete: completedDays >= 100,
  }
}

export function getCompletionFeedbackKind(completedDays: number): CompletionFeedbackKind {
  return completedDays > 0 && completedDays % 7 === 0 ? 'weekly' : 'daily'
}
