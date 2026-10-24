import { expect, it, vi } from 'vitest'
import { lazyWithRecovery } from './lazyWithRecovery'

it('coalesces route preloads without downloading other pages', async () => {
  const loader = vi.fn(async () => ({ default: () => null }))
  const otherLoader = vi.fn(async () => ({ default: () => null }))
  const page = lazyWithRecovery(loader)
  lazyWithRecovery(otherLoader)
  const [first, second] = await Promise.all([page.preload(), page.preload()])
  expect(first).toBe(second)
  expect(loader).toHaveBeenCalledOnce()
  expect(otherLoader).not.toHaveBeenCalled()
})

it('allows retry after an unsuccessful speculative preload', async () => {
  const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: () => null })
  const page = lazyWithRecovery(loader)
  await expect(page.preload()).rejects.toThrow('offline')
  await expect(page.preload()).resolves.toHaveProperty('default')
  expect(loader).toHaveBeenCalledTimes(2)
})
