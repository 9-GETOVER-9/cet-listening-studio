import type { Card, NotebookItem } from '@/types'
import { getListeningCategory, type ListeningCategory } from './listeningTime'

export type WalkmanTrackSource = 'review' | 'notebook-pronunciation'

export interface WalkmanTrack {
  id: string
  source: WalkmanTrackSource
  cardId: string
  notebookId?: string
  audioFiles: string[]
  englishText: string
  chineseText: string
  sourceLabel: string
  listeningCategory?: ListeningCategory | null
}

export function getCardAudioFiles(card: Card): string[] {
  if (card.isMerged && card.mergedAudioFiles?.length) return card.mergedAudioFiles
  return card.audioFile ? [card.audioFile] : []
}

export function buildReviewWalkmanTracks(cards: Card[]): WalkmanTrack[] {
  return cards
    .map((card) => ({
      id: `card:${card.cardId}`,
      source: 'review' as const,
      cardId: card.cardId,
      audioFiles: getCardAudioFiles(card),
      englishText: card.englishText,
      chineseText: card.chineseText,
      sourceLabel: card.level,
      listeningCategory: getListeningCategory(card),
    }))
    .filter((track) => track.audioFiles.length > 0)
}

export function buildNotebookWalkmanTracks(
  items: NotebookItem[],
  cardsById: Map<string, Card>,
): WalkmanTrack[] {
  return items
    .filter((item) => item.type === 'pronunciation')
    .flatMap((item) => {
      const card = cardsById.get(item.sourceCardId)
      if (!card) return []
      const audioFiles = getCardAudioFiles(card)
      if (audioFiles.length === 0) return []

      return [{
        id: `notebook:${item.notebookId}`,
        source: 'notebook-pronunciation' as const,
        cardId: card.cardId,
        notebookId: item.notebookId,
        audioFiles,
        englishText: item.exampleSentence || item.content || card.englishText,
        chineseText: card.chineseText,
        sourceLabel: item.sourceTag || card.level,
        listeningCategory: getListeningCategory(card),
      }]
    })
}

export function removeWalkmanTrack(
  tracks: WalkmanTrack[],
  trackId: string,
  currentIndex: number,
): { tracks: WalkmanTrack[]; nextIndex: number } {
  const nextTracks = tracks.filter((track) => track.id !== trackId)
  const nextIndex = nextTracks.length === 0
    ? 0
    : Math.min(currentIndex, nextTracks.length - 1)

  return {
    tracks: nextTracks,
    nextIndex,
  }
}

export function getWrappedWalkmanIndex(trackCount: number, requestedIndex: number): number {
  if (trackCount <= 0) return 0
  return (requestedIndex + trackCount) % trackCount
}
