export interface PlayerState { index: number; playing: boolean; error: string }

/** One media element, with callbacks invalidated whenever its queue changes. */
export class IELTSPlayer {
  private queue: string[] = []
  private generation = 0
  private rate = 1
  private state: PlayerState = { index: 0, playing: false, error: '' }
  loop = true
  private audio: HTMLAudioElement
  private update: (state: PlayerState) => void
  constructor(audio: HTMLAudioElement, update: (state: PlayerState) => void) { this.audio = audio; this.update = update }
  private publish(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch }; this.update(this.state)
  }
  setQueue(queue: string[]) {
    this.pause(); this.queue = queue; this.select(0, false)
  }
  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 1.5) throw new RangeError('播放速度须在 0.5–1.5 倍之间')
    this.rate = rate; this.audio.playbackRate = rate; this.audio.preservesPitch = true
  }
  private select(index: number, autoplay: boolean) {
    this.generation++; this.audio.pause()
    this.audio.onended = null; this.audio.onerror = null
    this.audio.src = this.queue[index] ?? ''; this.audio.currentTime = 0
    this.audio.load(); this.setRate(this.rate); this.publish({ index, playing: false, error: '' })
    if (autoplay) void this.play()
  }
  async play() {
    if (!this.queue.length) return
    const generation = ++this.generation
    const valid = () => generation === this.generation
    const fail = () => {
      if (!valid()) return
      this.audio.pause(); this.publish({ playing: false, error: '播放失败，请检查网络后重试。' })
    }
    this.audio.onended = () => {
      if (!valid()) return
      if (this.state.index + 1 < this.queue.length) this.select(this.state.index + 1, true)
      else if (this.loop) this.select(0, true)
      else this.pause()
    }
    this.audio.onerror = fail
    this.publish({ playing: true, error: '' })
    try { await this.audio.play() } catch { fail() }
  }
  pause() { this.generation++; this.audio.pause(); this.publish({ playing: false }) }
  next() { if (this.queue.length) this.select((this.state.index + 1) % this.queue.length, this.state.playing) }
  previous() { if (this.queue.length) this.select((this.state.index + this.queue.length - 1) % this.queue.length, this.state.playing) }
  dispose() { this.pause(); this.audio.onended = null; this.audio.onerror = null; this.queue = [] }
}
