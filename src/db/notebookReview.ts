import { db } from './schema'
import { scheduleFSRSState } from '@/lib/fsrsScheduler'
import type { Rating } from '@/types'

export async function commitNotebookRating(notebookId: string, rating: Rating, now: Date, owner: string | undefined, operationId: string) {
  return db.transaction('rw', db.notebook, db.notebookReviews, async () => {
    const item = await db.notebook.get(notebookId)
    if (!item) throw new Error('难点已删除，无法评分')
    if (await db.notebookReviews.get(operationId)) return item.fsrsNotebook
    const fsrsNotebook = scheduleFSRSState(item.fsrsNotebook, rating, now, { scope: 'notebook', owner })
    await db.notebook.update(notebookId, { fsrsNotebook })
    await db.notebookReviews.add({ operationId, notebookId, owner, rating, timestamp: now.getTime(), beforeReps: item.fsrsNotebook.reps })
    return fsrsNotebook
  })
}
