import { beforeEach, describe, expect, it } from 'vitest'
import { default_w } from 'ts-fsrs'
import { getPersonalParameters, savePersonalParameters, resetPersonalParameters, setFSRSOwner } from './fsrsPreferences'
import { createInitialFSRSState, previewFSRSRatings, scheduleFSRSState } from './fsrsScheduler'

const values = new Map<string, string>()
beforeEach(() => {
  values.clear()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => values.delete(key),
  } })
  setFSRSOwner('a')
})
describe('personal parameters', () => {
  it('isolates owners and learning scopes and resets to defaults', () => {
    const weights = [...default_w]; weights[2] = 9
    savePersonalParameters('a', 'main', weights)
    expect(getPersonalParameters('a', 'main')?.weights[2]).toBe(9)
    expect(getPersonalParameters('b', 'main')).toBeNull()
    expect(getPersonalParameters('a', 'notebook')).toBeNull()
    resetPersonalParameters('a', 'main')
    expect(getPersonalParameters('a', 'main')).toBeNull()
  })
  it('uses persisted parameters in both preview and actual scheduling', () => {
    const weights = [...default_w]; weights[2] = 9
    savePersonalParameters('a', 'main', weights)
    const now = new Date('2026-10-01T00:00:00Z'), state = createInitialFSRSState(now)
    const next = scheduleFSRSState(state, 3, now)
    expect(next.stability).toBe(9)
    expect(previewFSRSRatings(state, now)[3]).toEqual(next)
    setFSRSOwner('b')
    expect(scheduleFSRSState(state, 3, now).stability).toBe(default_w[2])
    expect(state.reps).toBe(0)
  })
  it('rejects invalid parameters and surfaces persistence failure without activation', () => {
    expect(() => savePersonalParameters('a', 'main', [1])).toThrow()
    localStorage.setItem = () => { throw new Error('quota') }
    expect(() => savePersonalParameters('a', 'main', [...default_w])).toThrow('quota')
    expect(getPersonalParameters('a', 'main')).toBeNull()
  })
  it('falls back safely on corrupt storage', () => {
    savePersonalParameters('a', 'main', [...default_w])
    for (const key of values.keys()) values.set(key, '{broken')
    expect(getPersonalParameters('a', 'main')).toBeNull()
  })
})
