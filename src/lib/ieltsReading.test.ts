import { describe, expect, it } from 'vitest'
import { buildReadingQuestion, gradeReadingQuestion, parseReadingCorpus, selectReadingQueue, type ReadingCard } from './ieltsReading'

export const domestic: ReadingCard = { id: 'domestic', word: 'domestic', meaning: '家庭的；国内的', category: 1, order: 0, sourceRow: 1, relation: 'lexical', status: 'verified', expressions: ['home', 'local', 'national'].map(text => ({ id: text, text })) }
const trait: ReadingCard = { ...domestic, id: 'trait', word: 'trait', order: 1, expressions: [{ id: 'feature', text: 'feature' }] }
const measure: ReadingCard = { ...domestic, id: 'measure', word: 'measure', order: 2, expressions: [{ id: 'assess', text: 'assess' }] }
const cards = [domestic, trait, measure]

describe('Reading538 quiz and content', () => {
  it('grades exact presented set and distinguishes omitted and extra answers', () => {
    const q = buildReadingQuestion(domestic, cards, 0)
    expect(gradeReadingQuestion(q, ['home', 'local', 'national']).passed).toBe(true)
    const wrong = q.options.find(o => !o.correct)!
    const result = gradeReadingQuestion(q, ['home', wrong.id])
    expect({ ...result, missed: result.missed.sort() }).toEqual({ passed: false, missed: ['local', 'national'], extra: [wrong.id] })
    expect(gradeReadingQuestion(q, []).passed).toBe(false)
    expect(() => gradeReadingQuestion(q, ['unknown'])).toThrow()
  })
  it('rotates a long list without treating unseen expressions as omissions', () => {
    const card = { ...domestic, expressions: Array.from({ length: 13 }, (_, i) => ({ id: `e${i}`, text: `expression ${i}` })) }
    const first = buildReadingQuestion(card, cards, 0)
    const second = buildReadingQuestion(card, cards, 1)
    const positives = first.options.filter(o => o.correct).map(o => o.id)
    expect(positives.length).toBeLessThan(13)
    expect(second.options.filter(o => o.correct).map(o => o.id)).not.toEqual(positives)
    expect(gradeReadingQuestion(first, positives)).toEqual({ passed: true, missed: [], extra: [] })
  })
  it('rejects duplicate or empty content and preserves relationship metadata', () => {
    expect(parseReadingCorpus({ version: 'ielts-reading-538-v1', title: '538', cards }).cards).toHaveLength(3)
    expect(() => parseReadingCorpus({ version: 'ielts-reading-538-v1', title: '538', cards: [domestic, domestic] })).toThrow()
    expect(() => parseReadingCorpus({ version: 'ielts-reading-538-v1', title: '538', cards: [{ ...domestic, expressions: [] }] })).toThrow()
    const cause = { ...domestic, relation: 'cause' }
    expect(parseReadingCorpus({ version: 'ielts-reading-538-v1', title: '538', cards: [cause] }).cards[0].relation).toBe('cause')
  })
  it('due queue excludes new and pending cards and respects true due time', () => {
    const now = new Date('2026-10-09T04:00:00Z')
    const states = new Map([['domestic', { due: new Date(now.getTime() - 1000), reps: 1 }], ['trait', { due: new Date(now.getTime() + 1000), reps: 1 }]])
    expect(selectReadingQueue(cards, states, 'due', now).map(c => c.id)).toEqual(['domestic'])
    expect(selectReadingQueue(cards, states, 'new', now).map(c => c.id)).toEqual(['measure'])
    expect(selectReadingQueue([{ ...measure, status: 'pending' }], states, 'new', now)).toEqual([])
  })
})
