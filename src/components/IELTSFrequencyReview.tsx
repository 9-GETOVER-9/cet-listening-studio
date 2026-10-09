import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { IELTSWordWalkman } from '@/components/IELTSWordWalkman'
import { FREQUENCY_REASON_LABELS, selectFrequencyCards, type FrequencyProgress, type FrequencyReason } from '@/lib/ieltsFrequencyProgress'
import { resolveFrequencyAnnotation, saveFrequencyAnnotation, type AnnotationSeed, type FrequencyAnnotation } from '@/lib/ieltsAnnotations'
import { IELTSWordNotes } from '@/components/IELTSWordNotes'
import type { IELTSCard } from '@/lib/ieltsDictation'

type ReasonFilter = 'all' | keyof typeof FREQUENCY_REASON_LABELS
const EMPTY_SEEDS = new Map<string, AnnotationSeed>()
const EMPTY_LOCAL = new Map<string, FrequencyAnnotation>()
interface Props {
  owner: string
  cards: IELTSCard[]
  progress: FrequencyProgress[]
  chineseById: Map<string, IELTSCard>
  rate: number
  indexError: string
  onReload: () => void
  onStart: (cards: IELTSCard[]) => void
  seeds?: Map<string, AnnotationSeed>
  local?: Map<string, FrequencyAnnotation>
}
export function IELTSFrequencyReview({ owner, cards, progress, chineseById, rate, indexError, onReload, onStart, seeds = EMPTY_SEEDS, local = EMPTY_LOCAL }: Props) {
  const [filter, setFilter] = useState<ReasonFilter>('all')
  const [walkman, setWalkman] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const mountedRef = useRef(true)
  const failedRef = useRef<{ cardId: string; value: string } | null>(null)
  const [error, setError] = useState('')
  const [noteId, setNoteId] = useState('')
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  const reason: FrequencyReason | 'all' = filter === 'unlabelled' ? null : filter
  const pending = selectFrequencyCards(cards, progress, 'mistakes')
  const resolvedProgress = progress.map(record => ({ ...record, reason: resolveFrequencyAnnotation(record.cardId, seeds, local, record.reason).reason }))
  const selectedIds = JSON.stringify(selectFrequencyCards(cards, resolvedProgress, 'mistakes', reason).map(card => card.id))
  // Only membership/audio changes replace the player queue. Label-only updates under
  // the all filter keep the same array so the currently playing word can continue.
  const queue = useMemo(() => {
    const ids = new Set<string>(JSON.parse(selectedIds))
    return cards.filter(card => ids.has(card.id)).map(card => {
      const translated = chineseById.get(card.id)
      return { ...card, chinese: translated?.chinese ?? card.chinese,
        chineseAudio: translated?.chineseAudio ?? card.chineseAudio, sourceBook: 'frequency' as const }
    })
  }, [cards, selectedIds, chineseById])
  const byId = new Map(resolvedProgress.map(record => [record.cardId, record]))
  const noteCard = queue.find(card => card.id === noteId)
  async function updateReason(cardId: string, value: string) {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true); setError('')
    try { await saveFrequencyAnnotation(owner, cardId, { reason: value === 'unlabelled' ? null : value as FrequencyReason }); failedRef.current = null }
    catch { if (mountedRef.current) { failedRef.current = { cardId, value }; setError('原因保存失败，原标签仍然保留。') } }
    finally { savingRef.current = false; if (mountedRef.current) setSaving(false) }
  }
  return <section className="mt-6 border-t border-[var(--app-line)] pt-6" aria-label="高频错词复习">
    <h3 className="text-lg font-semibold">错词复习 · {pending.length} 词待复习</h3>
    {!pending.length ? <p role="status" className="mt-4 text-sm text-[var(--app-muted)]">当前内容没有待复习错词。测验答错的词会自动收集到这里；已复测通过的词已移出。</p> : <>
      <label className="mt-4 block text-sm">按错题原因筛选
        <select aria-label="错词原因筛选" className="mt-2 block w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-3" value={filter}
          onChange={event => { setWalkman(false); setFilter(event.target.value as ReasonFilter) }}>
          <option value="all">全部原因</option>
          {Object.entries(FREQUENCY_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p className="mt-3 text-sm text-[var(--app-muted)]">“发音”表示听辨困难；原因标签不改变系统判定或准确率。</p>
      <div className="my-5 flex flex-wrap gap-3">
        <Button disabled={!queue.length || saving} onClick={() => { setWalkman(false); onStart(queue) }}>错词听写 · {queue.length} 题</Button>
        <Button variant="outline" disabled={!queue.length || !!indexError || !chineseById.size} onClick={() => setWalkman(value => !value)}>{walkman ? '收起错词随身听' : '错词随身听'}</Button>
      </div>
      {indexError ? <p role="alert" className="mb-4 text-sm text-red-600">{indexError}<Button variant="ghost" onClick={onReload}>重新加载中文配音</Button></p>
        : !chineseById.size && <p role="status" className="mb-4 text-sm">正在加载中文配音索引…</p>}
      {error && <div role="alert" className="mb-4 text-sm text-red-600">{error}<Button variant="outline" className="ml-3" disabled={saving} onClick={() => { if (failedRef.current) void updateReason(failedRef.current.cardId, failedRef.current.value) }}>重试保存原因</Button></div>}
      {!queue.length && <p role="status" className="mt-3 text-sm">这个原因下没有待复习错词。</p>}
      {walkman && !!queue.length && <IELTSWordWalkman key={filter} cards={queue} rate={rate} owner={owner} />}
      <div className="mt-5 max-h-96 space-y-3 overflow-y-auto">
        {queue.map(card => <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-line)] pb-3">
          <div className="min-w-0 flex-1"><p className="break-words font-medium">{card.word}</p><p className="break-words text-sm text-[var(--app-muted)]">{card.chinese}</p></div>
          <select aria-label={`${card.word} 的错题原因`} className="max-w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-2 text-sm" disabled={saving}
            value={byId.get(card.id)?.reason ?? 'unlabelled'} onChange={event => { void updateReason(card.id, event.target.value) }}>
            {Object.entries(FREQUENCY_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => setNoteId(value => value === card.id ? '' : card.id)}>{noteId === card.id ? '收起笔记' : '编辑笔记'}</Button>
        </div>)}
      </div>
      {noteCard && <IELTSWordNotes key={`${owner}:${noteCard.id}`} owner={owner} card={noteCard} disabled={saving}
        annotation={resolveFrequencyAnnotation(noteCard.id, seeds, local, byId.get(noteCard.id)?.reason)} />}
    </>}
  </section>
}
