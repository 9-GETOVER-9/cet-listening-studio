import { db } from '@/db/schema'
import { buildDataset, type HistoryCard, type HistoryReview, type OptimizationScope } from './fsrsOptimization'

function group(rows: { cardId: string; review: HistoryReview }[]) {
  const result = new Map<string, HistoryReview[]>()
  for (const row of rows) {
    const reviews = result.get(row.cardId) ?? []
    reviews.push(row.review); result.set(row.cardId, reviews)
  }
  return result
}
export async function loadTrainingDataset(owner: string, scope: OptimizationScope, includeLegacy: boolean) {
  let histories: HistoryCard[]
  if (scope === 'reading') {
    const { readingDB } = await import('./ieltsReadingStore')
    histories = await readingDB.transaction('r', readingDB.progress, readingDB.logs, async () => {
      const progress = await readingDB.progress.where('owner').equals(owner).toArray()
      const logs = await readingDB.logs.where('owner').equals(owner).toArray()
      const grouped = group(logs.filter(r => r.mode !== 'retry').map(r => ({
        cardId: r.cardId, review: { id: r.operationId, owner: r.owner, rating: r.rating, at: r.reviewedAt },
      })))
      return progress.filter(p => p.fsrs.reps > 0).map(p => ({
        id: p.cardId, reps: p.fsrs.reps, lastReview: new Date(p.fsrs.last_review!).getTime(), reviews: grouped.get(p.cardId) ?? [],
      }))
    })
  } else if (scope === 'notebook') {
    histories = await db.transaction('r', db.notebook, db.notebookReviews, async () => {
      const items = await db.notebook.toArray()
      const logs = await db.notebookReviews.toArray()
      const grouped = group(logs.map(r => ({ cardId: r.notebookId, review: { id: r.operationId, owner: r.owner, rating: r.rating, at: r.timestamp, beforeReps: r.beforeReps } })))
      return items.filter(p => p.fsrsNotebook.reps > 0).map(p => ({
        id: p.notebookId, reps: p.fsrsNotebook.reps, lastReview: new Date(p.fsrsNotebook.last_review!).getTime(), reviews: grouped.get(p.notebookId) ?? [],
      }))
    })
  } else {
    histories = await db.transaction('r', db.cards, db.studyLog, async () => {
      const cards = await db.cards.toArray()
      const logs = await db.studyLog.toArray()
      const grouped = group(logs.filter(r => r.action === 'review').map(r => ({
        cardId: r.cardId, review: { id: r.operationId ?? `legacy:${r.id}`, owner: r.owner, rating: r.rating ?? 0, at: r.timestamp, beforeReps: r.beforeReps },
      })))
      return cards.filter(p => p.fsrsMain.reps > 0 && !p.isTitle).map(p => ({
        id: p.cardId, reps: p.fsrsMain.reps, lastReview: new Date(p.fsrsMain.last_review!).getTime(), reviews: grouped.get(p.cardId) ?? [],
      }))
    })
  }
  return buildDataset(histories, owner, scope === 'main' && includeLegacy)
}
