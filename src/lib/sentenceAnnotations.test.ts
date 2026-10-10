import { describe, expect, it } from 'vitest'
import { annotateSentence, type SentenceAnnotationSettings } from './sentenceAnnotations'
import type { AIAnalysis } from '@/types'

const options: SentenceAnnotationSettings = { enabled: true, linking: true, weak: true, phrases: true }
const analysis: AIAnalysis = {
  phrases: [{ phrase: 'current account', meaning: '活期账户' }, { phrase: 'lend money', meaning: '借钱' }],
  pronunciation: [{ type: '连读', example: 'at_a bank' }, { type: '弱读', example: 'of which (əv wɪtʃ)' }], grammar: [],
}
const marked = (text: string, a = analysis, o = options) => annotateSentence(text, a, o).filter(p => p.annotations.length)

describe('sentence annotation matching', () => {
  it('locates the linking, weak form and proper-name phrase from the reported screenshot', () => {
    const text = 'Technology trends may push Silicon Valley back to the future.'
    const a: AIAnalysis = { grammar: [], phrases: [{ phrase: 'push back to', meaning: '使重返' }, { phrase: 'Silicon Valley', meaning: '硅谷' }], pronunciation: [{ type: '连读', example: 'push_Silicon' }, { type: '弱读', example: 'may /meɪ/ → /mə/' }, { type: '失爆', example: 'back to /bæk tə/ 中/k/不完全爆破' }] }
    const parts = annotateSentence(text, a, options)
    const layer = (kind: string) => parts.filter(p => p.annotations.some(v => v.kind === kind)).map(p => p.text).join('')
    expect(layer('linking')).toBe('push Silicon')
    expect(layer('weak')).toBe('may')
    expect(layer('phrases')).toBe('Silicon Valley')
    expect(parts.map(p => p.text).join('')).toBe(text)
    expect(annotateSentence(text, a, { ...options, enabled: false }).every(p => !p.annotations.length)).toBe(true)
  })
  it('preserves original text while locating underscores and stripping phonetic suffixes', () => {
    const text = 'A current account at a bank, repayment of which is due.'
    const parts = annotateSentence(text, analysis, options)
    expect(parts.map(p => p.text).join('')).toBe(text)
    expect(marked(text).map(p => p.text)).toEqual(['current account', 'at a bank', 'of which'])
    expect(marked(text).map(p => p.annotations[0].kind)).toEqual(['phrases', 'linking', 'weak'])
  })
  it('matches arrow left sides and ignores IPA and explanatory parentheses', () => {
    const a: AIAnalysis = { phrases: [], grammar: [], pronunciation: [
      { type: '弱读', example: 'to -> /tə/ (介词 to 通常弱读)' },
      { type: '连读', example: 'Did you → /dɪdʒuː/ (连读)' },
    ] }
    expect(marked('Did you go to school?', a).map(p => p.text)).toEqual(['Did you', 'to'])
  })
  it('uses whole token boundaries, handles contractions and preserves typography', () => {
    const a: AIAnalysis = { phrases: [], grammar: [], pronunciation: [{ type: '弱读', example: "you're (弱读为/jər/)" }, { type: '弱读', example: 'to /tə/' }] }
    const text = 'Today you’re going to town, too.'
    expect(marked(text, a).map(p => p.text)).toEqual(['you’re', 'to'])
    expect(annotateSentence(text, a, options).map(p => p.text).join('')).toBe(text)
  })
  it('does not join words across punctuation or fuzzy-match discontinuous or inflected phrases', () => {
    expect(marked('current, account; lending the bank money. at. a bank')).toEqual([])
  })
  it('marks repeated matches without changing tabs, line breaks or letter case', () => {
    const text = 'At\ta bank\nand AT a bank'
    expect(marked(text).map(p => p.text)).toEqual(['At\ta bank', 'AT a bank'])
    expect(annotateSentence(text, analysis, options).map(p => p.text).join('')).toBe(text)
  })
  it('retains both phrase and pronunciation layers on overlapping segments', () => {
    const a: AIAnalysis = { grammar: [], phrases: [{ phrase: 'at a bank', meaning: '在银行' }], pronunciation: [{ type: '连读', example: 'at_a' }, { type: '弱读', example: 'a /ə/' }] }
    const parts = annotateSentence('at a bank', a, options)
    expect(parts.find(p => p.text === 'a')?.annotations.map(a => a.kind).sort()).toEqual(['linking', 'phrases', 'weak'])
    expect(parts.map(p => p.text).join('')).toBe('at a bank')
  })
  it('respects independent toggles and the master switch and locked analysis', () => {
    const text = 'current account at a bank of which'
    expect(marked(text, analysis, { ...options, linking: false, weak: false }).map(p => p.text)).toEqual(['current account'])
    expect(marked(text, analysis, { ...options, enabled: false })).toEqual([])
    expect(annotateSentence(text, analysis, options, false)).toEqual([{ text, annotations: [] }])
  })
  it('deduplicates identical source annotations and leaves unsupported types unmarked', () => {
    const a: AIAnalysis = { grammar: [], phrases: [], pronunciation: [{ type: '连读', example: 'at_a' }, { type: '连读', example: 'at_a' }, { type: '失爆', example: 'bank' }] }
    expect(marked('at a bank', a)[0].annotations).toHaveLength(1)
    expect(marked('bank', a)).toEqual([])
  })
})
