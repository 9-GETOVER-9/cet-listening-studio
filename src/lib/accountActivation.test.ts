import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const adapters = vi.hoisted(() => ({
  apply: vi.fn<(owner: string, key: string, value: unknown) => Promise<boolean>>(async () => true), reset: vi.fn(async () => {}),
  session: vi.fn(async () => ({ data: { session: { user: { id: 'alice' }, access_token: 'test-only' } } })),
}))
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: adapters.session } } }))
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: { getState: () => ({ currentUserId: '' }) } }))
vi.mock('./accountSyncData', () => ({ collectLearningData: async () => new Map(), applyLearningRecord: adapters.apply,
  resetGlobalLearning: adapters.reset, observeLearningWrites: () => () => {}, clearOwnedLearning: async () => {} }))
vi.mock('@/db/crud', () => ({ syncModuleStats: async () => {} }))
vi.mock('./fsrsPreferences', () => ({ setFSRSOwner: () => {} }))
vi.mock('./audioTimeTracker', () => ({ setListeningOwner: () => {} }))
vi.mock('./sync', () => ({ pullCardStates: async () => [], pullNotebookItems: async () => [] }))

describe('local account activation with a slow cloud', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('navigator', { onLine: true })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('restores only the chosen account and unlocks the app before cloud transfer completes', async () => {
    const { accountSyncDB } = await import('./accountSyncEngine')
    const { db } = await import('@/db/schema')
    await Promise.all(accountSyncDB.tables.map(t => t.clear()))
    await accountSyncDB.meta.put({ key: 'main-owner', value: 'guest' })
    await accountSyncDB.accounts.put({ owner: 'alice', cursor: 0, migrated: true })
    const value = { cardId: 'fresh', aiUnlocked: false, fsrsMain: { reps: 1 } }
    await accountSyncDB.records.bulkPut(['alice', 'bob'].map(owner => ({ owner, key: 'card/fresh', value,
      observed: value, version: 1, modifiedAt: 1, pending: null })))
    let release!: (response: Response) => void
    const request = new Promise<Response>(resolve => { release = resolve })
    const fetchMock = vi.fn(() => request.then(response => response.clone()))
    vi.stubGlobal('fetch', fetchMock)
    const { activateLearningAccount, useAccountSyncStatus, syncAccountNow } = await import('./accountSync')
    const activation = activateLearningAccount('alice')
    let resolved = false
    void activation.then(() => { resolved = true })
    try {
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      // The network remains deliberately unresolved. No wall-clock performance threshold is asserted.
      await vi.waitFor(() => expect(resolved).toBe(true))
      expect(useAccountSyncStatus.getState()).toMatchObject({ owner: 'alice', ready: true, phase: 'syncing' })
      expect(adapters.reset).toHaveBeenCalledOnce()
      expect(adapters.apply.mock.calls.map(args => args[0])).toEqual(['alice'])
    } finally {
      release(new Response(JSON.stringify({ acks: [], records: [], cursor: 0, more: false })))
      await activation
      await syncAccountNow()
      expect(useAccountSyncStatus.getState()).toMatchObject({ ready: true, phase: 'synced' })
      await Promise.all(accountSyncDB.tables.map(t => t.clear()))
      accountSyncDB.close(); db.close()
    }
  })

  it('keeps local learning available after cloud failure and allows retry', async () => {
    const { accountSyncDB } = await import('./accountSyncEngine')
    const { db } = await import('@/db/schema')
    await Promise.all(accountSyncDB.tables.map(t => t.clear()))
    await accountSyncDB.meta.put({ key: 'main-owner', value: 'alice' })
    await accountSyncDB.accounts.put({ owner: 'alice', cursor: 0, migrated: true })
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValue(new Response(JSON.stringify({ acks: [], records: [], cursor: 0, more: false })))
    vi.stubGlobal('fetch', fetchMock)
    const { activateLearningAccount, useAccountSyncStatus, syncAccountNow } = await import('./accountSync')
    try {
      await activateLearningAccount('alice')
      await vi.waitFor(() => expect(useAccountSyncStatus.getState().phase).toBe('error'))
      expect(useAccountSyncStatus.getState().ready).toBe(true)
      await syncAccountNow()
      expect(useAccountSyncStatus.getState()).toMatchObject({ ready: true, phase: 'synced' })
    } finally {
      await Promise.all(accountSyncDB.tables.map(t => t.clear()))
      accountSyncDB.close(); db.close()
    }
  })
})
