type ReviewQueue = Record<string, number>

const reviewKey = (owner: string) => `ielts-match-review-v1:${owner}`

export function readMatchReview(owner: string): ReviewQueue {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(reviewKey(owner)) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, due]) => Number.isFinite(due)))
  } catch {
    return {}
  }
}

export function nextMatchReviewDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
}

export function getDueMatchGroups(owner: string, now = Date.now()) {
  return Object.entries(readMatchReview(owner)).filter(([, due]) => due <= now).map(([id]) => id)
}

export function saveMatchReview(owner: string, ids: string[], recalled = false) {
  const queue = readMatchReview(owner)
  for (const id of ids) {
    if (recalled) delete queue[id]
    else queue[id] = nextMatchReviewDay()
  }
  localStorage.setItem(reviewKey(owner), JSON.stringify(queue))
}
