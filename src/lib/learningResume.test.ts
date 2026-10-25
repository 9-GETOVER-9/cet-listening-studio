import { describe, expect, it } from 'vitest'
import { parseLearningResume } from './learningResume'

describe('Learning resume read boundary', () => {
  it('preserves a saved exercise and its exact position', () => {
    for (const path of ['/card/cet4?targetCardId=abc', '/nce/shadowing/book1?index=5', '/word-practice?source=frequency', '/ielts/listening', '/ielts/reading-538']) expect(parseLearningResume({ path, label: '第 5 句' })).toEqual({ path, label: '第 5 句' })
    expect(parseLearningResume({ path: '/card/test' })?.label).toBe('继续上次学习')
  })
  it('rejects malformed or external account-synced values', () => {
    for (const value of [null, {}, 'bad', { path: 1 }, ...['https://example.com', '//example.com', '/profile', '/card', '/card//evil', '/ielts/listening/unknown', '/card/a\\evil', '/card/a\n'].map(path => ({ path }))]) expect(parseLearningResume(value)).toBeNull()
  })
})
