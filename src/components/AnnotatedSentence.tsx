import type { MouseEvent } from 'react'
import { useMemo } from 'react'
import { annotateSentence, type SentenceAnnotationKind } from '@/lib/sentenceAnnotations'
import { useSettingsStore } from '@/store/settingsStore'
import type { AIAnalysis } from '@/types'

const labels: Record<SentenceAnnotationKind, string> = { linking: '连读', weak: '弱读', phrases: '短语' }
const colors: Record<SentenceAnnotationKind, string> = {
  linking: 'border-blue-300 bg-blue-100 text-blue-950',
  weak: 'border-purple-300 bg-purple-100 text-purple-950',
  phrases: 'border-emerald-300 bg-emerald-50 text-emerald-950',
}
interface Props { text: string; analysis: AIAnalysis; unlocked: boolean; onWordClick?: (word: string, event: MouseEvent<HTMLButtonElement>) => void }

export function AnnotatedSentence({ text, analysis, unlocked, onWordClick }: Props) {
  const options = useSettingsStore(s => s.sentenceAnnotations)
  const segments = useMemo(() => annotateSentence(text, analysis, options, unlocked), [text, analysis, options, unlocked])
  const visible = [...new Set(segments.flatMap(s => s.annotations.map(a => a.kind)))]
  const renderWords = (value: string, hint?: string) => !onWordClick ? value : value.split(/(\s+)/).map((word, index) => {
    if (!/[a-z0-9]/i.test(word)) return word
    const clean = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    return <button key={index} type="button" data-interactive aria-label={`收藏单词 ${clean}`} title={hint ? `${hint}\n点击收藏这个单词` : '点击收藏这个单词'}
      className="inline cursor-pointer rounded px-0.5 text-left font-[inherit] hover:bg-blue-200 focus-visible:outline-2"
      style={{ textDecoration: 'inherit', textUnderlineOffset: 'inherit', textDecorationColor: 'inherit', textDecorationThickness: 'inherit' }}
      onClick={event => { event.stopPropagation(); event.preventDefault(); onWordClick(clean, event) }}>{word}</button>
  })
  return <div>
    <p className="whitespace-pre-wrap text-lg font-medium leading-loose text-gray-900">
      {segments.map((segment, index) => {
        if (!segment.annotations.length) return <span key={index}>{renderWords(segment.text)}</span>
        const kinds = [...new Set(segment.annotations.map(a => a.kind))]
        const main = kinds.includes('linking') ? 'linking' : kinds.includes('weak') ? 'weak' : 'phrases'
        const overlap = kinds.includes('phrases') && main !== 'phrases'
        const hint = segment.annotations.map(a => `${labels[a.kind]}：${a.source}${a.meaning ? ` — ${a.meaning}` : ''}`).join('\n')
        return <span key={index} data-annotation={kinds.join(' ')} title={hint}
          className={`box-decoration-clone rounded border px-0.5 py-0.5 ${colors[main]} ${overlap ? 'underline decoration-emerald-600 decoration-2 underline-offset-4' : ''}`}
          style={kinds.includes('linking') && kinds.includes('weak') ? { background: 'linear-gradient(135deg, #dbeafe 50%, #f3e8ff 50%)' } : undefined}>
          {renderWords(segment.text, hint)}
        </span>
      })}
    </p>
    {visible.length > 0 && <div aria-label="原句标注图例" className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {visible.map(kind => <span key={kind} className={`rounded border px-2 py-0.5 ${colors[kind]}`}>{labels[kind]}</span>)}
      {visible.includes('phrases') && (visible.includes('linking') || visible.includes('weak')) && <span className="text-gray-500">绿色下划线表示重叠短语</span>}
    </div>}
  </div>
}
