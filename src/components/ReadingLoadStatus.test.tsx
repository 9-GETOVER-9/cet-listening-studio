import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ReadingLoadStatus } from './ReadingLoadStatus'
it('does not show an endless loading message once the load has failed', () => {
  expect(renderToStaticMarkup(<ReadingLoadStatus corpusReady={false} recordsReady error="无法连接" />)).toBe('')
})
it('distinguishes the pending local records from the pending vocabulary', () => {
  expect(renderToStaticMarkup(<ReadingLoadStatus corpusReady recordsReady={false} error="" />)).toContain('正在读取本机学习记录')
  expect(renderToStaticMarkup(<ReadingLoadStatus corpusReady={false} recordsReady error="" />)).toContain('正在读取阅读词库')
  expect(renderToStaticMarkup(<ReadingLoadStatus corpusReady recordsReady error="" />)).toBe('')
})
