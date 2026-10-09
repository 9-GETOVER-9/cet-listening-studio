import { describe, expect, it, vi } from 'vitest'
import { IELTSPlayer } from './ieltsPlayer'

class FakeAudio {
  src = ''; currentTime = 0; paused = true; playbackRate = 1; preservesPitch = false
  onended: (() => void) | null = null; onerror: (() => void) | null = null
  play = vi.fn(async () => { this.paused = false })
  pause = vi.fn(() => { this.paused = true })
  load = vi.fn()
}

describe('IELTS continuous playback', () => {
  it('changes speed without restarting and preserves it on the next track and queue', async () => {
    const audio = new FakeAudio(), player = new IELTSPlayer(audio as unknown as HTMLAudioElement, vi.fn())
    player.setQueue(['one', 'two']); await player.play(); audio.currentTime = 12
    player.setRate(1.25)
    expect(audio.playbackRate).toBe(1.25); expect(audio.currentTime).toBe(12); expect(audio.preservesPitch).toBe(true)
    audio.onended?.(); expect(audio.playbackRate).toBe(1.25)
    player.setQueue(['other']); expect(audio.playbackRate).toBe(1.25)
    player.setRate(0.5); expect(audio.playbackRate).toBe(0.5)
    player.setRate(1.5); expect(audio.playbackRate).toBe(1.5)
    expect(() => player.setRate(2)).toThrow(); expect(() => player.setRate(NaN)).toThrow()
    expect(audio.playbackRate).toBe(1.5)
  })
  it('advances through the selected queue, loops it and pauses without losing position', async () => {
    const audio = new FakeAudio()
    const update = vi.fn()
    const player = new IELTSPlayer(audio as unknown as HTMLAudioElement, update)
    player.setQueue(['one', 'two']); await player.play()
    expect(audio.src).toBe('one')
    audio.onended?.(); await Promise.resolve()
    expect(audio.src).toBe('two')
    audio.onended?.(); await Promise.resolve()
    expect(audio.src).toBe('one')
    audio.currentTime = 12; player.pause(); await player.play()
    expect(audio.currentTime).toBe(12)
  })
  it('ignores old end/error/play callbacks after a unit switch or disposal', async () => {
    const audio = new FakeAudio()
    let reject!: (e: Error) => void
    audio.play.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    const update = vi.fn()
    const player = new IELTSPlayer(audio as unknown as HTMLAudioElement, update)
    player.setQueue(['old', 'old-next']); const pending = player.play()
    const oldEnd = audio.onended, oldError = audio.onerror
    player.setQueue(['new']); oldEnd?.(); oldError?.(); reject(new Error('old failure')); await pending
    expect(audio.src).toBe('new')
    expect(update.mock.calls.at(-1)?.[0]).toEqual({ index: 0, playing: false, error: '' })
    player.dispose(); expect(audio.onended).toBeNull(); expect(audio.paused).toBe(true)
  })
  it('stops on failure and supports previous/next with loop disabled', async () => {
    const audio = new FakeAudio(), update = vi.fn()
    const player = new IELTSPlayer(audio as unknown as HTMLAudioElement, update)
    player.setQueue(['one', 'two']); player.loop = false
    await player.play(); player.next(); expect(audio.src).toBe('two')
    audio.onended?.(); expect(update.mock.calls.at(-1)?.[0].playing).toBe(false)
    player.previous(); await player.play(); audio.onerror?.()
    expect(audio.paused).toBe(true)
    expect(update.mock.calls.at(-1)?.[0].error).toBeTruthy()
  })
})
