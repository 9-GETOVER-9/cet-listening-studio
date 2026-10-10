export type ReadingRelation = 'lexical' | 'reference' | 'parallel' | 'contrast' | 'cause' | 'context'
export interface ReadingExpression { id: string; text: string }
export interface ReadingCard {
  id: string; category: 1 | 2 | 3; order: number; sourceRow: number
  word: string; meaning: string; relation: ReadingRelation
  status: 'verified' | 'extracted' | 'pending'; expressions: ReadingExpression[]
}
export interface ReadingCorpus { version: 'ielts-reading-538-v1'; title: string; cards: ReadingCard[] }
export interface ReadingQuestion { cardId: string; options: (ReadingExpression & { correct: boolean })[] }
export interface ReadingResult { passed: boolean; missed: string[]; extra: string[] }
export const READING_RELATIONS: Record<ReadingRelation, string> = { lexical: '词语对应', reference: '指代关系', parallel: '并列结构', contrast: '转折结构', cause: '因果关系', context: '语境对应' }

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('阅读数据格式无效')
  return value as Record<string, unknown>
}
export function validText(value: unknown, max = 10000): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('阅读数据包含无效文本')
}
export function finiteNumber(value: unknown, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || integer && !Number.isSafeInteger(value)) throw new Error('阅读数据包含无效数值')
}
export function parseReadingCorpus(value: unknown): ReadingCorpus {
  const input = record(value)
  if (input.version !== 'ielts-reading-538-v1' || !Array.isArray(input.cards) || !input.cards.length) throw new Error('阅读词库版本或词条无效')
  validText(input.title)
  const ids = new Set<string>(), expressionIds = new Set<string>()
  const cards = input.cards.map(raw => {
    const c = record(raw)
    for (const key of ['id', 'word', 'meaning']) validText(c[key])
    finiteNumber(c.order, true); finiteNumber(c.sourceRow, true)
    if (![1, 2, 3].includes(c.category as number) || !Object.hasOwn(READING_RELATIONS, c.relation as string) || !['verified', 'extracted', 'pending'].includes(c.status as string)) throw new Error('阅读词条分类无效')
    if (ids.has(c.id as string) || !Array.isArray(c.expressions) || !c.expressions.length) throw new Error('阅读词条重复或缺少对应表达')
    ids.add(c.id as string)
    const texts = new Set<string>()
    const expressions = c.expressions.map(rawExpression => {
      const e = record(rawExpression); validText(e.id); validText(e.text)
      if (expressionIds.has(e.id) || texts.has(e.text.trim().toLowerCase())) throw new Error('阅读表达重复')
      expressionIds.add(e.id); texts.add(e.text.trim().toLowerCase())
      return { id: e.id, text: e.text }
    })
    return { id: c.id, word: c.word, meaning: c.meaning, category: c.category, order: c.order, sourceRow: c.sourceRow, relation: c.relation, status: c.status, expressions } as ReadingCard
  })
  return { version: 'ielts-reading-538-v1', title: input.title, cards }
}

export function buildReadingQuestion(card: ReadingCard, cards: readonly ReadingCard[], variation = 0): ReadingQuestion {
  if (card.status === 'pending') throw new Error('该词条仍待核验，请先查阅')
  const offset = (Math.max(0, Math.floor(variation)) * 4) % card.expressions.length
  const positives = Array.from({ length: Math.min(4, card.expressions.length) }, (_, i) => ({ ...card.expressions[(offset + i) % card.expressions.length], correct: true }))
  const known = new Set(card.expressions.map(e => e.text.trim().toLowerCase()))
  known.add(card.word.trim().toLowerCase())
  const pool = cards.filter(c => c.id !== card.id && c.status !== 'pending').flatMap(c => c.expressions)
  const negatives: ReadingQuestion['options'] = []
  const seen = new Set(known)
  for (let i = 0; i < pool.length && negatives.length < 2; i++) {
    const candidate = pool[(i + variation * 7) % pool.length]
    const normalized = candidate.text.trim().toLowerCase()
    if (!seen.has(normalized)) { negatives.push({ ...candidate, correct: false }); seen.add(normalized) }
  }
  const options = [...positives, ...negatives]
  let seed = [...`${card.id}:${variation}`].reduce((s, char) => (Math.imul(s, 31) + char.charCodeAt(0)) >>> 0, 17)
  for (let i = options.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1); [options[i], options[j]] = [options[j], options[i]]
  }
  return { cardId: card.id, options }
}
export function gradeReadingQuestion(question: ReadingQuestion, selected: readonly string[]): ReadingResult {
  const ids = new Set(question.options.map(o => o.id))
  if (new Set(selected).size !== selected.length || selected.some(id => !ids.has(id))) throw new Error('选项与当前题目不匹配')
  const chosen = new Set(selected)
  const missed = question.options.filter(o => o.correct && !chosen.has(o.id)).map(o => o.id)
  const extra = selected.filter(id => !question.options.find(o => o.id === id)!.correct)
  return { passed: !missed.length && !extra.length, missed, extra }
}
export function selectReadingQueue(cards: readonly ReadingCard[], states: ReadonlyMap<string, { due: Date; reps: number }>, kind: 'due' | 'new' | 'all', now = new Date()): ReadingCard[] {
  return cards.filter(c => c.status !== 'pending').filter(c => {
    const state = states.get(c.id)
    return kind === 'all' || (kind === 'new' ? !state?.reps : !!state?.reps && new Date(state.due).getTime() <= now.getTime())
  }).sort((a, b) => kind === 'due' ? new Date(states.get(a.id)!.due).getTime() - new Date(states.get(b.id)!.due).getTime() || a.order - b.order : a.order - b.order)
}
