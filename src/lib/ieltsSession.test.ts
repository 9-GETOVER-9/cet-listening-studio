import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { db } from '@/db/schema'
import { saveDictationSession, readDictationSession } from './ieltsSession'
import { emptyFrequencyRetry } from './ieltsFrequencyRetry'

beforeEach(async () => { await db.delete(); await db.open() })
it('resumes a dictation draft, queue and first verdict only in its account and corpus', async () => {
  const saved = { owner: 'alice', book: 'frequency' as const, chapter: 1, section: 'all', limit: '20', rate: 1,
    state: { ...emptyFrequencyRetry, queue: ['one'], draft: 'hello', firstAttempt: { answer: 'helo', passed: false } },
    cards: [{ id: 'one', chapter: 1, section: 'a', word: 'hello', answers: ['hello'], audio: '/data/audio/one.mp3' }], history: null, updatedAt: 10 }
  await saveDictationSession(saved)
  expect(await readDictationSession('alice', 'frequency')).toEqual(saved)
  expect(await readDictationSession('bob', 'frequency')).toBeNull()
  expect(await readDictationSession('alice', 'wanglu')).toBeNull()
})
