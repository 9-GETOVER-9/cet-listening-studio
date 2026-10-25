import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { useAccountSyncStatus } from '@/lib/accountSync'
import { parseLearningResume } from '@/lib/learningResume'

export function useLearningResume() {
  const owner = useAccountSyncStatus(s => s.owner)
  const snapshot = useLiveQuery(async () => {
    try { return { owner, resume: parseLearningResume((await db.settings.get(`cloud-resume:${owner}`))?.value) } }
    catch { return { owner, resume: null } }
  }, [owner])
  return snapshot?.owner === owner ? snapshot.resume : null
}
