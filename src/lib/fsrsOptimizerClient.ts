import type { OptimizationResult, TrainingCard } from './fsrsOptimization'

export function runOptimization(cards: TrainingCard[], weights: number[], onProgress: (value: number) => void) {
  const worker = new Worker(new URL('./fsrsOptimizer.worker.ts', import.meta.url), { type: 'module' })
  let rejectPending: (error: Error) => void = () => {}
  const promise = new Promise<OptimizationResult>((resolve, reject) => {
    rejectPending = reject
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.percent)
      if (data.type === 'result') { worker.terminate(); resolve(data.result) }
      if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)) }
    }
    worker.onerror = () => { worker.terminate(); reject(new Error('优化线程未能运行，请刷新页面后重试')) }
    worker.postMessage({ cards, weights })
  })
  return { promise, cancel: () => { worker.terminate(); rejectPending(new Error('已取消优化')) } }
}
