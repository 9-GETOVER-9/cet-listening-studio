import { describe, expect, it, vi } from 'vitest'
import { getOrCreateDeviceSessionId, signOutCurrentDevice } from './sessionPolicy'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('browser session policy', () => {
  it('shares one device session id through persistent browser storage', () => {
    const browserStorage = new MemoryStorage()

    const firstTabId = getOrCreateDeviceSessionId(browserStorage)
    const secondTabId = getOrCreateDeviceSessionId(browserStorage)

    expect(secondTabId).toBe(firstTabId)
  })

  it('signs out only the current device when another device takes over', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null })

    await signOutCurrentDevice({ signOut })

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
