import { expect, it } from 'vitest'
const modules = import.meta.glob('./wordPracticeAudio.ts')
async function api() {
  expect(modules['./wordPracticeAudio.ts'], 'cancellable practice playback must exist').toBeDefined()
  return await modules['./wordPracticeAudio.ts']() as typeof import('./wordPracticeAudio')
}
it('cancels repeats and ignores earlier audio callbacks after switching words', async () => {
  const p = await api()
  const audios: HTMLAudioElement[] = []
  let starts = 0
  const factory = () => {
    const audio = { play: async () => { starts++ }, pause: () => {}, onended: null, onerror: null } as unknown as HTMLAudioElement
    audios.push(audio); return audio
  }
  const states: string[] = []
  const player = new p.PracticeAudio(factory, state => states.push(state))
  player.play({ id: 'a', word: 'one', audio: '/one' }, { repeats: 3, speed: 1, muted: false })
  const oldEnd = audios[0].onended!
  player.play({ id: 'b', word: 'two', audio: '/two' }, { repeats: 1, speed: 0.75, muted: false })
  oldEnd.call(audios[0], new Event('ended'))
  expect(starts).toBe(2)
  expect(states.at(-1)).toBe('playing')
  expect(audios[1].playbackRate).toBe(0.75)
  player.stop()
  expect(states.at(-1)).toBe('idle')
})
it('repeats the current real audio and mute cancels playback', async () => {
  const p = await api()
  const audios: HTMLAudioElement[] = []
  const player = new p.PracticeAudio(() => {
    const audio = { play: async () => {}, pause: () => {}, onended: null, onerror: null } as unknown as HTMLAudioElement
    audios.push(audio); return audio
  }, () => {})
  player.play({ id: 'a', word: 'one', audio: '/one' }, { repeats: 2, speed: 1, muted: false })
  audios[0].onended!.call(audios[0], new Event('ended'))
  expect(audios).toHaveLength(2)
  player.update({ muted: true, speed: 1.25 })
  expect(audios[1].onended).toBeNull()
})
