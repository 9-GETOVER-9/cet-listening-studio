import { afterEach, expect, it, vi } from 'vitest'
import { runOptimization } from './fsrsOptimizerClient'
import { default_w } from 'ts-fsrs'

class TestWorker {
  static latest: TestWorker
  onmessage?: (event: { data: unknown }) => void
  onerror?: () => void
  terminated = false
  constructor() { TestWorker.latest = this }
  postMessage() {}
  terminate() { this.terminated = true }
}
afterEach(() => vi.unstubAllGlobals())
it('terminates the worker and rejects cancelled optimization', async () => {
  vi.stubGlobal('Worker', TestWorker)
  const task = runOptimization([], [...default_w], () => {})
  task.cancel()
  await expect(task.promise).rejects.toThrow('已取消')
  expect(TestWorker.latest.terminated).toBe(true)
})
it('surfaces worker failures without a result', async () => {
  vi.stubGlobal('Worker', TestWorker)
  const task = runOptimization([], [...default_w], () => {})
  TestWorker.latest.onerror!()
  await expect(task.promise).rejects.toThrow('未能运行')
  expect(TestWorker.latest.terminated).toBe(true)
})
