import { lazy, type ComponentType } from 'react'
import {
  clearChunkReloadAttempt,
  hasRecentlyTriedChunkReload,
  isChunkLoadError,
  reloadForFreshChunks,
} from '@/lib/chunkRecovery'

type LazyImport<T extends ComponentType<unknown>> = () => Promise<{ default: T }>

export function lazyWithRecovery<T extends ComponentType<unknown>>(loader: LazyImport<T>) {
  let pending: ReturnType<LazyImport<T>> | undefined
  const preload = () => pending ??= loader().catch(error => {
    pending = undefined
    throw error
  })
  const component = lazy(async () => {
    try {
      const module = await preload()
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
  return Object.assign(component, { preload })
}
