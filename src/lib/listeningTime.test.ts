import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listeningTimeDB, saveListeningSlice, readListeningSlices, splitListeningSlice, summarizeListeningTime, getListeningCategory } from './listeningTime'
import { AudioTimeTracker, getListeningStorageError, retryListeningWrites, clearOwnedListeningTime } from './audioTimeTracker'

class Media extends EventTarget {
  currentTime = 0
  playbackRate = 1
  paused = true
  readyState = 4
  seeking = false
  event(name: string) { this.dispatchEvent(new Event(name)) }
}

describe('actual listening time', () => {
  beforeEach(async () => { await listeningTimeDB.delete(); await listeningTimeDB.open() })
  it('uses real time at different rates and excludes pauses, buffering and seeks', () => {
    const audio = new Media()
    let now = 0
    const slices: { seconds: number }[] = []
    const tracker = new AudioTimeTracker(audio as unknown as HTMLAudioElement, { owner: 'guest', category: 'nce1' }, slice => { slices.push(slice) }, () => now, () => 100000)
    audio.paused = false; audio.event('playing')
    now = 2000; audio.currentTime = 2; audio.event('waiting')
    now = 12000; audio.event('playing')
    audio.playbackRate = 1.5; audio.event('ratechange')
    now = 16000; audio.currentTime = 8; audio.event('seeking')
    now = 26000; audio.currentTime = 80; audio.event('seeked')
    now = 28000; audio.currentTime = 83; audio.paused = true; audio.event('pause')
    tracker.dispose()
    expect(slices.reduce((sum, slice) => sum + slice.seconds, 0)).toBeCloseTo(8)
  })
  it('does not count a stalled clock without advancing audio or checkpoint twice', () => {
    const audio = new Media(); let now = 0
    const slices: { seconds: number }[] = []
    const tracker = new AudioTimeTracker(audio as unknown as HTMLAudioElement, { owner: 'alice', category: 'cet6' }, s => { slices.push(s) }, () => now, () => 100000)
    audio.paused = false; audio.event('playing')
    now = 30000; audio.currentTime = 3; tracker.checkpoint(); tracker.checkpoint()
    audio.paused = true; audio.event('pause'); tracker.dispose()
    expect(slices.reduce((sum, s) => sum + s.seconds, 0)).toBe(3)
  })
  it('splits a playback across local midnight without losing time', () => {
    const startedAt = new Date(2026, 9, 7, 23, 59, 58).getTime()
    const slices = splitListeningSlice({ id: 'a', owner: 'alice', category: 'frequency', startedAt, endedAt: startedAt + 5000, seconds: 5 })
    expect(slices.map(s => [s.day, s.seconds])).toEqual([['2026-10-07', 2], ['2026-10-08', 3]])
  })
  it('persists exact slices once and isolates accounts including guests', async () => {
    const slice = { id: 'one', owner: 'alice', category: 'wanglu' as const, startedAt: Date.now(), endedAt: Date.now() + 1000, seconds: 1 }
    await saveListeningSlice(slice); await saveListeningSlice(slice)
    await saveListeningSlice({ ...slice, id: 'two', owner: 'guest', category: 'nce4', seconds: 2 })
    expect(summarizeListeningTime(await readListeningSlices('alice')).total).toBe(1)
    expect(summarizeListeningTime(await readListeningSlices('guest')).categories.nce4).toBe(2)
    expect(await readListeningSlices('bob')).toEqual([])
  })
  it('surfaces storage errors instead of reporting a saved record', async () => {
    const write = vi.spyOn(listeningTimeDB.slices, 'put').mockRejectedValueOnce(new Error('quota'))
    try { await expect(saveListeningSlice({ id: 'err', owner: 'alice', category: 'cet4', startedAt: 1, endedAt: 1001, seconds: 1 })).rejects.toThrow('quota') }
    finally { write.mockRestore() }
  })
  it('classifies card metadata without guessing unknown new concept books', () => {
    expect(getListeningCategory({ level: 'NCE', book: 'Book3' })).toBe('nce3')
    expect(getListeningCategory({ level: 'CET4' })).toBe('cet4')
    expect(getListeningCategory({ level: 'NCE' })).toBeNull()
  })
  it('retries failed playback persistence once and clears the selected account only', async () => {
    const audio = new Media(); let now = 0
    const write = vi.spyOn(listeningTimeDB.slices, 'put').mockRejectedValueOnce(new Error('quota'))
    const tracker = new AudioTimeTracker(audio as unknown as HTMLAudioElement, { owner: 'alice', category: 'cet4' }, undefined, () => now, () => 100000)
    audio.paused = false; audio.event('playing'); now = 2000; audio.currentTime = 2
    audio.paused = true; audio.event('pause'); tracker.dispose()
    await vi.waitFor(() => expect(getListeningStorageError()).toBe(true))
    write.mockRestore()
    await retryListeningWrites(); await retryListeningWrites()
    await vi.waitFor(async () => expect(summarizeListeningTime(await readListeningSlices('alice')).total).toBe(2))
    await saveListeningSlice({ id: 'guest', owner: 'guest', category: 'wanglu', startedAt: 1, endedAt: 1001, seconds: 1 })
    await clearOwnedListeningTime('alice')
    expect(await readListeningSlices('alice')).toEqual([])
    expect(await readListeningSlices('guest')).toHaveLength(1)
  })
  it('captures partial slow playback before owner or category changes', () => {
    const audio = new Media(); audio.playbackRate = 0.5
    let now = 0; const slices: { owner: string; category: string; seconds: number }[] = []
    const tracker = new AudioTimeTracker(audio as unknown as HTMLAudioElement, { owner: 'alice', category: 'nce2' }, s => { slices.push(s) }, () => now, () => 100000)
    audio.paused = false; audio.event('playing'); now = 4000; audio.currentTime = 2
    tracker.setOwner('bob'); tracker.setCategory('nce4')
    now = 6000; audio.currentTime = 3; tracker.dispose()
    expect(slices.map(s => [s.owner, s.category, s.seconds])).toEqual([['alice', 'nce2', 4], ['bob', 'nce4', 2]])
  })
})
