import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { AnnotatedSentence } from './AnnotatedSentence'
import type { AIAnalysis } from '@/types'
const analysis: AIAnalysis = { phrases: [{ phrase: 'at a bank', meaning: '在银行' }], grammar: [], pronunciation: [{ type: '连读', example: 'at_a bank' }, { type: '弱读', example: 'a /ə/' }] }
it('renders overlapping annotations with source descriptions and a text legend', () => {
  const html = renderToStaticMarkup(<AnnotatedSentence text="at a bank" analysis={analysis} unlocked />)
  expect(html).toContain('data-annotation="linking weak phrases"')
  expect(html).toContain('连读：at_a bank')
  expect(html).toContain('弱读：a /ə/')
  expect(html).toContain('短语：at a bank — 在银行')
  expect(html).toContain('原句标注图例')
})
it('does not reveal locked analysis and escapes text instead of injecting HTML', () => {
  const html = renderToStaticMarkup(<AnnotatedSentence text="at a bank <script>alert(1)</script>" analysis={analysis} unlocked={false} />)
  expect(html).not.toContain('data-annotation')
  expect(html).not.toContain('原句标注图例')
  expect(html).toContain('&lt;script&gt;')
})
it('retains accessible word controls for vocabulary bookmarking', () => {
  const html = renderToStaticMarkup(<AnnotatedSentence text="at a bank." analysis={analysis} unlocked onWordClick={() => {}} />)
  expect(html).toContain('收藏单词 bank')
  expect(html).toContain('data-interactive')
})
it('retains annotation descriptions and overlap decoration on individual word buttons', () => {
  const html = renderToStaticMarkup(<AnnotatedSentence text="at a bank" analysis={analysis} unlocked onWordClick={() => {}} />)
  expect(html).toMatch(/title="[^"]*连读：at_a bank[^"]*点击收藏这个单词"/)
  expect(html).toContain('text-decoration:inherit')
})
