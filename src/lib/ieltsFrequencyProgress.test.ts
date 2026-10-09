import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { IELTSCard } from './ieltsDictation'
import * as api from './ieltsFrequencyProgress'
import type { FrequencyOutcome, FrequencyReason } from './ieltsFrequencyProgress'
import * as review from '../components/IELTSFrequencyReview'
import { emptyFrequencyRetry, frequencyRetryReducer } from './ieltsFrequencyRetry'
const input = { owner: 'alice', sessionId: 'round-1', cardId: 'f1', passed: false, reason: 'pronunciation' as const }
const cards: IELTSCard[] = ['f1', 'f2', 'f3'].map(id => ({ id, chapter: 1, section: 'a', word: id, answers: [id], audio: '/audio.mp3' }))
beforeEach(async () => {
  if (api) { await api.frequencyDB.delete(); await api.frequencyDB.open() }
})
it('provides the frequency-only progress API', () => { expect(api).not.toBeNull() })
it('persists outcomes across reopen without storing raw answers and isolates owners', async () => {
  expect(api).not.toBeNull()
  await api.saveFrequencyOutcome(input)
  api.frequencyDB.close(); await api.frequencyDB.open()
  expect(await api.readFrequencyProgress('bob')).toEqual([])
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ owner: 'alice', cardId: 'f1', passed: false, attempts: 1, mistakes: 1, reason: 'pronunciation', updatedAt: expect.any(Number) }])
  expect((await api.readFrequencyProgress('alice'))[0]).not.toHaveProperty('answer')
})
it('deduplicates concurrent confirmations by owner, session and card', async () => {
  expect(api).not.toBeNull()
  await Promise.all([api.saveFrequencyOutcome(input), api.saveFrequencyOutcome(input)])
  await api.saveFrequencyOutcome({ ...input, passed: true })
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ attempts: 1, mistakes: 1, passed: false }])
  await api.saveFrequencyOutcome({ ...input, sessionId: 'round-2', passed: true })
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ attempts: 2, mistakes: 1, passed: true }])
})
it('removes a correctly reviewed word from pending while retaining errors and omitted reason', async () => {
  expect(api).not.toBeNull()
  await api.saveFrequencyOutcome(input)
  await api.saveFrequencyOutcome({ owner: 'alice', sessionId: 'review', cardId: 'f1', passed: true })
  const progress = await api.readFrequencyProgress('alice')
  expect(progress).toMatchObject([{ passed: true, attempts: 2, mistakes: 1, reason: 'pronunciation' }])
  expect(api.selectFrequencyCards(cards, progress, 'mistakes')).toEqual([])
})
it('edits reason independently of correctness and explicit null clears it', async () => {
  expect(api).not.toBeNull()
  await api.saveFrequencyOutcome(input)
  await api.setFrequencyReason('alice', 'f1', 'both')
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ reason: 'both', attempts: 1, mistakes: 1, passed: false }])
  await api.saveFrequencyOutcome({ ...input, sessionId: 'round-2', reason: null })
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ reason: null, attempts: 2 }])
  await api.setFrequencyReason('alice', 'f1', 'spelling')
  await api.setFrequencyReason('alice', 'f1', null)
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ reason: null }])
})
it('selects untested, all, pending and each reason without expanding the supplied scope', async () => {
  expect(api).not.toBeNull()
  await api.saveFrequencyOutcome(input)
  await api.saveFrequencyOutcome({ ...input, cardId: 'f2', passed: true, reason: null })
  const progress = await api.readFrequencyProgress('alice')
  expect(api.selectFrequencyCards(cards, progress, 'untested').map((c: IELTSCard) => c.id)).toEqual(['f3'])
  expect(api.selectFrequencyCards(cards, progress, 'all')).toEqual(cards)
  expect(api.selectFrequencyCards(cards.slice(1), progress, 'mistakes')).toEqual([])
  expect(api.selectFrequencyCards(cards, progress, 'mistakes', 'pronunciation')).toEqual([cards[0]])
  for (const reason of [null, 'spelling', 'both'] as FrequencyReason[]) {
    await api.setFrequencyReason('alice', 'f1', reason)
    expect(api.selectFrequencyCards(cards, await api.readFrequencyProgress('alice'), 'mistakes', reason)).toEqual([cards[0]])
  }
  expect(api.selectFrequencyCards(cards, await api.readFrequencyProgress('alice'), 'mistakes', 'pronunciation')).toEqual([])
})
it('queues scoped pending words first, then untested words once, skipping passed words', async () => {
  await api.saveFrequencyOutcome({ ...input, cardId: 'f2' })
  await api.saveFrequencyOutcome({ ...input, cardId: 'f1', passed: true })
  const progress = await api.readFrequencyProgress('alice')
  expect(api.selectFrequencyTestCards([...cards, cards[1], cards[2]], progress).map(card => card.id)).toEqual(['f2', 'f3'])
  expect(api.selectFrequencyTestCards([cards[2]], progress)).toEqual([cards[2]])
  const fresh = Array.from({ length: 50 }, (_, index) => ({ ...cards[0], id: `fresh-${index}` }))
  expect(api.selectFrequencyTestCards(fresh, []).slice(0, 20)).toEqual(fresh.slice(0, 20))
})
it('saves one original wrong outcome after correction and clears pending only after a new first-correct session', async () => {
  let state = frequencyRetryReducer(emptyFrequencyRetry, { type: 'start', queue: ['f1'], frequencyMode: true })
  state = frequencyRetryReducer(state, { type: 'check', answer: 'wrong', correct: false })
  state = frequencyRetryReducer(state, { type: 'retry' })
  state = frequencyRetryReducer(state, { type: 'check', answer: 'f1', correct: true })
  await api.saveFrequencyOutcome({ ...input, passed: state.firstAttempt!.passed })
  await api.saveFrequencyOutcome({ ...input, passed: state.firstAttempt!.passed })
  let progress = await api.readFrequencyProgress('alice')
  expect(progress).toMatchObject([{ passed: false, attempts: 1, mistakes: 1 }])
  expect(api.selectFrequencyTestCards(cards, progress).map(card => card.id)).toEqual(['f1', 'f2', 'f3'])
  await api.saveFrequencyOutcome({ ...input, sessionId: 'independent', passed: true })
  progress = await api.readFrequencyProgress('alice')
  expect(api.selectFrequencyTestCards(cards, progress).map(card => card.id)).toEqual(['f2', 'f3'])
  expect(progress).toMatchObject([{ passed: true, attempts: 2, mistakes: 1 }])
})
it('clears only the selected owner including receipts so a cleared question can be confirmed again', async () => {
  expect(api).not.toBeNull()
  await api.saveFrequencyOutcome(input); await api.saveFrequencyOutcome({ ...input, owner: 'bob' })
  await api.frequencyDB.practiceState.put({ owner: 'alice', key: 'session', value: { position: 1 } })
  await api.frequencyDB.practiceState.put({ owner: 'bob', key: 'session', value: { position: 1 } })
  await api.clearFrequencyProgress('alice')
  expect(await api.readFrequencyProgress('alice')).toEqual([])
  expect(await api.readFrequencyProgress('bob')).toHaveLength(1)
  expect(await api.frequencyDB.receipts.where('owner').equals('alice').count()).toBe(0)
  expect(await api.frequencyDB.practiceState.where('owner').equals('alice').count()).toBe(0)
  expect(await api.frequencyDB.practiceState.where('owner').equals('bob').count()).toBe(1)
  await api.saveFrequencyOutcome(input)
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ attempts: 1 }])
})
it('rejects invalid identifiers and enums before any write', async () => {
  expect(api).not.toBeNull()
  for (const invalid of [{ owner: ' ' }, { cardId: '' }, { sessionId: '' }, { passed: 'yes' }, { reason: 'invalid' }]) {
    await expect(api.saveFrequencyOutcome({ ...input, ...invalid } as unknown as FrequencyOutcome)).rejects.toThrow()
  }
  await expect(api.setFrequencyReason('alice', 'f1', 'invalid' as FrequencyReason)).rejects.toThrow()
  expect(await api.readFrequencyProgress('alice')).toEqual([])
  expect(await api.frequencyDB.receipts.count()).toBe(0)
})
it('rolls back outcomes when receipt storage fails and supports retry without lost counts', async () => {
  expect(api).not.toBeNull()
  const failure = vi.spyOn(api.frequencyDB.receipts, 'add').mockRejectedValueOnce(new Error('quota'))
  try { await expect(api.saveFrequencyOutcome(input)).rejects.toThrow('quota') } finally { failure.mockRestore() }
  expect(await api.readFrequencyProgress('alice')).toEqual([])
  expect(await api.frequencyDB.receipts.count()).toBe(0)
  await api.saveFrequencyOutcome(input)
  expect(await api.readFrequencyProgress('alice')).toMatchObject([{ attempts: 1, mistakes: 1 }])
})
it('renders only pending words with editable reasons and separate wrong-word practice entries', async () => {
  expect(review).not.toBeNull()
  await api.saveFrequencyOutcome(input)
  await api.saveFrequencyOutcome({ ...input, cardId: 'f2', passed: true })
  const markup = renderToStaticMarkup(createElement(review.IELTSFrequencyReview, {
    cards: cards.map((card, i) => ({ ...card, word: ['wrongword', 'correctword', 'untestedword'][i] })),
    progress: await api.readFrequencyProgress('alice'), owner: 'alice', rate: 1,
    chineseById: new Map(), indexError: '', onReload: () => {}, onStart: () => {},
  }))
  expect(markup).toContain('wrongword')
  expect(markup).not.toContain('correctword')
  expect(markup).not.toContain('untestedword')
  expect(markup).toContain('错词听写')
  expect(markup).toContain('错词随身听')
  for (const label of ['未标注', '发音', '拼错', '两者都有']) expect(markup).toContain(label)
})
it('renders a completed empty status without an all-card player when no pending words remain', () => {
  expect(review).not.toBeNull()
  const markup = renderToStaticMarkup(createElement(review.IELTSFrequencyReview, {
    cards, progress: [], owner: 'alice', rate: 1, chineseById: new Map(), indexError: '', onReload: () => {}, onStart: () => {},
  }))
  expect(markup).toContain('当前内容没有待复习错词')
  expect(markup).not.toContain('<audio')
  expect(markup).not.toContain('播放随身听')
})
