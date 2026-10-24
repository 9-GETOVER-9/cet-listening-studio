import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccountSyncEngine, SyncDB, type ExchangeResponse } from './accountSyncEngine'
import type { CloudRecord, LocalRecord } from './accountSyncProtocol'
import { db } from '@/db/schema'
import { collectLearningData, applyLearningRecord } from './accountSyncData'
import { frequencyDB, saveFrequencyOutcome, readFrequencyProgress, selectFrequencyCards, selectFrequencyTestCards } from './ieltsFrequencyProgress'
import { emptyFrequencyRetry } from './ieltsFrequencyRetry'
import { saveDictationSession, readDictationSession } from './ieltsSession'
import { createNCESession, moveNCESession, editNCEDraft, saveNCESession, readNCESession } from './nceShadowingStore'
import { createPracticeSession, savePracticeSession, readPracticeSession, type PracticeWord } from './wordPractice'
import { readingDB, saveReadingSession, readReadingSnapshot } from './ieltsReadingStore'
import { createInitialFSRSState } from './fsrsScheduler'

const stores: SyncDB[] = []
afterEach(async () => { for (const s of stores) await s.delete(); stores.length = 0 })
function cloud() {
  const rows = new Map<string, CloudRecord>(); let version = 0
  const ops = new Map<string, ExchangeResponse['acks'][number]>()
  return async (owner: string, changes: LocalRecord[], cursor: number): Promise<ExchangeResponse> => {
    const acks = changes.map(c => {
      const id = owner + c.mutationId
      if (ops.has(id)) return ops.get(id)!
      const key = owner + c.key, old = rows.get(key)
      if ((old?.version || 0) !== c.baseVersion) return { mutationId: c.mutationId, status: 'conflict' as const, record: old! }
      const record = { key: c.key, value: c.value, version: ++version, modifiedAt: c.modifiedAt }
      rows.set(key, record)
      const ack = { mutationId: c.mutationId, status: 'accepted' as const, record }; ops.set(id, ack); return ack
    })
    return { acks, records: [...rows].filter(([k, v]) => k.startsWith(owner) && v.version > cursor).map(([, v]) => v), cursor: version, more: false }
  }
}
function device(exchange: ReturnType<typeof cloud>, owner = 'alice') {
  const storage = new SyncDB(crypto.randomUUID()); stores.push(storage)
  const data = new Map<string, unknown>(); let active = owner
  const engine = createAccountSyncEngine({ storage, exchange, collect: async () => new Map(data),
    apply: async (_, k, v) => { if (v === null) data.delete(k); else data.set(k, v); return true },
    mayDelete: async () => true, active: o => o === active })
  return { ...engine, storage, data, deactivate: () => { active = '' } }
}
describe('durable per-record account sync', () => {
  it('resumes another device, propagates deletions, and keeps another account isolated', async () => {
    const exchange = cloud(), phone = device(exchange), pc = device(exchange), bob = device(exchange, 'bob')
    phone.data.set('frequency/progress/a', { passed: true, updatedAt: 10 })
    await phone.run('alice'); await pc.run('alice'); await bob.run('bob')
    expect(pc.data.get('frequency/progress/a')).toEqual({ passed: true, updatedAt: 10 })
    expect(bob.data.size).toBe(0)
    phone.data.delete('frequency/progress/a'); await phone.run('alice'); await pc.run('alice')
    expect(pc.data.size).toBe(0)
  })
  it('retries the same durable operation after network failure without duplicates', async () => {
    const exchange = cloud(); let fail = true
    const pc = device(async (...args) => { const result = await exchange(...args); if (fail) { fail = false; throw new Error('offline') }; return result })
    pc.data.set('study/a', { timestamp: 10 })
    await expect(pc.run('alice')).rejects.toThrow('offline')
    const before = (await pc.storage.records.toArray())[0].pending?.mutationId
    expect(before).toBeTruthy()
    await pc.run('alice')
    expect((await pc.storage.records.toArray())[0].version).toBe(1)
    expect((await pc.storage.records.toArray())[0].pending).toBeNull()
  })
  it('preserves changes made while a request is in flight', async () => {
    const exchange = cloud(); let change = true
    const pc = device(async (...args) => { const result = await exchange(...args); if (change) { change = false; pc.data.set('card/a', { reps: 2 }) }; return result })
    pc.data.set('card/a', { reps: 1 })
    await pc.run('alice')
    const phone = device(exchange); await phone.run('alice')
    expect(phone.data.get('card/a')).toEqual({ reps: 2 })
  })
  it('does not apply an in-flight response after account changed', async () => {
    const exchange = cloud(); const phone = device(exchange)
    phone.data.set('card/a', { reps: 1 }); await phone.run('alice')
    const pc = device(async (...args) => { const result = await exchange(...args); pc.deactivate(); return result })
    await pc.run('alice'); expect(pc.data.size).toBe(0)
  })
})

