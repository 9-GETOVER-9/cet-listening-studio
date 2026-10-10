import { parseReadingCorpus, type ReadingCorpus } from './ieltsReading'

class ReadingRequestError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) { super(message); this.retryable = retryable }
}

const cancelled = () => new DOMException('Aborted', 'AbortError')

async function requestCorpus(fetcher: typeof fetch, signal?: AbortSignal): Promise<ReadingCorpus> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => { controller.abort(); reject(cancelled()) }
    signal?.addEventListener('abort', onAbort, { once: true })
    timeout = setTimeout(() => {
      controller.abort()
      reject(new ReadingRequestError('阅读词库连接超时，请检查网络后重试。', true))
    }, 8000)
  })
  try {
    const download = (async () => {
      const response = await fetcher('/data/ielts-reading-538-v1.json', { signal: controller.signal })
      if (!response.ok) throw new ReadingRequestError(`阅读词库加载失败（${response.status}），请重试。`, response.status >= 500)
      return parseReadingCorpus(await response.json())
    })()
    return await Promise.race([download, interrupted])
  } finally {
    clearTimeout(timeout)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  }
}

function waitToRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(cancelled()) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, 250)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

export function createReadingCorpusLoader(fetcher: typeof fetch = globalThis.fetch) {
  // Public vocabulary only: never cache owner progress, notes or scores here.
  let cached: ReadingCorpus | undefined
  return async (signal?: AbortSignal) => {
    if (signal?.aborted) throw cancelled()
    if (cached) return cached
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw cancelled()
      try {
        const corpus = await requestCorpus(fetcher, signal)
        if (signal?.aborted) throw cancelled()
        cached = corpus
        return corpus
      } catch (error) {
        if (signal?.aborted) throw cancelled()
        const transient = error instanceof TypeError || error instanceof ReadingRequestError && error.retryable
        if (!transient) throw error
        if (attempt === 1) throw new Error('阅读词库暂时无法连接，请检查网络后重试。')
        await waitToRetry(signal)
      }
    }
    throw new Error('阅读词库加载失败，请重试。')
  }
}

export const loadReadingCorpus = createReadingCorpusLoader()
