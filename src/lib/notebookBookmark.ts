import { addNotebookItem, isCardBookmarked } from '@/db/crud'
import type { Card, NotebookItem, NotebookType } from '@/types'

export type BookmarkSentenceResult = 'added' | 'already-exists'

export function getCardSourceTag(card: Card): string {
  if (card.level === 'NCE') {
    return `NCE ${card.book || ''} Lesson ${card.lessonNum || ''}`.trim()
  }

  return `${card.examDate || ''} ${card.title || card.level}`.trim()
}

export async function bookmarkCardSentence(
  card: Card,
  isProActive: boolean,
  type: NotebookType = 'pronunciation',
): Promise<BookmarkSentenceResult> {
  const alreadyExists = await isCardBookmarked(card.cardId, card.englishText)
  if (alreadyExists) return 'already-exists'

  await addNotebookItem({
    type,
    content: card.englishText,
    exampleSentence: card.englishText,
    sourceCardId: card.cardId,
    sourceTag: getCardSourceTag(card),
  }, isProActive)

  return 'added'
}

export function getCardSourceTagFromNotebook(item: NotebookItem, fallbackCard: Card): string {
  return item.sourceTag || getCardSourceTag(fallbackCard)
}
