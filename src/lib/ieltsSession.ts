import { db } from '@/db/schema'
import type { IELTSCard } from './ieltsDictation'
import type { FrequencyRetryState } from './ieltsFrequencyRetry'
import type { IELTSHistorySession } from './ieltsHistory'

export interface SavedDictationSession {
  owner: string; book: 'frequency' | 'wanglu'; chapter: number; section: string; limit: string; rate: number
  state: FrequencyRetryState; cards: IELTSCard[]; history: IELTSHistorySession | null; updatedAt: number
}
const key = (owner: string, book: string) => `ielts-dictation:session:${owner}:${book}`
export async function readDictationSession(owner: string, book: string): Promise<SavedDictationSession | null> {
  const value = (await db.settings.get(key(owner, book)))?.value as SavedDictationSession | undefined
  if (!value || value.owner !== owner || value.book !== book || !Array.isArray(value.state?.queue) || !Array.isArray(value.cards) || !value.state.queue.length) return null
  return value
}
export async function saveDictationSession(session: SavedDictationSession) {
  await db.settings.put({ key: key(session.owner, session.book), value: session })
}