describe('phone and desktop round trips through real module storage adapters', () => {
  // Only fake IndexedDB inside this test process is cleared. No browser/account databases are opened.
  async function clearProjection() {
    for (const database of [db, frequencyDB, readingDB]) await Promise.all(database.tables.map(table => table.clear()))
  }
  beforeEach(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    await clearProjection()
  })
  afterEach(async () => { await clearProjection(); vi.unstubAllGlobals() })
  async function captureProjection(d: ReturnType<typeof device>) {
    const data = await collectLearningData('alice')
    d.data.clear(); for (const [key, value] of data) d.data.set(key, value)
  }
  async function restoreProjection(d: ReturnType<typeof device>) {
    await clearProjection()
    for (const [key, value] of d.data) await applyLearningRecord('alice', key, value)
  }
  const cards = ['alpha', 'beta', 'gamma'].map(id => ({ id, word: id, answers: [id], chapter: 1, section: 'a', audio: `/fixture/${id}.mp3` }))

  it('preserves wrong words and a retry draft, then returns corrected words and the next position', async () => {
    const exchange = cloud(), phone = device(exchange), pc = device(exchange)
    for (const card of cards) await saveFrequencyOutcome({ owner: 'alice', sessionId: 'phone-round', cardId: card.id, passed: card.id === 'alpha' })
    const saved = { owner: 'alice', book: 'frequency' as const, chapter: 1, section: 'a', limit: '10', rate: 0.75,
      state: { ...emptyFrequencyRetry, frequencyMode: true, queue: ['beta', 'gamma'], draft: 'be', firstAttempt: { answer: 'betta', passed: false } },
      cards: cards.slice(1), history: null, updatedAt: Date.now() }
    await saveDictationSession(saved)
    await captureProjection(phone); await phone.run('alice'); await pc.run('alice'); await restoreProjection(pc)
    let progress = await readFrequencyProgress('alice')
    expect(selectFrequencyCards(cards, progress, 'mistakes').map(c => c.id)).toEqual(['beta', 'gamma'])
    expect(selectFrequencyTestCards(cards, progress).map(c => c.id)).toEqual(['beta', 'gamma'])
    expect(await readDictationSession('alice', 'frequency')).toEqual(saved)
    expect(await readDictationSession('bob', 'frequency')).toBeNull()

    await saveFrequencyOutcome({ owner: 'alice', sessionId: 'pc-new-round', cardId: 'beta', passed: true })
    await saveDictationSession({ ...saved, state: { ...saved.state, results: [{ id: 'beta', answer: 'betta', passed: false }], firstAttempt: null, draft: 'ga' }, updatedAt: Date.now() })
    await captureProjection(pc); await pc.run('alice'); await phone.run('alice'); await restoreProjection(phone)
    progress = await readFrequencyProgress('alice')
    expect(selectFrequencyCards(cards, progress, 'mistakes').map(c => c.id)).toEqual(['gamma'])
    expect(selectFrequencyTestCards(cards, progress).map(c => c.id)).toEqual(['gamma'])
    expect(progress.find(p => p.cardId === 'beta')).toMatchObject({ passed: true, attempts: 2, mistakes: 1 })
    const resumed = await readDictationSession('alice', 'frequency')
    expect(resumed?.state.queue[resumed.state.results.length]).toBe('gamma')
    expect(resumed?.state.draft).toBe('ga')
  })

  it('restores NCE, word practice and reading positions with actual module readers in both directions', async () => {
    const exchange = cloud(), phone = device(exchange), pc = device(exchange)
    const nce = editNCEDraft(moveNCESession(createNCESession('alice', 'fixture-lesson', { start: 5, end: 7, mode: 'hidden' }, ['five', 'six', 'seven']), 2), 'last sentence draft')
    await saveNCESession(nce)
    const queue: PracticeWord[] = cards.map(c => ({ id: c.id, word: c.word, answers: c.answers, meaning: '', source: 'frequency', sourceLabel: 'fixture' }))
    const practice = { ...createPracticeSession('alice', 'fixture-context', queue), position: 1, draft: 'be', firstVerdict: false }
    await savePracticeSession(practice)
    await saveReadingSession({ owner: 'alice', id: 'fixture-reading-round', mode: 'recall', cardIds: ['read-one', 'read-two'], cursor: 1, selected: [], revealed: false, graded: false, completed: 1, correct: 1, createdAt: Date.now() })
    const fsrs = { ...createInitialFSRSState(), reps: 2, last_review: new Date('2026-10-23T01:00:00Z') }
    await readingDB.progress.put({ owner: 'alice', cardId: 'read-one', fsrs, covered: ['expression-a'], updatedAt: Date.now() })
    await captureProjection(phone); await phone.run('alice'); await pc.run('alice'); await restoreProjection(pc)
    expect(await readNCESession('alice', nce.context)).toMatchObject({ position: 2, draft: 'last sentence draft' })
    const resume = (await db.settings.get('cloud-resume:alice'))?.value as { path: string }
    expect(new URL(resume.path, 'https://example.test').searchParams.get('targetId')).toBe('seven')
    expect(await readPracticeSession('alice', 'fixture-context')).toMatchObject({ position: 1, draft: 'be', firstVerdict: false })
    const reading = await readReadingSnapshot('alice')
    expect(reading.session).toMatchObject({ cursor: 1, completed: 1 })
    expect(reading.progress[0].fsrs.last_review).toEqual(fsrs.last_review)
    expect(reading.progress[0].fsrs.last_review).toBeInstanceOf(Date)

    await saveNCESession(editNCEDraft(moveNCESession(nce, -1), 'desktop sentence six'))
    await savePracticeSession({ ...practice, position: 2, draft: 'gam' })
    await captureProjection(pc); await pc.run('alice'); await phone.run('alice'); await restoreProjection(phone)
    expect(await readNCESession('alice', nce.context)).toMatchObject({ position: 1, draft: 'desktop sentence six' })
    expect(await readPracticeSession('alice', 'fixture-context')).toMatchObject({ position: 2, draft: 'gam' })
    expect(await readNCESession('bob', nce.context)).toBeNull()
  })

  it('keeps offline wrong-word changes and continuation draft durable until reconnection', async () => {
    const exchange = cloud(), pc = device(exchange)
    let online = false
    const phone = device(async (...args) => { if (!online) throw new Error('offline'); return exchange(...args) })
    await saveFrequencyOutcome({ owner: 'alice', sessionId: 'offline-round', cardId: 'beta', passed: false })
    await saveDictationSession({ owner: 'alice', book: 'frequency', chapter: 1, section: 'a', limit: '10', rate: 1,
      state: { ...emptyFrequencyRetry, queue: ['beta'], draft: 'bet' }, cards: [cards[1]], history: null, updatedAt: Date.now() })
    await captureProjection(phone)
    await expect(phone.run('alice')).rejects.toThrow('offline')
    const pending = (await phone.storage.records.toArray()).map(r => r.pending?.mutationId)
    expect(pending.length).toBeGreaterThan(0)
    phone.storage.close(); await phone.storage.open()
    expect((await phone.storage.records.toArray()).map(r => r.pending?.mutationId)).toEqual(pending)
    await pc.run('alice'); expect(pc.data.size).toBe(0)
    online = true
    await phone.run('alice'); await pc.run('alice'); await restoreProjection(pc)
    expect((await readFrequencyProgress('alice'))[0]).toMatchObject({ passed: false, attempts: 1 })
    expect((await readDictationSession('alice', 'frequency'))?.state.draft).toBe('bet')
    expect((await phone.storage.records.toArray()).every(r => r.pending === null)).toBe(true)
  })
})
