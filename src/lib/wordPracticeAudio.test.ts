import { afterEach, expect, it, vi } from 'vitest'
import { PracticeAudio } from './wordPracticeAudio'
function setup(play = vi.fn(async () => {})) {
  const audio = { play, pause: vi.fn(), currentTime: 0, onended: null, onerror: null, onplaying: null, onpause: null, onwaiting: null, ontimeupdate: null } as unknown as HTMLAudioElement
  const factory = vi.fn(() => audio)
  const states: string[] = []
  const player = new PracticeAudio(factory, state => states.push(state))
  return { audio, factory, states, player, play }
}
const word = { id: 'a', word: 'one', audio: '/one' }
const options = { repeats: 2, speed: 1, muted: false }
afterEach(() => vi.useRealTimers())
it('reuses the mobile-unlocked media element for repeats and later words', () => {
  const { player, audio, factory } = setup()
  player.play(word, options)
  const oldEnd = audio.onended!
  oldEnd.call(audio, new Event('ended'))
  player.play({ ...word, audio: '/two' }, options)
  oldEnd.call(audio, new Event('ended'))
  expect(factory).toHaveBeenCalledTimes(1)
  expect(audio.src).toBe('/two')
  player.stop()
})
it('reports actual playback rather than calling a pending play playing', async () => {
  const { player, audio, states } = setup(vi.fn(() => new Promise<void>(() => {})))
  player.play(word, options)
  expect(states.at(-1)).toBe('loading')
  audio.onplaying!.call(audio, new Event('playing'))
  expect(states.at(-1)).toBe('playing')
  player.stop()
})
it('exits stalled loading and permits a fresh user retry', async () => {
  vi.useFakeTimers()
  const { player, states, play } = setup(vi.fn(() => new Promise<void>(() => {})))
  player.play(word, options)
  await vi.advanceTimersByTimeAsync(15000)
  expect(states.at(-1)).toBe('error')
  player.play(word, options)
  expect(play).toHaveBeenCalledTimes(2)
  expect(states.at(-1)).toBe('loading')
  player.stop()
})
it('does not let an old play rejection break a newer request', async () => {
  let rejectOld!: (reason: Error) => void
  const play = vi.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOld = reject })).mockResolvedValue(undefined)
  const { player, states } = setup(play)
  player.play(word, options)
  player.play({ ...word, audio: '/two' }, options)
  rejectOld(new Error('interrupted'))
  await Promise.resolve()
  expect(states.at(-1)).not.toBe('error')
  player.stop()
})
it('handles permission rejection and stops repeats when muted', async () => {
  const { player, audio, states } = setup(vi.fn().mockRejectedValue(new Error('NotAllowedError')))
  player.play(word, options)
  await Promise.resolve()
  expect(states.at(-1)).toBe('error')
  player.update({ muted: true, speed: 1 })
  expect(audio.onended).toBeNull()
  expect(states.at(-1)).toBe('idle')
})
