import { describe, expect, it } from 'vitest'
import { default_w, FSRSAlgorithm } from 'ts-fsrs'
import { buildDataset, optimizeParameters, evaluateParameters, validateWeights, type HistoryCard } from './fsrsOptimization'

const day = 86400000
function history(id: string, owner = 'a'): HistoryCard {
  return { id, reps: 3, lastReview: 10 * day, reviews: [
    { id: id + ':1', owner, rating: 3, at: day, beforeReps: 0 },
    { id: id + ':2', owner, rating: 3, at: 3 * day, beforeReps: 1 },
    { id: id + ':3', owner, rating: 1, at: 10 * day, beforeReps: 2 },
  ] }
}
describe('personal FSRS training data', () => {
  it('sorts and accepts only complete histories belonging to the owner', () => {
    const valid = history('valid'); valid.reviews.reverse()
    const missing = history('missing'); missing.reviews.splice(1, 1)
    const other = history('other', 'b')
    const gap = history('gap'); gap.reviews[1].beforeReps = 8
    const duplicate = history('duplicate'); duplicate.reviews[1].id = duplicate.reviews[0].id
    const data = buildDataset([valid, missing, other, gap, duplicate], 'a', false)
    expect(data.cards.map(c => c.id)).toEqual(['valid'])
    expect(data.interdayReviews).toBe(2)
    expect(data.excludedCards).toBe(4)
  })
  it('requires explicit consent for legacy logs with no owner and never claims another account', () => {
    const legacy = history('old'); legacy.reviews.forEach(r => { delete r.owner; delete r.beforeReps })
    expect(buildDataset([legacy], 'a', false).cards).toHaveLength(0)
    expect(buildDataset([legacy, history('other', 'b')], 'a', true).cards).toHaveLength(1)
  })
  it('rejects stale snapshots, future/invalid dates and invalid grades', () => {
    const stale = history('stale'); stale.lastReview++
    const invalid = history('invalid'); invalid.reviews[0].rating = 0
    const future = history('future'); future.reviews[0].at = Date.now() + day
    expect(buildDataset([stale, invalid, future], 'a', false).cards).toHaveLength(0)
  })
  it('rejects wrong model versions and out-of-range weights', () => {
    expect(validateWeights([...default_w])).toBe(true)
    expect(validateWeights(default_w.slice(0, 19))).toBe(false)
    expect(validateWeights([...default_w.slice(0, 20), NaN])).toBe(false)
    expect(validateWeights([...default_w.slice(0, 20), 99])).toBe(false)
  })
  it('does not optimize insufficient data', () => {
    expect(() => optimizeParameters(buildDataset([history('x')], 'a', false).cards, [...default_w])).toThrow(/记录不足/)
  })
  it('improves held-out likelihood for reproducible synthetic memory histories', () => {
    const target = [...default_w]; target[2] = 0.5; target[8] = 0.6
    const model = new FSRSAlgorithm({ w: target })
    let seed = 42
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const cards = Array.from({ length: 80 }, (_, n) => {
      let memory = model.next_state(null, 0, 3)
      const reviews = [{ rating: 3, delta: 0 }]
      for (let i = 0; i < 8; i++) {
        const delta = 1 + Math.floor(random() * 8)
        const rating = random() < model.forgetting_curve(delta, memory.stability) ? 3 : 1
        reviews.push({ rating, delta }); memory = model.next_state(memory, delta, rating)
      }
      return { id: String(n), reviews }
    })
    const result = optimizeParameters(cards, [...default_w])
    expect(result.acceptable).toBe(true)
    expect(result.after.logLoss).toBeLessThan(result.before.logLoss)
    expect(result.after.logLoss).toBeLessThan(result.defaults.logLoss)
    expect(validateWeights(result.weights)).toBe(true)
    expect(evaluateParameters(cards, result.weights).logLoss).toBeLessThan(evaluateParameters(cards, [...default_w]).logLoss)
  })
})
