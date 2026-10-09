import { frequencyDB, type FrequencyReason } from './ieltsFrequencyProgress'
export interface AnnotationSeed { cardId: string; note: string; reason: FrequencyReason; sourceFlag: string }
export interface FrequencyAnnotation { owner: string; cardId: string; note?: string; reason?: FrequencyReason }
export const annotationDB = frequencyDB
function validateId(value: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('账号或词条标识无效')
}
function validateReason(value: unknown): asserts value is FrequencyReason {
  if (value !== null && value !== 'pronunciation' && value !== 'spelling' && value !== 'both') throw new Error('词条标签无效')
}
function validateNote(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 10000) throw new Error('笔记须为文本，且不超过 10000 字符')
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
export async function readFrequencyAnnotations(owner: string): Promise<FrequencyAnnotation[]> {
  validateId(owner)
  return annotationDB.annotations.where('owner').equals(owner).toArray()
}
export async function saveFrequencyAnnotation(owner: string, cardId: string, patch: { note?: string; reason?: FrequencyReason }): Promise<void> {
  validateId(owner); validateId(cardId)
  if (!isObject(patch)) throw new Error('笔记内容无效')
  if (patch.note !== undefined) validateNote(patch.note)
  if (patch.reason !== undefined) validateReason(patch.reason)
  if (patch.note === undefined && patch.reason === undefined) return
  await annotationDB.transaction('rw', annotationDB.annotations, annotationDB.progress, async () => {
    const previous = await annotationDB.annotations.get([owner, cardId])
    const next: FrequencyAnnotation = { ...previous, owner, cardId }
    if (patch.note !== undefined) next.note = patch.note
    if (patch.reason !== undefined) next.reason = patch.reason
    await annotationDB.annotations.put(next)
    if (patch.reason !== undefined) {
      const progress = await annotationDB.progress.get([owner, cardId])
      if (progress) await annotationDB.progress.put({ ...progress, reason: patch.reason, updatedAt: Date.now() })
    }
  })
}
export async function clearFrequencyAnnotations(owner: string): Promise<void> {
  validateId(owner)
  await annotationDB.annotations.where('owner').equals(owner).delete()
}
export function resolveFrequencyAnnotation(cardId: string, seeds: Map<string, AnnotationSeed>, local: Map<string, FrequencyAnnotation>, progressReason?: FrequencyReason): AnnotationSeed {
  const seed = seeds.get(cardId) ?? { cardId, note: '', reason: null, sourceFlag: '' }
  const annotation = local.get(cardId)
  return { ...seed, note: annotation?.note !== undefined ? annotation.note : seed.note,
    reason: annotation?.reason !== undefined ? annotation.reason : progressReason ?? seed.reason }
}
export function parseFrequencyAnnotationSeeds(input: unknown): Map<string, AnnotationSeed> {
  if (!isObject(input) || input.version !== 'ielts-frequency-annotations-v1' || !Array.isArray(input.cards)) throw new Error('高频笔记数据格式无效')
  const seeds = new Map<string, AnnotationSeed>()
  for (const card of input.cards) {
    if (!isObject(card) || typeof card.cardId !== 'string' || typeof card.sourceFlag !== 'string') throw new Error('高频笔记词条格式无效')
    validateId(card.cardId); validateNote(card.note); validateReason(card.reason)
    if (seeds.has(card.cardId)) throw new Error('高频笔记词条重复')
    seeds.set(card.cardId, { cardId: card.cardId, note: card.note, reason: card.reason, sourceFlag: card.sourceFlag })
  }
  return seeds
}
