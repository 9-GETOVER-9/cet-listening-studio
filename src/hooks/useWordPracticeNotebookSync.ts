import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { syncNotebookItem, deleteNotebookItemSync } from '@/lib/sync'
import { processPracticeNotebookSync } from '@/lib/wordPractice'
export function useWordPracticeNotebookSync(owner: string) {
  const [pending, setPending] = useState(false)
  const retry = useCallback(async () => {
    try {
      await processPracticeNotebookSync(owner, async () => (await supabase.auth.getSession()).data.session?.user.id || null,
        (userId, item) => syncNotebookItem(userId, item, { throwOnError: true }),
        (userId, notebookId) => deleteNotebookItemSync(userId, notebookId, { throwOnError: true }))
      setPending(false)
    } catch { setPending(true) }
  }, [owner])
  useEffect(() => {
    const initial = window.setTimeout(() => { void retry() }, 0)
    const online = () => { void retry() }
    window.addEventListener('online', online)
    return () => { window.clearTimeout(initial); window.removeEventListener('online', online) }
  }, [retry])
  return { pending, retry }
}
