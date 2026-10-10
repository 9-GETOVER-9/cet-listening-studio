import Dexie, { type Table } from 'dexie'
import { Rating, type FSRSState } from '@/types'
import { createInitialFSRSState, scheduleFSRSState } from './fsrsScheduler'
import { normalizeFSRSState } from './fsrsState'
import { finiteNumber, record, validText, type ReadingCard, type ReadingQuestion } from './ieltsReading'

export interface ReadingProgress { owner: string; cardId: string; fsrs: FSRSState; covered: string[]; updatedAt: number }
export interface ReadingAnnotation { owner: string; cardId: string; note: string; marked: string[] }
export type ReadingMode = 'quiz' | 'recall' | 'retry'
export interface ReadingSession {
  owner: string; id: string; mode: ReadingMode; cardIds: string[]; cursor: number; selected: string[]
  question?: ReadingQuestion; revealed: boolean; graded: boolean; completed: number; correct: number; createdAt: number
}
export interface ReadingLog {
  owner: string; operationId: string; cardId: string; mode: ReadingMode; rating: Rating
  selected: string[]; shown: string[]; missed: string[]; extra: string[]; passed: boolean; reviewedAt: number; question?: ReadingQuestion
}
export interface ReadingSnapshot { progress: ReadingProgress[]; annotations: ReadingAnnotation[]; logs: ReadingLog[]; session?: ReadingSession }
class ReadingDB extends Dexie {
  progress!: Table<ReadingProgress, [string, string]>
  annotations!: Table<ReadingAnnotation, [string, string]>
  logs!: Table<ReadingLog, [string, string]>
  sessions!: Table<ReadingSession, string>
  constructor() {
    super('ielts-reading-538')
    this.version(1).stores({ progress: '[owner+cardId], owner', annotations: '[owner+cardId], owner', logs: '[owner+operationId], owner', sessions: 'owner' })
  }
}
export const readingDB = new ReadingDB()
function strings(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('表达列表无效')
  input.forEach(value => validText(value)); if (new Set(input).size !== input.length) throw new Error('表达列表重复')
  return input as string[]
}
function expressionIds(input: unknown, card: ReadingCard): string[] {
  const ids = strings(input), allowed = new Set(card.expressions.map(e => e.id))
  if (ids.some(id => !allowed.has(id))) throw new Error('表达不属于当前词条')
  return ids
}
function validateQuestion(raw: unknown, card?: ReadingCard, expressions?: ReadonlyMap<string, string>): ReadingQuestion {
  const q = record(raw); validText(q.cardId)
  if (card && q.cardId !== card.id || !Array.isArray(q.options) || !q.options.length) throw new Error('练习题目无效')
  const ids = new Set<string>()
  const options = q.options.map(rawOption => {
    const o = record(rawOption); validText(o.id); validText(o.text)
    if (typeof o.correct !== 'boolean' || ids.has(o.id)) throw new Error('练习选项无效')
    if (card && o.correct !== card.expressions.some(e => e.id === o.id && e.text === o.text)) throw new Error('正确选项不符合当前词条')
    if (expressions && expressions.get(o.id) !== o.text) throw new Error('备份选项不符合当前词库')
    ids.add(o.id); return { id: o.id, text: o.text, correct: o.correct }
  })
  if (!options.some(o => o.correct)) throw new Error('练习缺少正确对应')
  return { cardId: q.cardId, options }
}
function sameSet(a: readonly string[], b: readonly string[]) { return [...a].sort().join('|') === [...b].sort().join('|') }
export async function readReadingSnapshot(owner: string): Promise<ReadingSnapshot> {
  validText(owner)
  return readingDB.transaction('r', readingDB.progress, readingDB.annotations, readingDB.logs, readingDB.sessions, async () => ({
    progress: await readingDB.progress.where('owner').equals(owner).toArray(),
    annotations: await readingDB.annotations.where('owner').equals(owner).toArray(),
    logs: await readingDB.logs.where('owner').equals(owner).toArray(), session: await readingDB.sessions.get(owner),
  }))
}
export async function saveReadingAnnotation(owner: string, card: ReadingCard, patch: { note?: string; marked?: string[] }): Promise<void> {
  validText(owner); validText(card.id)
  if (patch.note !== undefined && (typeof patch.note !== 'string' || patch.note.length > 10000)) throw new Error('笔记最多 10000 字符')
  if (patch.marked !== undefined) expressionIds(patch.marked, card)
  await readingDB.transaction('rw', readingDB.annotations, async () => {
    const existing = await readingDB.annotations.get([owner, card.id])
    await readingDB.annotations.put({ owner, cardId: card.id, note: existing?.note ?? '', marked: existing?.marked ?? [], ...patch })
  })
}
export async function saveReadingSession(session: ReadingSession): Promise<void> {
  validateSession(session)
  await readingDB.sessions.put(session)
}
export async function endReadingSession(owner: string): Promise<void> { validText(owner); await readingDB.sessions.delete(owner) }

