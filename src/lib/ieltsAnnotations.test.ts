import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { frequencyDB, readFrequencyProgress, saveFrequencyOutcome, type FrequencyReason } from './ieltsFrequencyProgress'
import type { AnnotationSeed, FrequencyAnnotation } from './ieltsAnnotations'
import * as api from './ieltsAnnotations'
import { IELTSWordNotes } from '../components/IELTSWordNotes'
import { IELTSNotesLibrary } from '../components/IELTSNotesLibrary'
import { IELTSFrequencyReview } from '../components/IELTSFrequencyReview'

const seed: AnnotationSeed = { cardId: 'f1', note: '<script>alert("note")</script> 手写笔记', reason: 'pronunciation', sourceFlag: '原旗标' }
const seeds = new Map([[seed.cardId, seed]])
const card = { id: 'f1', chapter: 1, section: 'A', word: 'word', chinese: '释义', answers: ['word'], audio: '/audio.mp3' }
beforeEach(async () => { await frequencyDB.delete(); await frequencyDB.open() })

it('upgrades populated v1 progress and receipts intact before saving a v2 annotation', async () => {
  await frequencyDB.delete()
  const legacy = new Dexie(frequencyDB.name)
  legacy.version(1).stores({ progress: '[owner+cardId], owner', receipts: '[owner+sessionId+cardId], owner' })
  const progress = { owner: 'alice', cardId: 'f1', passed: false, attempts: 4, mistakes: 2, reason: 'spelling' as const, updatedAt: 123456 }
  const receipt = { owner: 'alice', sessionId: 'legacy-round', cardId: 'f1' }
  try {
    await legacy.open()
    await legacy.transaction('rw', legacy.table('progress'), legacy.table('receipts'), async () => {
      await legacy.table('progress').put(progress)
      await legacy.table('receipts').put(receipt)
    })
  } finally { legacy.close() }

  await frequencyDB.open()
  expect(frequencyDB.verno).toBe(3)
  expect(await readFrequencyProgress('alice')).toEqual([progress])
  expect(await frequencyDB.receipts.get(['alice', 'legacy-round', 'f1'])).toEqual(receipt)
  expect(await api.readFrequencyAnnotations('alice')).toEqual([])
  await saveFrequencyOutcome({ ...receipt, passed: true })
  expect(await readFrequencyProgress('alice')).toEqual([progress])

  await api.saveFrequencyAnnotation('alice', 'f1', { note: '升级后笔记' })
  expect(await api.readFrequencyAnnotations('alice')).toEqual([{ owner: 'alice', cardId: 'f1', note: '升级后笔记' }])
  expect(await readFrequencyProgress('alice')).toEqual([progress])
  expect(await frequencyDB.receipts.get(['alice', 'legacy-round', 'f1'])).toEqual(receipt)
})

