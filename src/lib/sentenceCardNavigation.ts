export function sentenceArticleListParams(): URLSearchParams {
  return new URLSearchParams({ view: 'articles' })
}

export function shouldRestoreSentenceArticle(params: URLSearchParams, saved: Record<string, unknown> | null): boolean {
  return !params.has('article') && params.get('view') !== 'articles' && typeof saved?.articleId === 'string'
}
