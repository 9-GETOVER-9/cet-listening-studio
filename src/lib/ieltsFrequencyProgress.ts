import Dexie, { type Table } from 'dexie'
import type { IELTSCard } from './ieltsDictation'
import type { FrequencyAnnotation } from './ieltsAnnotations'

export type FrequencyReason = 'pronunciation' | 'spelling' | 'both' | null
export const FREQUENCY_REASON_LABELS = { unlabelled: '未标注', pronunciation: '发音', spelling: '拼错', both: '两者都有' } as const
export interface FrequencyProgress {
  owner: string
  cardId: string
  passed: boolean
  attempts: number
  mistakes: number
  reason: FrequencyReason
  updatedAt: number
}
interface FrequencyReceipt { owner: string; sessionId: string; cardId: string }
interface FrequencyPracticeState { owner: string; key: string; value: unknown }
export interface FrequencyOutcome {
  owner: string; sessionId: string; cardId: string; passed: boolean; reason?: FrequencyReason
}
class FrequencyDB extends Dexie {
  progress!: Table<FrequencyProgress, [string, string]>
  receipts!: Table<FrequencyReceipt, [string, string, string]>
  annotations!: Table<FrequencyAnnotation, [string, string]>
  practiceState!: Table<FrequencyPracticeState, [string, string]>
  constructor() {
    super('ielts-frequency-progress')
    this.version(1).stores({ progress: '[owner+cardId], owner', receipts: '[owner+sessionId+cardId], owner' })
    this.version(2).stores({ progress: '[owner+cardId], owner', receipts: '[owner+sessionId+cardId], owner', annotations: '[owner+cardId], owner' })
    this.version(3).stores({ progress: '[owner+cardId], owner', receipts: '[owner+sessionId+cardId], owner', annotations: '[owner+cardId], owner', practiceState: '[owner+key], owner' })
  }
}
export const frequencyDB = new FrequencyDB()
function validateId(value: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('账号、测试或词条标识无效')
}
function validateReason(reason: FrequencyReason) {
  if (reason !== null && !['pronunciation', 'spelling', 'both'].includes(reason)) throw new Error('错题原因无效')
}
export async function saveFrequencyOutcome(input: FrequencyOutcome): Promise<void> {
  validateId(input.owner); validateId(input.sessionId); validateId(input.cardId)
  if (typeof input.passed !== 'boolean') throw new Error('测试判定无效')
  if (input.reason !== undefined) validateReason(input.reason)
  await frequencyDB.transaction('rw', frequencyDB.progress, frequencyDB.receipts, frequencyDB.annotations, async () => {
    if (await frequencyDB.receipts.get([input.owner, input.sessionId, input.cardId])) return
    const previous = await frequencyDB.progress.get([input.owner, input.cardId])
    const annotation = await frequencyDB.annotations.get([input.owner, input.cardId])
    await frequencyDB.progress.put({ owner: input.owner, cardId: input.cardId, passed: input.passed,
      attempts: (previous?.attempts ?? 0) + 1, mistakes: (previous?.mistakes ?? 0) + (input.passed ? 0 : 1),
      reason: annotation?.reason !== undefined ? annotation.reason : input.reason === undefined ? previous?.reason ?? null : input.reason, updatedAt: Date.now() })
    await frequencyDB.receipts.add({ owner: input.owner, sessionId: input.sessionId, cardId: input.cardId })
  })
}
export async function readFrequencyProgress(owner: string): Promise<FrequencyProgress[]> {
  validateId(owner)
  return frequencyDB.progress.where('owner').equals(owner).toArray()
}
export async function setFrequencyReason(owner: string, cardId: string, reason: FrequencyReason): Promise<void> {
  validateId(owner); validateId(cardId); validateReason(reason)
  await frequencyDB.transaction('rw', frequencyDB.progress, async () => {
    const current = await frequencyDB.progress.get([owner, cardId])
    if (!current) throw new Error('这个词尚未确认测试，无法标注原因')
    await frequencyDB.progress.put({ ...current, reason, updatedAt: Date.now() })
  })
}
export async function clearFrequencyProgress(owner: string): Promise<void> {
  validateId(owner)
  await frequencyDB.transaction('rw', frequencyDB.progress, frequencyDB.receipts, frequencyDB.practiceState, async () => {
    await frequencyDB.progress.where('owner').equals(owner).delete()
    await frequencyDB.receipts.where('owner').equals(owner).delete()
    await frequencyDB.practiceState.where('owner').equals(owner).delete()
  })
}
export function selectFrequencyCards(cards: readonly IELTSCard[], progress: readonly FrequencyProgress[],
  kind: 'untested' | 'mistakes' | 'all', reason: FrequencyReason | 'all' = 'all'): IELTSCard[] {
  const byId = new Map(progress.map(record => [record.cardId, record]))
  return cards.filter(card => {
    const record = byId.get(card.id)
    if (kind === 'all') return true
    if (kind === 'untested') return !record
    return !!record && !record.passed && (reason === 'all' || record.reason === reason)
  })
}
export function selectFrequencyTestCards(cards: readonly IELTSCard[], progress: readonly FrequencyProgress[]): IELTSCard[] {
  const eligible = [...selectFrequencyCards(cards, progress, 'mistakes'), ...selectFrequencyCards(cards, progress, 'untested')]
  const seen = new Set<string>()
  return eligible.filter(card => {
    if (seen.has(card.id)) return false
    seen.add(card.id)
    return true
  })
}
