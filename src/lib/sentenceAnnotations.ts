import type { AIAnalysis } from '@/types'

export interface SentenceAnnotationSettings {
  enabled: boolean
  linking: boolean
  weak: boolean
  phrases: boolean
}
export type SentenceAnnotationKind = 'linking' | 'weak' | 'phrases'
export interface SentenceAnnotation { kind: SentenceAnnotationKind; source: string; meaning?: string }
export interface SentenceSegment { text: string; annotations: SentenceAnnotation[] }
export interface SentenceAnnotationRange {
  start: number; end: number; annotation: SentenceAnnotation
  joins: { start: number; end: number; pairStart: number; pairEnd: number; words: string }[]
}
export const DEFAULT_SENTENCE_ANNOTATIONS: SentenceAnnotationSettings = { enabled: true, linking: true, weak: true, phrases: true }

export function normalizeSentenceAnnotationSettings(value: unknown): SentenceAnnotationSettings {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(DEFAULT_SENTENCE_ANNOTATIONS).map(([key, fallback]) => [key, typeof saved[key] === 'boolean' ? saved[key] : fallback])) as unknown as SentenceAnnotationSettings
}

function tokens(text: string) {
  return [...text.matchAll(/[a-z0-9]+(?:['’][a-z0-9]+)*(?:-[a-z0-9]+)*/gi)].map(m => ({
    word: m[0].toLowerCase().replaceAll('’', "'"), start: m.index, end: m.index + m[0].length,
  }))
}

/** Exact contiguous token matching; never infer a missing or inflected expression. */
export function findSentenceAnnotations(text: string, analysis: AIAnalysis, options: SentenceAnnotationSettings, unlocked = true): SentenceAnnotationRange[] {
  if (!unlocked || !options.enabled) return []
  const candidates: SentenceAnnotation[] = []
  for (const item of analysis.pronunciation) {
    const kind = item.type === '连读' ? 'linking' : item.type === '弱读' ? 'weak' : null
    if (kind && options[kind]) candidates.push({ kind, source: item.example })
  }
  if (options.phrases) for (const item of analysis.phrases) candidates.push({ kind: 'phrases', source: item.phrase, meaning: item.meaning })
  const words = tokens(text)
  const matches: SentenceAnnotationRange[] = []
  const seen = new Set<string>()
  for (const annotation of candidates) {
    const key = JSON.stringify(annotation)
    if (seen.has(key)) continue
    seen.add(key)
    const example = (annotation.kind === 'phrases' ? annotation.source : annotation.source.split(/->|→|=>|⇒|[([{（【/]/)[0])
      .trim().replace(/^["“]|["”.,!?;:]+$/g, '')
    const target = example.replace(/[_‿]/g, ' ')
    const targetWords = tokens(target)
    // Reject templates, phonetic remnants and non-contiguous examples.
    if (!targetWords.length || targetWords.map(w => w.word).join(' ') !== target.toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ')) continue
    for (let index = 0; index <= words.length - targetWords.length; index++) {
      const window = words.slice(index, index + targetWords.length)
      if (!window.every((w, i) => w.word === targetWords[i].word && (i === 0 || /^\s+$/.test(text.slice(window[i - 1].end, w.start))))) continue
      const exampleWords = tokens(example)
      const explicitJoins = /[_‿]/.test(example)
      const joins = annotation.kind !== 'linking' ? [] : window.slice(1).flatMap((word, i) => {
        if (explicitJoins && !/[_‿]/.test(example.slice(exampleWords[i].end, exampleWords[i + 1].start))) return []
        return [{ start: window[i].end, end: word.start, pairStart: window[i].start, pairEnd: word.end, words: `${text.slice(window[i].start, window[i].end)} ${text.slice(word.start, word.end)}` }]
      })
      matches.push({ start: window[0].start, end: window[window.length - 1].end, annotation, joins })
    }
  }
  return matches
}

export function annotateSentence(text: string, analysis: AIAnalysis, options: SentenceAnnotationSettings, unlocked = true): SentenceSegment[] {
  const matches = findSentenceAnnotations(text, analysis, options, unlocked)
  if (!matches.length) return [{ text, annotations: [] }]
  const boundaries = [...new Set([0, text.length, ...matches.flatMap(m => [m.start, m.end])])].sort((a, b) => a - b)
  return boundaries.slice(0, -1).map((start, i) => ({
    text: text.slice(start, boundaries[i + 1]),
    annotations: matches.filter(m => m.start <= start && m.end >= boundaries[i + 1]).map(m => m.annotation),
  }))
}
