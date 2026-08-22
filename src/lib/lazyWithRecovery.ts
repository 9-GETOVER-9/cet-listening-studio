import { lazy, type ComponentType } from 'react'
import {
  clearChunkReloadAttempt,
  hasRecentlyTriedChunkReload,
  isChunkLoadError,
  reloadForFreshChunks,
} from '@/lib/chunkRecovery'

type LazyImport<T extends ComponentType<unknown>> = () => Promise<{ default: T }>

export function lazyWithRecovery<T extends ComponentType<unknown>>(loader: LazyImport<T>) {
  return lazy(async () => {
    try {
      const module = await loader()
      clearChunkReloadAttempt()
      return module
    } catch (error) {
      if (isChunkLoadError(error) && !hasRecentlyTriedChunkReload()) {
        await reloadForFreshChunks()
        return new Promise<{ default: T }>(() => {})
      }

      throw error
    }
  })
}
