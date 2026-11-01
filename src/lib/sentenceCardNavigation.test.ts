import { describe, expect, it } from 'vitest'
import { shouldRestoreSentenceArticle, sentenceArticleListParams } from './sentenceCardNavigation'

describe('雅思逐句卡片返回文章', () => {
  it('keeps the article list open after an explicit return even when a saved session exists', () => {
    const params = sentenceArticleListParams()
    expect(shouldRestoreSentenceArticle(params, { articleId: 'part1-article1', mode: 'new' })).toBe(false)
  })
  it('still restores a saved session on a fresh entry without an article', () => {
    expect(shouldRestoreSentenceArticle(new URLSearchParams(), { articleId: 'part1-article1' })).toBe(true)
    expect(shouldRestoreSentenceArticle(new URLSearchParams('article=other'), { articleId: 'part1-article1' })).toBe(false)
    expect(shouldRestoreSentenceArticle(new URLSearchParams(), null)).toBe(false)
  })
})
