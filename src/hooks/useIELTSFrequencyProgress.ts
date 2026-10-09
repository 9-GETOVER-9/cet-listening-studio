import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { readFrequencyProgress, type FrequencyProgress } from '@/lib/ieltsFrequencyProgress'

const EMPTY_PROGRESS: FrequencyProgress[] = []
export function useIELTSFrequencyProgress(owner: string) {
  const [attempt, setAttempt] = useState(0)
  const data = useLiveQuery(async () => {
    try { return { progress: await readFrequencyProgress(owner), error: '' } }
    catch { return { progress: EMPTY_PROGRESS, error: '无法读取高频测试进度，请检查浏览器存储权限后重试。' } }
  }, [owner, attempt])
  return { progress: data?.progress ?? EMPTY_PROGRESS, loading: !data, error: data?.error ?? '', retry: () => setAttempt(value => value + 1) }
}
