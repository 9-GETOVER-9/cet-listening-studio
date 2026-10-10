import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { IELTSReadingSession } from './IELTSReadingSession'
import type { ReadingCard } from '@/lib/ieltsReading'
import type { ReadingSession } from '@/lib/ieltsReadingStore'

it('shows a missed correct answer in red alongside wrong selections, reserving green for selected correct answers', () => {
  const card: ReadingCard = { id: 'resemble', word: 'resemble', meaning: '相似', category: 1, order: 1, sourceRow: 1, relation: 'lexical', status: 'verified', expressions: [{ id: 'look', text: 'look like' }, { id: 'like', text: 'like' }] }
  const session: ReadingSession = { owner: 'guest', id: 'round', mode: 'quiz', cardIds: [card.id], cursor: 0, selected: ['look', 'wrong'], revealed: true, graded: false, completed: 0, correct: 0, createdAt: 1, question: { cardId: card.id, options: [...card.expressions.map(e => ({ ...e, correct: true })), { id: 'wrong', text: 'perceive', correct: false }, { id: 'neutral', text: 'acknowledge', correct: false }] } }
  const html = renderToStaticMarkup(<IELTSReadingSession cards={[card]} session={session} data={{ progress: [], annotations: [], logs: [] }} onEnd={async () => {}} onNotesBlocked={() => {}} notesBlocked={false} />)
  const rows = [...html.matchAll(/<label class="([^"]*)">(.*?)<\/label>/gs)]
  const row = (text: string) => rows.find(value => value[2].includes(text))!
  expect(row('>like<span')[2]).toContain('漏选')
  expect(row('>like<span')[1]).toContain('bg-red-100')
  expect(row('perceive')[1]).toContain('bg-red-100')
  expect(row('look like')[1]).toContain('bg-emerald-100')
  expect(row('acknowledge')[1]).not.toMatch(/bg-(red|emerald)-100/)
})
