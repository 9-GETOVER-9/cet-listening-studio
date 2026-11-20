import type { ReadingCard } from './ieltsReading'

export type MatchPair = { card: ReadingCard; answer: string }
const normalize = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

export function buildMatchLevels(cards: ReadingCard[]) {
  const levels: MatchPair[][] = []
  let level: MatchPair[] = []
  for (const card of [...cards].sort((a, b) => a.category - b.category || a.order - b.order)) {
    if (card.status === 'pending' || !['lexical', 'context'].includes(card.relation)) continue
    const word = normalize(card.word)
    const answers = card.expressions.map(e => normalize(e.text))
    const candidates = card.expressions.filter(e => normalize(e.text) && normalize(e.text) !== word)
    const fits = (answer: string) => level.every(pair => {
      const otherWord = normalize(pair.card.word)
      const otherAnswer = normalize(pair.answer)
      return word !== otherWord && word !== otherAnswer && answer !== otherWord
        && !answers.includes(otherAnswer)
        && !pair.card.expressions.some(e => normalize(e.text) === answer)
    })
    if (!candidates.length) continue
    let candidate = level.length < 5 ? candidates.find(e => fits(normalize(e.text))) : undefined
    if (!candidate) {
      levels.push(level)
      level = []
      candidate = candidates[0]
    }
    level.push({ card, answer: candidate.text })
  }
  if (level.length) levels.push(level)
  return levels
}

export const matchStorageKey = (owner: string) => `ielts-reading-match-v1:${owner}`

export function hasMatchProgress(owner: string) {
  try {
    return JSON.parse(localStorage.getItem(matchStorageKey(owner)) ?? 'null')?.round?.done === false
  } catch {
    return false
  }
}
