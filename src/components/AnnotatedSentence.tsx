import type { MouseEvent } from 'react'
import { useMemo } from 'react'
import { findSentenceAnnotations, type SentenceAnnotationKind } from '@/lib/sentenceAnnotations'
import '@/styles/sentenceAnnotations.css'
import { useSettingsStore } from '@/store/settingsStore'
import type { AIAnalysis } from '@/types'

const labels: Record<SentenceAnnotationKind, string> = { linking: '连读', weak: '弱读', phrases: '短语' }
const colors: Record<SentenceAnnotationKind, string> = {
  linking: 'border-blue-300 bg-blue-50 text-blue-800',
  weak: 'border-purple-300 bg-purple-100 text-purple-950',
  phrases: 'border-amber-500 bg-amber-50 text-amber-900',
}
interface Props { text: string; analysis: AIAnalysis; unlocked: boolean; onWordClick?: (word: string, event: MouseEvent<HTMLButtonElement>) => void }

export function AnnotatedSentence({ text, analysis, unlocked, onWordClick }: Props) {
  const options = useSettingsStore(s => s.sentenceAnnotations)
  const segments = useMemo(() => {
    const ranges = findSentenceAnnotations(text, analysis, options, unlocked)
    const joins = ranges.flatMap(r => r.joins)
    const pairs: { start: number; end: number }[] = []
    for (const join of joins.filter(j => !/[\r\n]/.test(text.slice(j.start, j.end))).sort((a, b) => a.pairStart - b.pairStart)) {
      const previous = pairs.at(-1)
      if (previous && join.pairStart < previous.end) {
        if (join.pairEnd > previous.end) pairs.push({ start: join.start, end: join.pairEnd })
      } else pairs.push({ start: join.pairStart, end: join.pairEnd })
    }
    const groups: { start: number; end: number }[] = []
    for (const range of ranges.filter(r => r.annotation.kind !== 'weak' && !/[\r\n]/.test(text.slice(r.start, r.end))).sort((a, b) => a.start - b.start)) {
      const previous = groups.at(-1)
      if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end)
      else groups.push({ start: range.start, end: range.end })
    }
    const boundaries = [...new Set([0, text.length, ...ranges.flatMap(r => [r.start, r.end]), ...joins.flatMap(j => [j.start, j.end]), ...pairs.flatMap(p => [p.start, p.end])])].sort((a, b) => a - b)
    return boundaries.slice(0, -1).map((start, i) => {
      const end = boundaries[i + 1]
      const active = ranges.filter(r => r.start <= start && r.end >= end)
      const phrases = active.filter(r => r.annotation.kind === 'phrases')
      return { text: text.slice(start, end), annotations: active.map(r => r.annotation),
        join: joins.find(j => j.start === start && j.end === end),
        group: groups.find(g => g.start === start), end,
        pair: pairs.find(p => p.start === start),
        phraseStart: phrases.some(r => r.start === start), phraseEnd: phrases.some(r => r.end === end) }
    })
  }, [text, analysis, options, unlocked])
  const visible = [...new Set(segments.flatMap(s => s.annotations.map(a => a.kind)))]
  const renderWords = (value: string, hint?: string) => !onWordClick ? value : value.split(/(\s+)/).map((word, index) => {
    if (!/[a-z0-9]/i.test(word)) return word
    const clean = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    return <button key={index} type="button" data-interactive aria-label={`收藏单词 ${clean}`} title={hint ? `${hint}\n点击收藏这个单词` : '点击收藏这个单词'}
      className="inline cursor-pointer rounded p-0 text-left font-[inherit] hover:bg-blue-200 focus-visible:outline-2"
      style={{ textDecoration: 'inherit', textUnderlineOffset: 'inherit', textDecorationColor: 'inherit', textDecorationThickness: 'inherit' }}
      onClick={event => { event.stopPropagation(); event.preventDefault(); onWordClick(clean, event) }}>{word}</button>
  })
  const renderSegment = (segment: typeof segments[number], index: number) => {
        if (!segment.annotations.length) return <span key={index}>{renderWords(segment.text)}</span>
        const kinds = [...new Set(segment.annotations.map(a => a.kind))]
        const hint = segment.annotations.map(a => `${labels[a.kind]}：${a.source}${a.meaning ? ` — ${a.meaning}` : ''}`).join('\n')
        return <span key={index} data-annotation={kinds.join(' ')} title={hint}
          data-phrase-edge={segment.phraseStart && segment.phraseEnd ? 'both' : segment.phraseStart ? 'start' : segment.phraseEnd ? 'end' : undefined}
          className={`sentence-layer ${kinds.includes('linking') ? 'sentence-linking' : ''} ${kinds.includes('weak') ? 'sentence-weak' : ''} ${kinds.includes('phrases') ? 'sentence-phrase' : ''}`}>
          {segment.join && !/[\r\n]/.test(segment.text) ? <span className="sentence-link-join" data-link-boundary={segment.join.words}>{segment.text}<svg aria-hidden="true" focusable="false" viewBox="0 0 18 12" preserveAspectRatio="none"><path d="M1 2 Q9 15 17 2" /></svg></span> : renderWords(segment.text, hint)}
        </span>
  }
  const chunks: { text?: string; segments: typeof segments }[] = []
  for (let i = 0; i < segments.length;) {
    const first = segments[i]
    const end = Math.max(first.group?.end ?? first.end, first.pair?.end ?? first.end)
    const startIndex = i
    do { i++ } while (i < segments.length && segments[i - 1].end < end)
    chunks.push({ text: first.group ? text.slice(first.group.start, end) : undefined, segments: segments.slice(startIndex, i) })
  }
  const renderChunk = (values: typeof segments) => {
    const parts = []
    for (let i = 0; i < values.length;) {
      const first = values[i]
      const startIndex = i
      const end = first.pair?.end ?? first.end
      do { i++ } while (i < values.length && values[i - 1].end < end)
      const local = values.slice(startIndex, i)
      const joinIndex = local.findIndex(s => s.join)
      parts.push(<span key={startIndex} className={first.pair ? 'sentence-link-pair' : undefined} data-link-group={first.pair ? text.slice(first.pair.start, end) : undefined}>
        {first.pair && joinIndex >= 0 ? <>{local.slice(0, joinIndex).map(renderSegment)}<span className="sentence-link-follow" data-link-follow={local[joinIndex].join?.words}>{local.slice(joinIndex).map(renderSegment)}</span></> : local.map(renderSegment)}
      </span>)
    }
    return parts
  }
  return <div className="sentence-annotated">
    <p className="whitespace-pre-wrap text-lg font-medium leading-loose text-gray-900">
      {chunks.map((chunk, index) => <span key={index} className={chunk.text ? 'sentence-reading-group' : undefined} data-reading-group={chunk.text}>{renderChunk(chunk.segments)}</span>)}
    </p>
    {visible.length > 0 && <div aria-label="原句标注图例" className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {visible.map(kind => <span key={kind} className={`rounded border px-2 py-0.5 ${colors[kind]}`}>{kind === 'linking' ? '连读：词‿词' : kind === 'phrases' ? '短语：底部括线' : '弱读：紫色底'}</span>)}
    </div>}
  </div>
}
