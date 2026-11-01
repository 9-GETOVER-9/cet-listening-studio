export function resolveIELTSEntry(params: URLSearchParams) {
  const book = params.get('source') === 'frequency' ? 'frequency' : 'wanglu'
  const mode = params.get('mode') === 'walkman' ? 'walkman' : 'dictation'
  return { book, mode, resume: mode === 'dictation' } as const
}
