import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { db } from './schema'
import { commitNotebookRating } from './notebookReview'
import { createInitialFSRSState } from '@/lib/fsrsScheduler'

beforeEach(async () => {
  await db.delete(); await db.open()
  await db.notebook.put({ notebookId: 'n', type: 'vocabulary', content: 'word', exampleSentence: '', sourceCardId: 'c', sourceTag: '', fsrsNotebook: createInitialFSRSState(), createdAt: Date.now() })
})
it('writes notebook history with the state atomically and deduplicates retries', async () => {
  await commitNotebookRating('n', 3, new Date(), 'a', 'op')
  await commitNotebookRating('n', 3, new Date(), 'a', 'op')
  expect((await db.notebook.get('n'))?.fsrsNotebook.reps).toBe(1)
  expect(await db.notebookReviews.toArray()).toMatchObject([{ owner: 'a', beforeReps: 0, operationId: 'op', rating: 3 }])
})
it('rolls back the state when the containing transaction aborts', async () => {
  await expect(db.transaction('rw', db.notebook, db.notebookReviews, async () => {
    await commitNotebookRating('n', 3, new Date(), 'a', 'op')
    throw new Error('abort')
  })).rejects.toThrow('abort')
  expect((await db.notebook.get('n'))?.fsrsNotebook.reps).toBe(0)
  expect(await db.notebookReviews.count()).toBe(0)
})
