import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseFrequencyAnnotationSeeds, readFrequencyAnnotations, type AnnotationSeed, type FrequencyAnnotation } from '@/lib/ieltsAnnotations'

const EMPTY_SEEDS = new Map<string, AnnotationSeed>()
const EMPTY_LOCAL = new Map<string, FrequencyAnnotation>()
export function useIELTSAnnotations(owner: string, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const [seedState, setSeedState] = useState<{ seeds: Map<string, AnnotationSeed>; error: string; loaded: boolean }>({ seeds: EMPTY_SEEDS, error: '', loaded: false })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/data/ielts-frequency-annotations-v1.json', { signal: controller.signal, cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error('笔记数据加载失败')
      const seeds = parseFrequencyAnnotationSeeds(await response.json())
      if (!controller.signal.aborted) setSeedState({ seeds, error: '', loaded: true })
    }).catch(() => {
      if (!controller.signal.aborted) setSeedState({ seeds: EMPTY_SEEDS, error: '高频笔记数据加载失败，请重新加载。', loaded: false })
    })
    return () => controller.abort()
  }, [enabled, attempt])
  const data = useLiveQuery(async () => {
    if (!enabled) return { owner, enabled, local: EMPTY_LOCAL, error: '' }
    try { return { owner, enabled, local: new Map((await readFrequencyAnnotations(owner)).map(annotation => [annotation.cardId, annotation])), error: '' } }
    catch { return { owner, enabled, local: EMPTY_LOCAL, error: '无法读取本机笔记，请检查浏览器存储权限后重试。' } }
  }, [owner, enabled, attempt])
  // Dexie's observable retains its previous value while a new owner loads.
  // Never expose that previous owner's edits during this transition.
  const ownedData = data?.owner === owner && data.enabled === enabled ? data : undefined
  return { seeds: seedState.seeds, local: ownedData?.local ?? EMPTY_LOCAL, loading: enabled && (!ownedData || (!seedState.loaded && !seedState.error)),
    error: enabled ? seedState.error || ownedData?.error || '' : '', retry: () => setAttempt(value => value + 1) }
}
