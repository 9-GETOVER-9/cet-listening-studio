import { expect, it } from 'vitest'
import type { ReadingCard } from './ieltsReading'
import { buildMatchLevels } from './readingMatch'

it('does not put an alternative valid answer on the same board', () => {
  function card(order: number, word: string, ...answers: string[]): ReadingCard {
    return {
      id: String(order), category: 1, order, sourceRow: order, word, meaning: word,
      relation: 'lexical', status: 'verified',
      expressions: answers.map(text => ({ id: text, text })),
    }
  }
  const first = card(1, 'large', 'big', 'huge')
  const second = card(2, 'enormous', ' HUGE ')
  const pending = { ...card(3, 'tiny', 'small'), status: 'pending' as const }
  const cause = { ...card(4, 'rain', 'flood'), relation: 'cause' as const }
  expect(buildMatchLevels([second, pending, first, cause]).map(level => level.map(pair => pair.card.word)))
    .toEqual([['large'], ['enormous']])
})