interface ReviewInput extends Omit<ReadingLog, 'cardId' | 'reviewedAt'> { card: ReadingCard; reviewedAt: Date; session?: ReadingSession }
export async function commitReadingReview(input: ReviewInput): Promise<void> {
  validText(input.owner); validText(input.operationId)
  if (!['quiz', 'recall', 'retry'].includes(input.mode) || ![1, 2, 3, 4].includes(input.rating) || typeof input.passed !== 'boolean' || input.card.status === 'pending') throw new Error('复习记录无效')
  if (!input.passed && input.rating !== Rating.Again || input.passed && input.rating === Rating.Again) throw new Error('评分与作答结果不匹配')
  const shown = expressionIds(input.shown, input.card), selected = strings(input.selected), missed = expressionIds(input.missed, input.card), extra = strings(input.extra)
  if (!shown.length) throw new Error('复习缺少对应表达')
  const question = input.mode === 'recall' ? undefined : validateQuestion(input.question, input.card)
  if (question && (!sameSet(shown, question.options.filter(o => o.correct).map(o => o.id)) || selected.some(id => !question.options.some(o => o.id === id)))) throw new Error('记录不符合当前题目')
  if (input.mode !== 'recall') {
    const expectedMissed = shown.filter(id => !selected.includes(id)), expectedExtra = selected.filter(id => !shown.includes(id))
    if (input.passed !== (!expectedMissed.length && !expectedExtra.length) || !sameSet(expectedMissed, missed) || !sameSet(expectedExtra, extra)) throw new Error('复习判定不一致')
  }
  const reviewedAt = input.reviewedAt.getTime(); finiteNumber(reviewedAt)
  if (input.session) { validateSession(input.session); if (input.session.owner !== input.owner) throw new Error('复习账号不匹配') }
  await readingDB.transaction('rw', readingDB.progress, readingDB.logs, readingDB.sessions, async () => {
    if (await readingDB.logs.get([input.owner, input.operationId])) return
    if (input.mode !== 'retry') {
      const previous = await readingDB.progress.get([input.owner, input.card.id])
      const fsrs = scheduleFSRSState(previous?.fsrs ?? createInitialFSRSState(input.reviewedAt), input.rating, input.reviewedAt)
      await readingDB.progress.put({ owner: input.owner, cardId: input.card.id, fsrs, covered: [...new Set([...(previous?.covered ?? []), ...shown])], updatedAt: reviewedAt })
    }
    await readingDB.logs.add({ owner: input.owner, operationId: input.operationId, cardId: input.card.id, rating: input.rating, mode: input.mode, selected, shown, missed, extra, passed: input.passed, reviewedAt, ...(question ? { question } : {}) })
    if (input.session) await readingDB.sessions.put(input.session)
  })
}

