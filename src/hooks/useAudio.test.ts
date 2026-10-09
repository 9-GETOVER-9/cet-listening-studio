import { describe, expect, it } from 'vitest'

import { applyAudioSpeed } from '@/lib/audioSpeed'

describe('applyAudioSpeed', () => {
  it('updates both the current and default playback speed immediately', () => {
    const audio = {
      defaultPlaybackRate: 1,
      playbackRate: 1,
    } as HTMLAudioElement

    applyAudioSpeed(audio, 1.5)

    expect(audio.defaultPlaybackRate).toBe(1.5)
    expect(audio.playbackRate).toBe(1.5)
  })

  it('keeps pitch preservation enabled when the browser exposes it', () => {
    const audio = {
      defaultPlaybackRate: 1,
      playbackRate: 1,
      preservesPitch: false,
      mozPreservesPitch: false,
      webkitPreservesPitch: false,
    } as HTMLAudioElement & {
      mozPreservesPitch: boolean
      webkitPreservesPitch: boolean
    }

    applyAudioSpeed(audio, 0.75)

    expect(audio.defaultPlaybackRate).toBe(0.75)
    expect(audio.playbackRate).toBe(0.75)
    expect(audio.preservesPitch).toBe(true)
    expect(audio.mozPreservesPitch).toBe(true)
    expect(audio.webkitPreservesPitch).toBe(true)
  })
})
