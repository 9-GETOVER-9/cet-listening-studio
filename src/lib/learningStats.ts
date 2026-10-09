import { getLocalDateStr } from '@/lib/utils'

export interface LearningVolumeReviewLog {
  cardId: string
  timestamp: number
}

export interface LearningVolumeListeningLog {
  cardId: string
  sentenceCount: number
  durationSeconds: number
  timestamp: number
}

export interface LearningVolumeSummary {
  activeDays: number
  reviewCards: number
  walkmanSentences: number
  listeningMinutes: number
}

export function summarizeLearningVolume({
  reviewLogs,
  listeningLogs,
}: {
  reviewLogs: LearningVolumeReviewLog[]
  listeningLogs: LearningVolumeListeningLog[]
}): LearningVolumeSummary {
  const activeDates = new Set<string>()
  const reviewedCards = new Set<string>()
  let walkmanSentences = 0
  let durationSeconds = 0

  for (const log of reviewLogs) {
    reviewedCards.add(log.cardId)
    activeDates.add(getLocalDateStr(new Date(log.timestamp)))
  }

  for (const log of listeningLogs) {
    walkmanSentences += log.sentenceCount
    durationSeconds += log.durationSeconds
    activeDates.add(getLocalDateStr(new Date(log.timestamp)))
  }

  return {
    activeDays: activeDates.size,
    reviewCards: reviewedCards.size,
    walkmanSentences,
    listeningMinutes: Math.ceil(durationSeconds / 60),
  }
}
