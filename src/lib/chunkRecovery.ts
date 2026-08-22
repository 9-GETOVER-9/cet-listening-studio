const CHUNK_RELOAD_KEY = 'cet-listening:chunk-reload-attempted-at'
const CHUNK_RELOAD_WINDOW_MS = 30_000

const CHUNK_LOAD_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'Loading chunk',
  'ChunkLoadError',
]

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

export function hasRecentlyTriedChunkReload(): boolean {
  if (typeof window === 'undefined') return true

  const attemptedAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)

  return attemptedAt > 0 && Date.now() - attemptedAt < CHUNK_RELOAD_WINDOW_MS
}

export async function reloadForFreshChunks(): Promise<void> {
  if (typeof window === 'undefined') return

  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.update()))
    } catch (error) {
      console.warn('Service worker update check failed before reload:', error)
    }
  }

  window.location.reload()
}

export function clearChunkReloadAttempt(): void {
  if (typeof window === 'undefined') return

  window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
}
