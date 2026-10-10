import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { SentenceAnnotationSettings } from './SentenceAnnotationSettings'
const fixture = vi.hoisted(() => ({ sentenceAnnotations: { enabled: true, linking: true, weak: true, phrases: true }, setSentenceAnnotationSetting: () => {} }))
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: (selector: (value: typeof fixture) => unknown) => selector(fixture) }))
afterEach(() => { fixture.sentenceAnnotations = { enabled: true, linking: true, weak: true, phrases: true } })
it('clearly reports the current enabled state instead of an ambiguous action word', () => {
  const html = renderToStaticMarkup(<SentenceAnnotationSettings />)
  expect(html).toContain('已开启')
  expect(html).toContain('点击关闭原句标注')
  expect(html).toContain('aria-checked="true"')
})
it('explains that a disabled master switch pauses the saved individual choices', () => {
  fixture.sentenceAnnotations.enabled = false
  const html = renderToStaticMarkup(<SentenceAnnotationSettings />)
  expect(html).toContain('总开关已关闭')
  expect(html).toContain('暂不显示')
  expect(html).toContain('已关闭')
  expect(html).toContain('disabled=""')
  expect(fixture.sentenceAnnotations.linking).toBe(true)
})
