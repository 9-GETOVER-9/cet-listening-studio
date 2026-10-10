import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { defaultPracticeSettings } from '@/lib/wordPractice'
const modules = import.meta.glob('./WordPracticeControls.tsx')
it('labels genuine device voice choices and unavailable accents without fake IPA', async () => {
  expect(modules['./WordPracticeControls.tsx'], 'accessible practice controls must exist').toBeDefined()
  const { WordPracticeControls } = await modules['./WordPracticeControls.tsx']() as typeof import('./WordPracticeControls')
  const markup = renderToStaticMarkup(createElement(WordPracticeControls, { settings: defaultPracticeSettings, onChange: () => {}, source: 'notebook', voices: [], mode: 'dictation', onMode: () => {} }))
  expect(markup).toContain('设备合成发音')
  expect(markup).toContain('英式声音不可用')
  expect(markup).toContain('美式声音不可用')
  expect(markup).toContain('自动继续')
  expect(markup).toContain('重复次数')
})
