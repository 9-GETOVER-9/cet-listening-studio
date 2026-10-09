import Dexie, { type Table } from 'dexie'
import { summarizeResults, type DictationResult, type IELTSBook } from './ieltsDictation'

export interface IELTSHistoryRecord {
  id: string; owner: string; book: IELTSBook; chapter: number; section: string; groupLabel?: string
  corpusVersion: string; startedAt: number; finishedAt: number; total: number; practice?: boolean
  answered: number; passed: number; failed: number; accuracy: number; completed: boolean
}
export type IELTSHistoryInput = Omit<IELTSHistoryRecord, 'answered' | 'passed' | 'failed' | 'accuracy' | 'completed'> & { results: DictationResult[] }
export type IELTSHistorySession = Omit<IELTSHistoryInput, 'results' | 'finishedAt'>

// Called when the user starts a round, never while rendering the page.
export function createIELTSHistorySession(metadata: Omit<IELTSHistorySession, 'id' | 'startedAt'>): IELTSHistorySession {
  return { ...metadata, id: crypto.randomUUID(), startedAt: Date.now() }
}

class IELTSHistoryDB extends Dexie {
  rounds!: Table<IELTSHistoryRecord, string>
  constructor() {
    super('ielts-dictation-history')
    this.version(1).stores({ rounds: '&id, [owner+finishedAt]' })
  }
}
export const historyDB = new IELTSHistoryDB()

export async function saveIELTSHistory(input: IELTSHistoryInput): Promise<IELTSHistoryRecord | null> {
  const { results, ...metadata } = input
  if (!results.length) return null
  if (!metadata.id || !metadata.owner || results.length > metadata.total || !Number.isInteger(metadata.total)) throw new Error('听写日志数据不完整')
  const summary = summarizeResults(results)
  const record: IELTSHistoryRecord = { ...metadata, ...summary, accuracy: summary.accuracy!, completed: results.length === metadata.total }
  return historyDB.transaction('rw', historyDB.rounds, async () => {
    const existing = await historyDB.rounds.get(record.id)
    if (existing) return existing
    await historyDB.rounds.add(record)
    return record
  })
}

export function readIELTSHistory(owner: string): Promise<IELTSHistoryRecord[]> {
  return historyDB.rounds.where('[owner+finishedAt]').between([owner, Dexie.minKey], [owner, Dexie.maxKey]).reverse().toArray()
}
