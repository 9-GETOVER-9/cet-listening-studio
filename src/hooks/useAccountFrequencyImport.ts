import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { frequencyDB } from '@/lib/ieltsFrequencyProgress'
import { applyFrequencyImport, decodeFrequencyImport, FREQUENCY_IMPORT_KEY, importCards, type FrequencyImport, type ImportedRow } from '@/lib/frequencyImport'
import type { IELTSCard } from '@/lib/ieltsDictation'

export interface AccountImportModel { seed: FrequencyImport; rows: ImportedRow[]; cards: IELTSCard[]; corpus: IELTSCard[] }
export function useAccountFrequencyImport(owner: string, enabled: boolean) {
  const [model, setModel] = useState<AccountImportModel | null>(null)
  const [loading, setLoading] = useState(enabled && owner !== 'guest')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loadedKey, setLoadedKey] = useState('')
  const requestKey = `${owner}:${attempt}`
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  useEffect(() => {
    let cancelled = false
    if (!enabled || owner === 'guest') return
    async function load() {
      setLoading(true); setError('')
      try {
        // getUser reads fresh account metadata, including imports made on another device.
        const { data, error: authError } = await supabase.auth.getUser()
        const cached = await frequencyDB.practiceState.get([owner, FREQUENCY_IMPORT_KEY])
        const session = authError ? (await supabase.auth.getSession()).data.session : null
        const user = data.user ?? session?.user
        if (user && user.id !== owner) throw new Error('登录账号已变化，请刷新页面。')
        if (!user && !cached) throw new Error('个人测试记录暂时无法读取，请检查网络或重新登录。')
        const seed = (user ? user.user_metadata[FREQUENCY_IMPORT_KEY] : cached?.value) as FrequencyImport | undefined
        if (!seed) { if (!cancelled) setModel(null); return }
        const response = await fetch('/data/ielts-high-frequency-v1.json', { cache: 'no-cache' })
        if (!response.ok) throw new Error('个人测试词库读取失败')
        const { cards: corpus } = await response.json() as { cards: IELTSCard[] }
        const rows = await decodeFrequencyImport(seed, corpus)
        const dictionary = await Promise.all(['/data/ielts-chinese-audio-v1.json', '/data/word-audio-supplement-v1.json'].map(async url => {
          const response = await fetch(url)
          if (!response.ok) throw new Error('个人错词音频索引读取失败，请重试。')
          return (await response.json()).cards as IELTSCard[]
        }))
        if (cancelled) return
        const cards = importCards(rows, corpus, dictionary.flat())
        if (cards.some((card, i) => !rows[i].passed && (!card.audio || !card.chineseAudio) && !dictionary.flat().some(c => c.id === card.id && c.chineseAudio))) throw new Error('部分个人错词缺少音频，请重新加载。')
        // Native frequency entries use their existing Chinese index by ID.
        const chinese = new Map(dictionary.flat().map(card => [card.id, card]))
        const enriched = cards.map(card => ({ ...card, chinese: chinese.get(card.id)?.chinese ?? card.chinese, chineseAudio: chinese.get(card.id)?.chineseAudio ?? card.chineseAudio }))
        await applyFrequencyImport(owner, seed, corpus)
        if (!cancelled) setModel({ seed, rows, cards: enriched, corpus })
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '个人测试记录读取失败，请重试。') }
      finally { if (!cancelled) { setLoading(false); setLoadedKey(`${owner}:${attempt}`) } }
    }
    void load()
    return () => { cancelled = true }
  }, [owner, enabled, attempt])
  return { model: enabled && owner !== 'guest' && loadedKey === requestKey ? model : null, loading: enabled && owner !== 'guest' && (loading || loadedKey !== requestKey), error: enabled && loadedKey === requestKey ? error : '', retry }
}