it('reads seed notes and flags without creating progress or annotations', async () => {
  expect(api.resolveFrequencyAnnotation('f1', seeds, new Map())).toEqual(seed)
  expect(await api.readFrequencyAnnotations('alice')).toEqual([])
  expect(await readFrequencyProgress('alice')).toEqual([])
})
it('persists independent partial edits across reopen and isolates each owner', async () => {
  await api.saveFrequencyAnnotation('alice', 'f1', { note: '编辑笔记' })
  await api.saveFrequencyAnnotation('alice', 'f1', { reason: 'both' })
  frequencyDB.close(); await frequencyDB.open()
  expect(await api.readFrequencyAnnotations('alice')).toMatchObject([{ owner: 'alice', cardId: 'f1', note: '编辑笔记', reason: 'both' }])
  expect(await api.readFrequencyAnnotations('bob')).toEqual([])
  expect(await readFrequencyProgress('alice')).toEqual([])
})
it('keeps explicit empty note and null reason overrides above seed and progress', () => {
  const local = new Map<string, FrequencyAnnotation>([['f1', { owner: 'alice', cardId: 'f1', note: '', reason: null }]])
  expect(api.resolveFrequencyAnnotation('f1', seeds, local, 'spelling')).toEqual({ ...seed, note: '', reason: null })
  expect(api.resolveFrequencyAnnotation('f1', seeds, new Map(), 'spelling').reason).toBe('spelling')
  expect(api.resolveFrequencyAnnotation('f1', seeds, new Map(), null).reason).toBe('pronunciation')
  expect(api.resolveFrequencyAnnotation('missing', seeds, new Map())).toEqual({ cardId: 'missing', note: '', reason: null, sourceFlag: '' })
})
it('saves reason and existing progress atomically without changing result or counts', async () => {
  await saveFrequencyOutcome({ owner: 'alice', sessionId: 'one', cardId: 'f1', passed: false })
  await api.saveFrequencyAnnotation('alice', 'f1', { note: '笔记', reason: 'both' })
  expect(await readFrequencyProgress('alice')).toMatchObject([{ passed: false, attempts: 1, mistakes: 1, reason: 'both' }])
  const failure = vi.spyOn(frequencyDB.progress, 'put').mockRejectedValueOnce(new Error('quota'))
  try { await expect(api.saveFrequencyAnnotation('alice', 'f1', { note: '失败内容', reason: null })).rejects.toThrow('quota') }
  finally { failure.mockRestore() }
  expect(await api.readFrequencyAnnotations('alice')).toMatchObject([{ note: '笔记', reason: 'both' }])
  expect(await readFrequencyProgress('alice')).toMatchObject([{ reason: 'both', attempts: 1 }])
})
it('preserves explicit local reason on later outcomes and lets an explicit new override replace it', async () => {
  await api.saveFrequencyAnnotation('alice', 'f1', { reason: 'both' })
  await saveFrequencyOutcome({ owner: 'alice', sessionId: 'one', cardId: 'f1', passed: false, reason: 'pronunciation' })
  expect(await readFrequencyProgress('alice')).toMatchObject([{ reason: 'both', attempts: 1 }])
  await api.saveFrequencyAnnotation('alice', 'f1', { reason: null })
  await saveFrequencyOutcome({ owner: 'alice', sessionId: 'two', cardId: 'f1', passed: true })
  expect(await readFrequencyProgress('alice')).toMatchObject([{ reason: null, passed: true, attempts: 2, mistakes: 1 }])
})
it('clears only the requested owner and retains immutable seed content', async () => {
  await api.saveFrequencyAnnotation('alice', 'f1', { note: 'A' })
  await api.saveFrequencyAnnotation('bob', 'f1', { note: 'B' })
  await api.clearFrequencyAnnotations('alice')
  expect(await api.readFrequencyAnnotations('alice')).toEqual([])
  expect(await api.readFrequencyAnnotations('bob')).toHaveLength(1)
  expect(api.resolveFrequencyAnnotation('f1', seeds, new Map()).note).toBe(seed.note)
})
it('rejects invalid IDs, note types, lengths and reasons before any write', async () => {
  for (const [owner, cardId, patch] of [[' ', 'f1', { note: 'x' }], ['alice', '', { note: 'x' }], ['alice', 'f1', { note: 2 }], ['alice', 'f1', { note: 'a'.repeat(10001) }], ['alice', 'f1', { reason: 'invalid' }]] as const) {
    await expect(api.saveFrequencyAnnotation(owner, cardId, patch as { note?: string; reason?: FrequencyReason })).rejects.toThrow()
  }
  expect(await api.readFrequencyAnnotations('alice')).toEqual([])
})
it('strictly validates seed schema, unique identifiers and string fields', () => {
  expect(api.parseFrequencyAnnotationSeeds({ version: 'ielts-frequency-annotations-v1', cards: [seed] })).toEqual(seeds)
  for (const input of [null, { version: 'wrong', cards: [seed] }, { version: 'ielts-frequency-annotations-v1', cards: [seed, seed] }, ...[{ cardId: '' }, { note: {} }, { sourceFlag: 1 }, { reason: 'bad' }, { note: 'x'.repeat(10001) }].map(patch => ({ version: 'ielts-frequency-annotations-v1', cards: [{ ...seed, ...patch }] }))]) {
    expect(() => api.parseFrequencyAnnotationSeeds(input)).toThrow()
  }
})
it('renders safe plain notes, original flag and explicit save with a bounded single editor', () => {
  const markup = renderToStaticMarkup(createElement(IELTSWordNotes, { owner: 'alice', card, annotation: seed }))
  expect(markup).toContain('word 的笔记')
  expect(markup).toContain('原旗标')
  expect(markup).toContain('保存笔记与标签')
  expect(markup).not.toContain('<script>')
  expect(markup).toContain('&lt;script&gt;')
  const library = renderToStaticMarkup(createElement(IELTSNotesLibrary, { owner: 'alice', cards: Array.from({ length: 250 }, (_, i) => ({ ...card, id: `f${i}` })), seeds, local: new Map(), progress: [] }))
  expect(library.match(/<textarea/g)).toHaveLength(1)
  expect(library).toContain('搜索单词或释义')
})
it('shows resolved imported reasons in pending review without adding seed-only or passed words', async () => {
  await saveFrequencyOutcome({ owner: 'alice', sessionId: 'one', cardId: 'f1', passed: false })
  const markup = renderToStaticMarkup(createElement(IELTSFrequencyReview, { owner: 'alice', cards: [card, { ...card, id: 'f2', word: 'untested' }], progress: await readFrequencyProgress('alice'), seeds, local: new Map(), chineseById: new Map(), rate: 1, indexError: '', onReload: () => {}, onStart: () => {} }))
  expect(markup).toContain('value="pronunciation" selected=""')
  expect(markup).not.toContain('untested')
})
