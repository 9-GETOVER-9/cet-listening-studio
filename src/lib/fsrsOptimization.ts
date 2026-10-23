import { CLAMP_PARAMETERS, FSRSAlgorithm, W17_W18_Ceiling, default_w, dateDiffInDays } from 'ts-fsrs'

export type OptimizationScope = 'main' | 'notebook' | 'reading'
export interface HistoryReview { id: string; owner?: string; rating: number; at: number; beforeReps?: number }
export interface HistoryCard { id: string; reps: number; lastReview: number; reviews: HistoryReview[] }
export interface TrainingCard { id: string; reviews: { rating: number; delta: number }[] }
export interface Dataset { cards: TrainingCard[]; reviews: number; interdayReviews: number; excludedCards: number; limited: boolean }
export interface Metrics { logLoss: number; count: number; successes: number; failures: number }
export interface OptimizationResult {
  weights: number[]; baselineWeights: number[]; before: Metrics; after: Metrics; defaults: Metrics
  trainBefore: Metrics; trainAfter: Metrics; acceptable: boolean; trainingCards: number; validationCards: number
}

// Product data-quality guard, not an official FSRS minimum.
export const MIN_CARDS = 20
export const MIN_INTERDAY_REVIEWS = 100
export const MAX_REVIEWS = 5000
const bounds = CLAMP_PARAMETERS(W17_W18_Ceiling, true)

export function validateWeights(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 21 &&
    value.every((w, i) => typeof w === 'number' && Number.isFinite(w) && w >= bounds[i][0] && w <= bounds[i][1])
}

export function buildDataset(histories: HistoryCard[], owner: string, includeLegacy: boolean, now = Date.now()): Dataset {
  const data: Dataset = { cards: [], reviews: 0, interdayReviews: 0, excludedCards: 0, limited: false }
  for (const card of [...histories].sort((a, b) => a.id.localeCompare(b.id))) {
    const rows = [...card.reviews].sort((a, b) => a.at - b.at)
    const valid = rows.length >= 2 && Number.isInteger(card.reps) && card.reps === rows.length &&
      rows.at(-1)!.at === card.lastReview && new Set(rows.map(r => r.id)).size === rows.length &&
      rows.every((r, i) => r.id && [1, 2, 3, 4].includes(r.rating) &&
        Number.isFinite(r.at) && r.at > 0 && r.at <= now &&
        (r.owner === owner || r.owner === undefined && includeLegacy) &&
        (r.beforeReps === undefined || r.beforeReps === i) &&
        (i === 0 || r.at > rows[i - 1].at))
    if (!valid) { data.excludedCards++; continue }
    const reviews = rows.map((r, i) => ({ rating: r.rating, delta: i ? dateDiffInDays(new Date(rows[i - 1].at), new Date(r.at)) : 0 }))
    if (!reviews.some(r => r.delta > 0)) { data.excludedCards++; continue }
    if (data.reviews + rows.length > MAX_REVIEWS) { data.limited = true; data.excludedCards++; continue }
    data.cards.push({ id: card.id, reviews })
    data.reviews += rows.length
    data.interdayReviews += reviews.filter(r => r.delta > 0).length
  }
  return data
}

export function evaluateParameters(cards: TrainingCard[], weights: number[]): Metrics {
  if (!validateWeights(weights)) throw new Error('FSRS-6 参数无效')
  const model = new FSRSAlgorithm({ w: weights, enable_short_term: true })
  let loss = 0, count = 0, successes = 0
  for (const card of cards) {
    let memory: ReturnType<FSRSAlgorithm['next_state']> | null = null
    for (const review of card.reviews) {
      if (memory && review.delta > 0) {
        const p = Math.min(1 - 1e-7, Math.max(1e-7, model.forgetting_curve(review.delta, memory.stability)))
        const success = review.rating > 1
        loss -= Math.log(success ? p : 1 - p); count++; successes += Number(success)
      }
      memory = model.next_state(memory, review.delta, review.rating)
    }
  }
  return { logLoss: count ? loss / count : Infinity, count, successes, failures: count - successes }
}

export function splitDataset(cards: TrainingCard[]) {
  // Stable card-level split: a card's prefixes never leak into both partitions.
  const sorted = [...cards].sort((a, b) => a.id.localeCompare(b.id))
  return { train: sorted.filter((_, i) => i % 5 !== 0), validation: sorted.filter((_, i) => i % 5 === 0) }
}

export function trainingIssue(cards: TrainingCard[]): string | null {
  const { train, validation } = splitDataset(cards)
  const a = evaluateParameters(train, [...default_w]), b = evaluateParameters(validation, [...default_w])
  if (cards.length < MIN_CARDS || a.count + b.count < MIN_INTERDAY_REVIEWS) {
    return `记录不足：需要至少 ${MIN_CARDS} 张历史完整的卡片、${MIN_INTERDAY_REVIEWS} 次跨日复习评分。`
  }
  if (!a.successes || !a.failures || !b.successes || !b.failures) return '训练与验证记录都需要包含记住和忘记的结果，请继续如实评分。'
  return null
}

export function optimizeParameters(cards: TrainingCard[], initial: number[], progress?: (percent: number) => void): OptimizationResult {
  if (!validateWeights(initial)) throw new Error('当前参数无效')
  const issue = trainingIssue(cards)
  if (issue) throw new Error(issue)
  const { train, validation } = splitDataset(cards)
  const trainBefore = evaluateParameters(train, initial)
  const before = evaluateParameters(validation, initial)
  let weights = [...initial]
  // Shrink toward population defaults. Only training data is used in search.
  const objective = (w: number[]) => evaluateParameters(train, w).logLoss +
    0.001 * w.reduce((sum, x, i) => sum + ((x - default_w[i]) / Math.max(default_w[i], 0.1)) ** 2, 0) / w.length
  let best = objective(weights)
  const passes = [0.4, 0.2, 0.1, 0.05]
  let completed = 0
  for (const scale of passes) {
    for (let i = 0; i < 21; i++) {
      const start = weights[i]
      const step = Math.max(Math.abs(start), Math.abs(default_w[i]), 0.05) * scale
      for (const direction of [-1, 1]) {
        const candidate = [...weights]
        candidate[i] = Math.min(bounds[i][1], Math.max(bounds[i][0], start + direction * step))
        const score = objective(candidate)
        if (Number.isFinite(score) && score < best) { weights = candidate; best = score }
      }
      progress?.(Math.round(++completed / (passes.length * 21) * 100))
    }
  }
  const after = evaluateParameters(validation, weights), defaults = evaluateParameters(validation, [...default_w])
  const trainAfter = evaluateParameters(train, weights)
  const acceptable = validateWeights(weights) && trainAfter.logLoss < trainBefore.logLoss &&
    after.logLoss < before.logLoss && after.logLoss < defaults.logLoss
  return { weights, baselineWeights: initial, before, after, defaults, trainBefore, trainAfter, acceptable, trainingCards: train.length, validationCards: validation.length }
}