function validDate(value: unknown): Date {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) throw new Error('复习日期无效')
  const date = new Date(value); finiteNumber(date.getTime()); return date
}
function validateSession(raw: unknown, cards?: ReadonlyMap<string, ReadingCard>): ReadingSession {
  const s = record(raw); validText(s.owner); validText(s.id)
  const cardIds = strings(s.cardIds), selected = strings(s.selected)
  if (!cardIds.length || cards && cardIds.some(id => !cards.has(id) || cards.get(id)!.status === 'pending')) throw new Error('练习词条无效')
  for (const key of ['cursor', 'completed', 'correct', 'createdAt']) finiteNumber(s[key], true)
  if ((s.cursor as number) >= cardIds.length || (s.correct as number) > (s.completed as number) || (s.completed as number) > cardIds.length || !['quiz', 'recall', 'retry'].includes(s.mode as string) || typeof s.revealed !== 'boolean' || typeof s.graded !== 'boolean') throw new Error('练习状态无效')
  if (s.graded && !s.revealed || s.completed !== (s.cursor as number) + (s.graded ? 1 : 0)) throw new Error('练习进度不一致')
  if (cards && s.mode !== 'recall' && !s.question) throw new Error('备份练习缺少保存的题目')
  let question: ReadingQuestion | undefined
  if (s.question !== undefined) {
    question = validateQuestion(s.question, cards?.get(cardIds[s.cursor as number]), cards ? new Map([...cards.values()].flatMap(c => c.expressions).map(e => [e.id, e.text])) : undefined)
    if (question.cardId !== cardIds[s.cursor as number] || selected.some(id => !question!.options.some(o => o.id === id))) throw new Error('练习答案无效')
  }
  return { owner: s.owner, id: s.id, mode: s.mode as ReadingMode, cardIds, cursor: s.cursor as number, selected, revealed: s.revealed, graded: s.graded, completed: s.completed as number, correct: s.correct as number, createdAt: s.createdAt as number, ...(question ? { question } : {}) }
}
export interface ReadingBackup extends ReadingSnapshot { format: 'ielts-reading-538-backup-v1'; exportedAt: string }
export async function exportReadingBackup(owner: string): Promise<ReadingBackup> {
  return { format: 'ielts-reading-538-backup-v1', exportedAt: new Date().toISOString(), ...await readReadingSnapshot(owner) }
}
export async function restoreReadingBackup(owner: string, value: unknown, cards: readonly ReadingCard[]): Promise<void> {
  validText(owner); const input = record(value)
  if (input.format !== 'ielts-reading-538-backup-v1') throw new Error('不是阅读 538 学习备份')
  validDate(input.exportedAt)
  const byId = new Map(cards.map(c => [c.id, c]))
  const allExpressions = new Map(cards.flatMap(c => c.expressions).map(e => [e.id, e.text]))
  const parseRows = <T>(raw: unknown, parse: (r: Record<string, unknown>, c: ReadingCard) => T): T[] => {
    if (!Array.isArray(raw)) throw new Error('备份内容不完整')
    return raw.map(value => { const r = record(value); validText(r.cardId); const card = byId.get(r.cardId); if (!card) throw new Error('备份词条不属于当前词库'); return parse(r, card) })
  }
  const progress = parseRows(input.progress, (r, c): ReadingProgress => {
    const f = record(r.fsrs)
    for (const key of ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'learning_steps']) finiteNumber(f[key], ['reps', 'lapses', 'learning_steps'].includes(key))
    if (![0, 1, 2, 3].includes(f.state as number) || (f.difficulty as number) > 10) throw new Error('备份复习状态无效')
    const fsrs = normalizeFSRSState({ ...f, due: validDate(f.due), last_review: f.last_review === undefined ? undefined : validDate(f.last_review) } as FSRSState)
    finiteNumber(r.updatedAt, true)
    return { owner, cardId: c.id, fsrs, covered: expressionIds(r.covered, c), updatedAt: r.updatedAt }
  })
  const annotations = parseRows(input.annotations, (r, c): ReadingAnnotation => {
    if (typeof r.note !== 'string' || r.note.length > 10000) throw new Error('备份笔记无效')
    return { owner, cardId: c.id, note: r.note, marked: expressionIds(r.marked, c) }
  })
  const logs = parseRows(input.logs, (r, c): ReadingLog => {
    validText(r.operationId); finiteNumber(r.reviewedAt, true)
    if (!['quiz', 'recall', 'retry'].includes(r.mode as string) || ![1, 2, 3, 4].includes(r.rating as number) || typeof r.passed !== 'boolean' || r.passed === (r.rating === Rating.Again)) throw new Error('备份日志无效')
    const shown = expressionIds(r.shown, c), selected = strings(r.selected), missed = expressionIds(r.missed, c), extra = strings(r.extra)
    const question = r.mode === 'recall' ? undefined : validateQuestion(r.question, c, allExpressions)
    if (!shown.length || selected.some(id => !allExpressions.has(id)) || extra.some(id => !allExpressions.has(id))) throw new Error('备份日志答案无效')
    if (r.mode !== 'recall') {
      const expectedMissed = shown.filter(id => !selected.includes(id)), expectedExtra = selected.filter(id => !shown.includes(id))
      if (r.passed !== (!expectedMissed.length && !expectedExtra.length) || !sameSet(expectedMissed, missed) || !sameSet(expectedExtra, extra) || !sameSet(shown, question!.options.filter(o => o.correct).map(o => o.id)) || selected.some(id => !question!.options.some(o => o.id === id))) throw new Error('备份日志判定无效')
    }
    return { owner, cardId: c.id, operationId: r.operationId, mode: r.mode as ReadingMode, rating: r.rating as Rating, selected, shown, missed, extra, passed: r.passed, reviewedAt: r.reviewedAt, ...(question ? { question } : {}) }
  })
  for (const [rows, key] of [[progress, 'cardId'], [annotations, 'cardId'], [logs, 'operationId']] as const) {
    const ids = rows.map(row => key === 'operationId' ? (row as ReadingLog).operationId : row.cardId)
    if (new Set(ids).size !== ids.length) throw new Error('备份记录重复')
  }
  const session = input.session === undefined ? undefined : { ...validateSession(input.session, byId), owner }
  await readingDB.transaction('rw', readingDB.progress, readingDB.annotations, readingDB.logs, readingDB.sessions, async () => {
    await readingDB.progress.where('owner').equals(owner).delete(); await readingDB.annotations.where('owner').equals(owner).delete(); await readingDB.logs.where('owner').equals(owner).delete(); await readingDB.sessions.delete(owner)
    await readingDB.progress.bulkPut(progress); await readingDB.annotations.bulkPut(annotations); await readingDB.logs.bulkPut(logs)
    if (session) await readingDB.sessions.put(session)
  })
}
