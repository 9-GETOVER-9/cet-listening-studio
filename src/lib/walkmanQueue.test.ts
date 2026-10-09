import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import {
  buildNotebookWalkmanTracks,
  buildReviewWalkmanTracks,
  getWrappedWalkmanIndex,
  removeWalkmanTrack,
} from './walkmanQueue'
import type { Card, FSRSState, NotebookItem } from '@/types'

const fsrsState: FSRSState = {
  due: new Date('2026-09-03T00:00:00.000Z'),
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 1,
  reps: 1,
  lapses: 0,
  learning_steps: 0,
  state: State.Review,
  last_review: new Date('2026-09-02T00:00:00.000Z'),
}

function card(cardId: string, audioFile = `${cardId}.mp3`): Card {
  return {
    cardId,
    moduleId: 'module-1',
    audioFile,
    englishText: `${cardId} sentence`,
    chineseText: `${cardId} 中文`,
    tags: [],
    difficulty: 'basic',
    aiAnalysis: { phrases: [], pronunciation: [], grammar: [] },
    fsrsMain: fsrsState,
    level: 'CET4',
  }
}

function notebook(notebookId: string, sourceCardId: string, type: NotebookItem['type']): NotebookItem {
  return {
    notebookId,
    type,
    content: `${sourceCardId} collected sentence`,
    exampleSentence: `${sourceCardId} example`,
    sourceCardId,
    sourceTag: 'NCE Book1 Lesson 1',
    fsrsNotebook: fsrsState,
    createdAt: 1,
  }
}

describe('walkman queue', () => {
  it('builds review walkman tracks from cards with playable audio', () => {
    const tracks = buildReviewWalkmanTracks([
      card('card-1'),
      card('card-2', ''),
    ])

    expect(tracks.map((track) => track.id)).toEqual(['card:card-1'])
    expect(tracks[0]).toMatchObject({
      cardId: 'card-1',
      englishText: 'card-1 sentence',
      sourceLabel: 'CET4',
    })
  })

  it('builds notebook walkman tracks only for pronunciation items with source audio', () => {
    const cards = new Map([
      ['card-1', card('card-1')],
      ['card-2', card('card-2')],
    ])

    const tracks = buildNotebookWalkmanTracks([
      notebook('note-1', 'card-1', 'pronunciation'),
      notebook('note-2', 'card-2', 'phrase'),
    ], cards)

    expect(tracks.map((track) => track.id)).toEqual(['notebook:note-1'])
    expect(tracks[0]).toMatchObject({
      notebookId: 'note-1',
      cardId: 'card-1',
      englishText: 'card-1 example',
      sourceLabel: 'NCE Book1 Lesson 1',
    })
  })

  it('removes a track and keeps the next current index in range', () => {
    const tracks = buildReviewWalkmanTracks([card('card-1'), card('card-2'), card('card-3')])

    expect(removeWalkmanTrack(tracks, 'card:card-2', 1)).toMatchObject({
      nextIndex: 1,
      tracks: [
        { id: 'card:card-1' },
        { id: 'card:card-3' },
      ],
    })
    expect(removeWalkmanTrack(tracks, 'card:card-3', 2)).toMatchObject({
      nextIndex: 1,
    })
  })

  it('wraps walkman navigation at both ends', () => {
    expect(getWrappedWalkmanIndex(52, 52)).toBe(0)
    expect(getWrappedWalkmanIndex(52, -1)).toBe(51)
    expect(getWrappedWalkmanIndex(0, 1)).toBe(0)
  })
})
