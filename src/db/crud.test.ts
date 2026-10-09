import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import {
  addListeningLog,
  getHundredDayCompletionDates,
  getLearningVolumeSummary,
  getAdjacentCards,
  getModuleCards,
  getModuleStats,
  mergeCards,
  recordDailyTaskCompletion,
} from './crud'
import { createInitialFSRSState } from '@/lib/fsrs'
import type { Card } from '@/types'

function makeCard(cardId: string, seq: number, englishText: string, chineseText: string): Card {
  return {
    cardId,
    moduleId: 'module-1',
    audioFile: `${cardId}.mp3`,
    englishText,
    chineseText,
    tags: [],
    difficulty: 'basic',
    aiAnalysis: { phrases: [], pronunciation: [], grammar: [] },
    level: 'CET4',
    fsrsMain: createInitialFSRSState(),
    seq,
  }
}

describe('module learning cards', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('matches the sentence count while retaining title data and merged progress', async () => {
    const title = { ...makeCard('title', 0, 'Lesson title', '课标题'), isTitle: true }
    const merged = {
      ...makeCard('merged', 1000.5, 'One. Two.', '一。二。'),
      isMerged: true,
      mergedFrom: ['old-1', 'old-2'],
      mergedAudioFiles: ['old-1.mp3', 'old-2.mp3'],
      fsrsMain: { ...createInitialFSRSState(), reps: 3 },
    }
    await db.cards.bulkPut([makeCard('last', 3000, 'Three.', '三。'), title, merged])
    await db.studyLog.add({ cardId: 'title', action: 'review', rating: 3, timestamp: 1000 })

    const cards = await getModuleCards('module-1')
    expect(cards.map(card => card.cardId)).toEqual(['merged', 'last'])
    expect(cards[0]).toEqual(merged)
    expect((await getModuleStats('module-1')).total).toBe(cards.length)
    expect(await db.cards.get('title')).toEqual(title)
    expect(await db.studyLog.count()).toBe(1)
  })

  it('never offers a title or an unknown current card as a merge neighbour', async () => {
    await db.cards.bulkPut([
      { ...makeCard('title', 0, 'Lesson title', '课标题'), isTitle: true },
      makeCard('first', 1000, 'One.', '一。'),
      makeCard('last', 2000, 'Two.', '二。'),
    ])
    expect(await getAdjacentCards('first', 'module-1')).toMatchObject({ prev: null, next: { cardId: 'last' } })
    expect(await getAdjacentCards('title', 'module-1')).toEqual({ prev: null, next: null })
    expect(await getAdjacentCards('missing', 'module-1')).toEqual({ prev: null, next: null })
  })

  it('rejects merging a title without modifying any stored cards', async () => {
    const cards = [
      { ...makeCard('title', 0, 'Lesson title', '课标题'), isTitle: true },
      makeCard('first', 1000, 'One.', '一。'),
    ]
    await db.cards.bulkPut(cards)
    await expect(mergeCards(['title', 'first'])).rejects.toThrow('标题卡不能参与句子拼接')
    expect(await db.cards.count()).toBe(2)
    expect(await db.cards.get('first')).toEqual(cards[1])
  })
})

describe('mergeCards', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('merges selected cards in their original module order instead of click order', async () => {
    await db.cards.bulkPut([
      makeCard('card-1', 1000, 'One.', '一。'),
      makeCard('card-2', 2000, 'Two.', '二。'),
      makeCard('card-3', 3000, 'Three.', '三。'),
    ])

    const merged = await mergeCards(['card-1', 'card-3', 'card-2'])

    expect(merged.englishText).toBe('One. Two. Three.')
    expect(merged.chineseText).toBe('一。 二。 三。')
    expect(merged.mergedFrom).toEqual(['card-1', 'card-2', 'card-3'])
    expect(merged.mergedAudioFiles).toEqual(['card-1.mp3', 'card-2.mp3', 'card-3.mp3'])
    expect(merged.audioFile).toBe('card-1.mp3')
  })
})

describe('daily completion records', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('records a completed review day only once', async () => {
    const first = await recordDailyTaskCompletion('2026-08-24')
    const second = await recordDailyTaskCompletion('2026-08-24')

    await expect(getHundredDayCompletionDates()).resolves.toEqual(['2026-08-24'])
    expect(first.isNewCompletion).toBe(true)
    expect(second.isNewCompletion).toBe(false)
    expect(second.progress.completedDays).toBe(1)
  })
})

describe('learning volume', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('summarizes reviews and walkman listening in a date range', async () => {
    await db.studyLog.bulkAdd([
      { cardId: 'card-1', action: 'review', timestamp: new Date('2026-08-18T10:00:00').getTime() },
      { cardId: 'card-2', action: 'review', timestamp: new Date('2026-08-19T10:00:00').getTime() },
    ])
    await addListeningLog({
      cardId: 'card-3',
      sentenceCount: 2,
      durationSeconds: 80,
      timestamp: new Date('2026-08-20T10:00:00').getTime(),
    })

    const summary = await getLearningVolumeSummary(
      new Date('2026-08-18T00:00:00'),
      new Date('2026-08-24T23:59:59'),
    )

    expect(summary.reviewCards).toBe(2)
    expect(summary.walkmanSentences).toBe(2)
    expect(summary.listeningMinutes).toBe(2)
    expect(summary.activeDays).toBe(3)
  })
})
