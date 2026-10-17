export type PracticeAudioState = 'idle' | 'loading' | 'playing' | 'error'
export interface PracticeAudioOptions { repeats: number; speed: number; muted: boolean; voice?: SpeechSynthesisVoice }
export class PracticeAudio {
  private timeout: ReturnType<typeof setTimeout> | undefined
  private token = 0
  private audio: HTMLAudioElement | null = null
  private utterance: SpeechSynthesisUtterance | null = null
  private options: PracticeAudioOptions = { repeats: 1, speed: 1, muted: false }
  private factory: () => HTMLAudioElement
  private changed: (state: PracticeAudioState) => void
  constructor(factory = () => new Audio(), changed: (state: PracticeAudioState) => void = () => {}) { this.factory = factory; this.changed = changed }
  stop() {
    this.token++
    clearTimeout(this.timeout)
    if (this.audio) {
      this.audio.onended = null; this.audio.onerror = null; this.audio.onplaying = null
      this.audio.onpause = null; this.audio.onwaiting = null; this.audio.ontimeupdate = null
      this.audio.pause()
    }
    if (this.utterance) { this.utterance.onend = null; this.utterance.onerror = null; globalThis.speechSynthesis?.cancel(); this.utterance = null }
    this.changed('idle')
  }
  update(options: { speed: number; muted: boolean }) {
    this.options = { ...this.options, ...options }
    if (options.muted) this.stop()
    else if (this.audio) { this.audio.playbackRate = options.speed; this.audio.muted = options.muted }
  }
  play(word: { id: string; word: string; audio?: string }, options: PracticeAudioOptions) {
    this.stop(); this.options = options
    if (options.muted) return
    const token = this.token
    let remaining = Math.max(1, options.repeats)
    const valid = () => token === this.token && !this.options.muted
    const failed = () => {
      if (!valid()) return
      this.stop()
      this.changed('error')
    }
    const watch = () => {
      clearTimeout(this.timeout)
      this.timeout = setTimeout(failed, 15000)
    }
    const next = () => {
      if (!valid()) return
      clearTimeout(this.timeout)
      if (remaining-- <= 0) { this.stop(); return }
      if (word.audio) {
        // Preserve the element unlocked by the user's tap across repeats and sentences.
        const audio = this.audio ?? this.factory(); this.audio = audio
        this.changed('loading')
        audio.onplaying = () => { if (valid()) { clearTimeout(this.timeout); this.changed('playing') } }
        audio.onwaiting = () => { if (valid()) { this.changed('loading'); watch() } }
        audio.onpause = () => { if (valid() && audio.paused && !audio.ended) { this.stop() } }
        audio.src = word.audio
        audio.currentTime = 0
        audio.playbackRate = this.options.speed; audio.muted = this.options.muted; audio.preservesPitch = true
        audio.onended = next; audio.onerror = failed
        watch()
        try { void audio.play().catch(failed) } catch { failed() }
      } else if (options.voice && globalThis.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
        this.changed('playing')
        const utterance = new SpeechSynthesisUtterance(word.word); this.utterance = utterance
        utterance.voice = options.voice; utterance.lang = options.voice.lang; utterance.rate = this.options.speed
        utterance.onend = next; utterance.onerror = failed
        globalThis.speechSynthesis.speak(utterance)
      } else failed()
    }
    next()
  }
}
export function availablePracticeVoices(voices: SpeechSynthesisVoice[]) {
  return voices.filter(voice => /^(en-GB|en-US)$/i.test(voice.lang))
}
