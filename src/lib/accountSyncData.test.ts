import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/schema'
import { frequencyDB } from './ieltsFrequencyProgress'
import { readingDB } from './ieltsReadingStore'
import { personalDB } from './ieltsPersonal'
import { collectLearningData, applyLearningRecord, resetGlobalLearning, settingBelongsTo, observeLearningWrites } from './accountSyncData'
import { createInitialFSRSState } from './fsrsScheduler'

beforeEach(async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  await Promise.all([db.delete(), frequencyDB.delete(), readingDB.delete(), personalDB.delete()])
  await Promise.all([db.open(), frequencyDB.open(), readingDB.open(), personalDB.open()])
})
describe('learning sync allowlist and account adapters', () => {
  it('collects owned frequency, reading and NCE state, never another account or audio', async () => {
    await frequencyDB.progress.put({ owner: 'alice', cardId: 'one', passed: true, attempts: 1, mistakes: 0, reason: null, updatedAt: 10 })
    await frequencyDB.progress.put({ owner: 'bob', cardId: 'two', passed: false, attempts: 1, mistakes: 1, reason: null, updatedAt: 12 })
    await db.settings.bulkPut([{ key: 'nce-shadowing:session:["alice","lesson"]', value: { owner: 'alice', draft: 'hello' } }, { key: 'personal-recording:alice', value: new Blob(['private voice']) }])
    await db.audio.put({ cardId: 'voice', blob: new Blob(['voice']) })
    const data = await collectLearningData('alice')
    expect([...data.keys()].some(k => k.startsWith('frequency/progress/'))).toBe(true)
    expect([...data.values()].some(v => JSON.stringify(v).includes('hello'))).toBe(true)
    expect(JSON.stringify([...data])).not.toMatch(/bob|private voice|blob|recording/)
  })
  it('restores dates and rejects cross-account remote rows', async () => {
    const key = 'frequency/progress/' + encodeURIComponent(JSON.stringify(['alice', 'one']))
    await expect(applyLearningRecord('alice', key, { owner: 'bob', cardId: 'one' })).rejects.toThrow()
    await applyLearningRecord('alice', key, { owner: 'alice', cardId: 'one', passed: true, attempts: 1, mistakes: 0, reason: null, updatedAt: 10 })
    expect((await frequencyDB.progress.get(['alice', 'one']))?.passed).toBe(true)
  })
  it('resets global progress at account switch while leaving audio and scoped data intact', async () => {
    await db.cards.put({ cardId: 'one', moduleId: 'm', fsrsMain: { ...createInitialFSRSState(), reps: 3 }, aiUnlocked: true } as never)
    await db.audio.put({ cardId: 'one', blob: new Blob(['audio']) })
    await resetGlobalLearning()
    expect((await db.cards.get('one'))?.fsrsMain.reps).toBe(0)
    expect(await db.audio.count()).toBe(1)
  })
  it('settings matching uses exact owners rather than substring email/id matches', () => {
    expect(settingBelongsTo('word-practice:session:alice:lesson', 'alice')).toBe(true)
    expect(settingBelongsTo('word-practice:session:alice2:lesson', 'alice')).toBe(false)
    expect(settingBelongsTo('auth-token:alice', 'alice')).toBe(false)
  })
  it('preserves an edit made between download and application', async () => {
    const key = 'frequency/progress/' + encodeURIComponent(JSON.stringify(['alice', 'one']))
    const old = { owner: 'alice', cardId: 'one', passed: false, attempts: 1, mistakes: 1, reason: null, updatedAt: 10 }
    await frequencyDB.progress.put({ ...old, passed: true, updatedAt: 20 })
    await expect(applyLearningRecord('alice', key, old, { value: old })).rejects.toThrow('本机有新修改')
    expect((await frequencyDB.progress.get(['alice', 'one']))?.passed).toBe(true)
  })
  it('notifies after committed learning writes, excluding media and rolled-back edits', async () => {
    let count = 0
    const stop = observeLearningWrites(() => { count++ })
    try {
      await db.audio.put({ cardId: 'voice', blob: new Blob(['voice']) })
      expect(count).toBe(0)
      await frequencyDB.progress.put({ owner: 'alice', cardId: 'one', passed: true, attempts: 1, mistakes: 0, reason: null, updatedAt: 10 })
      expect(count).toBe(1)
      await expect(frequencyDB.transaction('rw', frequencyDB.progress, async () => { await frequencyDB.progress.delete(['alice', 'one']); throw new Error('rollback') })).rejects.toThrow('rollback')
      expect(count).toBe(1)
    } finally { stop() }
  })
  it('tracks reviewed and unlocked cards in an index and removes reset cards from that index', async () => {
    await db.cards.put({ cardId: 'one', moduleId: 'm', fsrsMain: createInitialFSRSState(), aiUnlocked: false } as never)
    expect(await db.cards.where('cloudTracked').equals(1).count()).toBe(0)
    await db.cards.update('one', { aiUnlocked: true })
    expect((await collectLearningData('alice')).has('card/one')).toBe(true)
    await db.cards.update('one', { aiUnlocked: false })
    expect((await collectLearningData('alice')).has('card/one')).toBe(false)
  })
})
