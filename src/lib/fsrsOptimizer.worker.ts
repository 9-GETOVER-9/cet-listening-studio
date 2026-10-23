import { optimizeParameters, type TrainingCard } from './fsrsOptimization'

self.onmessage = (event: MessageEvent<{ cards: TrainingCard[]; weights: number[] }>) => {
  try {
    const result = optimizeParameters(event.data.cards, event.data.weights, percent => {
      self.postMessage({ type: 'progress', percent })
    })
    self.postMessage({ type: 'result', result })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '计算失败，请重试' })
  }
}
