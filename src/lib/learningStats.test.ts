import { describe, expect, it } from 'vitest'

import { summarizeLearningVolume } from '@/lib/learningStats'

describe('summarizeLearningVolume', () => {
  it('combines review and walkman activity into learning volume', () => {
    const summary = summarizeLearningVolume({
      reviewLogs: [
        { cardId: 'card-1', timestamp: new Date('2026-08-18T10:00:00').getTime() },
        { cardId: 'card-2', timestamp: new Date('2026-08-19T10:00:00').getTime() },
      ],
      listeningLogs: [
        { cardId: 'card-1', sentenceCount: 2, durationSeconds: 60, timestamp: new Date('2026-08-18T11:00:00').getTime() },
        { cardId: 'card-3', sentenceCount: 1, durationSeconds: 95, timestamp: new Date('2026-08-20T11:00:00').getTime() },
      ],
    })

    expect(summary.reviewCards).toBe(2)
    expect(summary.walkmanSentences).toBe(3)
    expect(summary.listeningMinutes).toBe(3)
    expect(summary.activeDays).toBe(3)
  })
})
