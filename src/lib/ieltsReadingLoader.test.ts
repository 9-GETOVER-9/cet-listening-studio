import { afterEach, expect, it, vi } from 'vitest'
import { createReadingCorpusLoader } from './ieltsReadingLoader'

const corpus = { version: 'ielts-reading-538-v1', title: '阅读', cards: [{ id: 'r1', word: 'home', meaning: '家', category: 1, order: 1, sourceRow: 1, relation: 'lexical', status: 'verified', expressions: [{ id: 'e1', text: 'house' }] }] }
const response = () => new Response(JSON.stringify(corpus))
afterEach(() => vi.useRealTimers())

it('reuses validated vocabulary when returning to the reading route', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response())
  const load = createReadingCorpusLoader(fetcher)
  expect((await load()).cards[0].word).toBe('home')
  expect((await load()).cards[0].word).toBe('home')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('recovers from a transient network failure with one bounded retry', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response())
  const pending = createReadingCorpusLoader(fetcher)()
  const result = pending.then(value => ({ value }), error => ({ error }))
  await vi.runAllTimersAsync()
  expect(await result).toMatchObject({ value: { title: '阅读' } })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('does not retry a missing vocabulary and allows a later explicit retry', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(response())
  const load = createReadingCorpusLoader(fetcher)
  await expect(load()).rejects.toThrow(/词库.*404/)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await expect(load()).resolves.toMatchObject({ title: '阅读' })
})

it('does not cache invalid vocabulary or replace it with an empty success', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"cards":[]}')).mockResolvedValueOnce(response())
  const load = createReadingCorpusLoader(fetcher)
  await expect(load()).rejects.toThrow(/数据|词库|词条/)
  await expect(load()).resolves.toMatchObject({ title: '阅读' })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('stops stalled fetch/body reads rather than keeping the loading state forever', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response)
  const pending = createReadingCorpusLoader(fetcher)()
  const assertion = expect(pending).rejects.toThrow(/连接|超时|网络/)
  await vi.runAllTimersAsync()
  await assertion
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('aborts navigation without retries or populating the success cache', async () => {
  const controller = new AbortController()
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })).mockResolvedValueOnce(response())
  const load = createReadingCorpusLoader(fetcher)
  const pending = load(controller.signal)
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetcher).toHaveBeenCalledTimes(1)
  await expect(load()).resolves.toMatchObject({ title: '阅读' })
})

it('does not issue a request when navigation has already been cancelled', async () => {
  const controller = new AbortController(); controller.abort()
  const fetcher = vi.fn<typeof fetch>()
  await expect(createReadingCorpusLoader(fetcher)(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetcher).not.toHaveBeenCalled()
})
