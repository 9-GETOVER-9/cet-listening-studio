import { useMemo, useState } from 'react'
import { IELTSWordNotes } from '@/components/IELTSWordNotes'
import { resolveFrequencyAnnotation, type AnnotationSeed, type FrequencyAnnotation } from '@/lib/ieltsAnnotations'
import type { IELTSCard } from '@/lib/ieltsDictation'
import type { FrequencyProgress } from '@/lib/ieltsFrequencyProgress'

interface Props { owner: string; cards: IELTSCard[]; seeds: Map<string, AnnotationSeed>; local: Map<string, FrequencyAnnotation>; progress: FrequencyProgress[] }
export function IELTSNotesLibrary({ owner, cards, seeds, local, progress }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? '')
  const matched = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return cards.filter(card => !search || `${card.word} ${card.chinese ?? ''}`.toLocaleLowerCase().includes(search))
  }, [cards, query])
  const selected = matched.find(card => card.id === selectedId) ?? matched[0]
  const progressById = new Map(progress.map(record => [record.cardId, record]))
  return <section className="mt-6 space-y-5 border-t border-[var(--app-line)] pt-6" aria-label="高频词笔记库">
    <h3 className="text-lg font-semibold">词条笔记 · 当前内容 {cards.length} 词</h3>
    <label className="block text-sm">搜索单词或释义
      <input type="search" aria-label="搜索单词或释义" value={query} onChange={event => setQuery(event.target.value)}
        className="mt-2 block w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-3" />
    </label>
    {!matched.length ? <p role="status">当前内容没有匹配的词条。</p> : <>
      <label className="block text-sm">选择词条 · {matched.length} 词
        <select aria-label="选择笔记词条" value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)}
          className="mt-2 block w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-3">
          {matched.map(card => <option key={card.id} value={card.id}>{card.word}{card.chinese ? ` · ${card.chinese}` : ''}</option>)}
        </select>
      </label>
      {selected && <div className="space-y-4">
        <div><p className="break-words text-xl font-semibold">{selected.word}</p><p className="break-words text-[var(--app-muted)]">{selected.chinese}</p></div>
        <IELTSWordNotes key={`${owner}:${selected.id}`} owner={owner} card={selected}
          annotation={resolveFrequencyAnnotation(selected.id, seeds, local, progressById.get(selected.id)?.reason)} />
      </div>}
    </>}
  </section>
}
