import Dexie, { type Table } from 'dexie'
import { Rating, type FSRSState } from '@/types'
import { createInitialFSRSState, previewFSRSRatings, scheduleFSRSState } from '@/lib/fsrsScheduler'
import { frequencyDB, type FrequencyProgress } from '@/lib/ieltsFrequencyProgress'

export type IELTSReviewModule = 'sentence' | 'cambridge' | 'wanglu' | 'frequency'
export interface IELTSReviewProgress {
  owner: string
  module: IELTSReviewModule
  itemId: string
  fsrs: FSRSState
  lastRating: Rating
  updatedAt: number
}
export interface IELTSReviewLog {
  owner: string
  operationId: string
  module: IELTSReviewModule
  itemId: string
  rating: Rating
  reviewedAt: number
}
export interface IELTSReviewSession {
  owner: string
  module: IELTSReviewModule
  state: Record<string, unknown>
  updatedAt: number
}

class IELTSReviewDB extends Dexie {
  progress!: Table<IELTSReviewProgress, [string, IELTSReviewModule, string]>
  logs!: Table<IELTSReviewLog, [string, string]>
  sessions!: Table<IELTSReviewSession, [string, IELTSReviewModule]>
  constructor() {
    super('ielts-unified-review-v1')
    this.version(1).stores({
      progress: '[owner+module+itemId], owner, [owner+module], [owner+module+fsrs.due]',
      logs: '[owner+operationId], owner, [owner+module+itemId]',
      sessions: '[owner+module], owner',
    })
  }
}
export const ieltsReviewDB = new IELTSReviewDB()

function validate(owner: string, module: IELTSReviewModule, itemId: string) {
  if (!owner || owner.length > 200 || !['sentence', 'cambridge', 'wanglu', 'frequency'].includes(module)
    || !itemId || itemId.length > 300) throw new Error('雅思复习项目无效')
}

export async function listIELTSReviewProgress(owner: string, module: IELTSReviewModule): Promise<IELTSReviewProgress[]> {
  if (!owner) return []
  return ieltsReviewDB.progress.where('[owner+module]').equals([owner, module]).toArray()
}

export async function getIELTSReviewProgress(owner: string, module: IELTSReviewModule, itemId: string) {
  validate(owner, module, itemId)
  return ieltsReviewDB.progress.get([owner, module, itemId])
}

export function isIELTSReviewDue(row: IELTSReviewProgress, now = Date.now()) {
  return row.fsrs.due.getTime() <= now
}

export function isIELTSReviewNew(row: IELTSReviewProgress) {
  return row.fsrs.reps === 0
}

export function previewIELTSReview(row: IELTSReviewProgress, now = new Date()) {
  return previewFSRSRatings(row.fsrs, now, { scope: 'main', owner: row.owner })
}

export async function recordIELTSReview(
  owner: string,
  module: IELTSReviewModule,
  itemId: string,
  rating: Rating,
  reviewedAt = new Date(),
  operationId: string = crypto.randomUUID(),
): Promise<IELTSReviewProgress> {
  validate(owner, module, itemId)
  if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating)) throw new Error('复习评分无效')
  const timestamp = reviewedAt.getTime()
  if (!Number.isFinite(timestamp) || !operationId || operationId.length > 100) throw new Error('复习时间或操作标识无效')
  return ieltsReviewDB.transaction('rw', ieltsReviewDB.progress, ieltsReviewDB.logs, async () => {
    const existingLog = await ieltsReviewDB.logs.get([owner, operationId])
    if (existingLog) {
      if (existingLog.module !== module || existingLog.itemId !== itemId || existingLog.rating !== rating) {
        throw new Error('复习操作标识已被其他评分使用')
      }
      const prior = await ieltsReviewDB.progress.get([owner, module, itemId])
      if (!prior) throw new Error('复习记录已存在但进度缺失')
      return prior
    }
    const previous = await ieltsReviewDB.progress.get([owner, module, itemId])
    const fsrs = scheduleFSRSState(previous?.fsrs ?? createInitialFSRSState(reviewedAt), rating, reviewedAt, { scope: 'main', owner })
    const progress = { owner, module, itemId, fsrs, lastRating: rating, updatedAt: timestamp }
    await ieltsReviewDB.progress.put(progress)
    await ieltsReviewDB.logs.add({ owner, operationId, module, itemId, rating, reviewedAt: timestamp })
    return progress
  })
}

export async function saveIELTSReviewSession(owner: string, module: IELTSReviewModule, state: Record<string, unknown>) {
  if (!owner || !['sentence', 'cambridge', 'wanglu', 'frequency'].includes(module)) throw new Error('雅思续学状态无效')
  if (JSON.stringify(state).length > 20_000) throw new Error('雅思续学状态过大')
  await ieltsReviewDB.sessions.put({ owner, module, state, updatedAt: Date.now() })
}

export async function readIELTSReviewSession(owner: string, module: IELTSReviewModule) {
  if (!owner) return null
  return (await ieltsReviewDB.sessions.get([owner, module]))?.state ?? null
}

export function summarizeIELTSReviews(rows: readonly IELTSReviewProgress[], total: number, now = Date.now()) {
  const due = rows.filter(row => !isIELTSReviewNew(row) && isIELTSReviewDue(row, now)).length
  const learned = rows.filter(row => !isIELTSReviewNew(row)).length
  return { learned, due, fresh: Math.max(0, total - learned) }
}

/** Seed legacy binary IELTS word outcomes once per item; existing FSRS progress always wins. */
export async function migrateLegacyFrequencyProgress(owner: string, progress?: readonly FrequencyProgress[]) {
  if (!owner || owner === 'guest') return 0
  const legacy = progress ? [...progress] : await frequencyDB.progress.where('owner').equals(owner).toArray()
  let migrated = 0
  for (const row of legacy) {
    if (row.owner !== owner) continue
    const existing = await ieltsReviewDB.progress.get([owner, 'frequency', row.cardId])
    if (existing) continue
    const at = Number.isFinite(row.updatedAt) && row.updatedAt > 0 ? new Date(row.updatedAt) : new Date()
    const rating = row.passed ? Rating.Good : Rating.Again
    const fsrs = scheduleFSRSState(createInitialFSRSState(at), rating, at, { scope: 'main', owner })
    try {
      await ieltsReviewDB.progress.add({ owner, module: 'frequency', itemId: row.cardId, fsrs, lastRating: rating, updatedAt: at.getTime() })
      migrated++
    } catch (error) {
      if ((error as { name?: string })?.name !== 'ConstraintError') throw error
    }
  }
  return migrated
}
