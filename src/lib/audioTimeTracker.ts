import { clearListeningTime, saveListeningSlice, type ListeningCategory, type ListeningSlice } from './listeningTime'

interface ListeningContext { owner: string | null; category: ListeningCategory | null }
let owner: string | null = null
const trackers = new Set<AudioTimeTracker>()
export function getListeningOwner() { return owner }
export function setListeningOwner(next: string) {
  if (owner === next) return
  owner = next
  trackers.forEach(tracker => tracker.setOwner(next))
}

// Failed writes keep their original IDs and are retried without duplicating time.
const pending: ListeningSlice[] = []
let writing: Promise<void> | null = null
let storageError = false
export function getListeningStorageError() { return storageError }
function notifyStorage(error: boolean) {
  storageError = error
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('listening-time-storage'))
}
function drain(): Promise<void> {
  if (writing) return writing
  if (!pending.length) return Promise.resolve()
  writing = (async () => {
    try {
      while (pending.length) { await saveListeningSlice(pending[0]); pending.shift() }
      notifyStorage(false)
    } catch { notifyStorage(true) }
  })().finally(() => { writing = null })
  return writing
}
export function retryListeningWrites() { return drain() }
export async function clearOwnedListeningTime(selectedOwner: string) {
  await drain()
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].owner === selectedOwner) pending.splice(i, 1)
  }
  await clearListeningTime(selectedOwner)
  if (!pending.length) notifyStorage(false)
}
function enqueue(slice: ListeningSlice) { pending.push(slice); void drain() }

/** Records only intervals where the media timeline actually advances. */
export class AudioTimeTracker {
  private audio: HTMLAudioElement
  private context: ListeningContext
  private emit: (slice: ListeningSlice) => void
  private now: () => number
  private wall: () => number
  private running = false
  private disposed = false
  private mark = 0
  private mediaMark = 0
  private rate = 1
  private timer: ReturnType<typeof setInterval> | undefined
  private handlers: [string, () => void][]
  constructor(audio: HTMLAudioElement, context: ListeningContext,
    emit: (slice: ListeningSlice) => void = enqueue,
    now: () => number = () => performance.now(), wall: () => number = () => Date.now()) {
    this.audio = audio; this.context = context; this.emit = emit; this.now = now; this.wall = wall
    this.handlers = [
      ['playing', () => this.start()], ['pause', () => this.stop()], ['waiting', () => this.stop()],
      ['seeking', () => this.stop()], ['ended', () => this.stop()], ['error', () => this.stop()],
      ['emptied', () => this.stop()], ['loadstart', () => this.stop()],
      ['seeked', () => { if (!audio.paused && audio.readyState >= 3) this.start() }],
      ['ratechange', () => { this.checkpoint(); this.rate = audio.playbackRate }],
    ]
    this.handlers.forEach(([event, handler]) => audio.addEventListener(event, handler))
    trackers.add(this)
    if (typeof window !== 'undefined') {
      this.timer = setInterval(() => { this.checkpoint(); retryListeningWrites() }, 5000)
      window.addEventListener('pagehide', this.onPageHide)
      window.addEventListener('pageshow', this.onPageShow)
      window.addEventListener('online', retryListeningWrites)
    }
  }
  private onPageHide = () => this.stop()
  private onPageShow = () => { if (!this.audio.paused && this.audio.readyState >= 3) this.start() }
  private start() {
    if (this.running || this.disposed) return
    this.running = true; this.mark = this.now(); this.mediaMark = this.audio.currentTime
    this.rate = this.audio.playbackRate
  }
  private stop() { this.checkpoint(); this.running = false }
  setOwner(next: string) { this.checkpoint(); this.context = { ...this.context, owner: next } }
  setCategory(category: ListeningCategory | null) { this.checkpoint(); this.context = { ...this.context, category } }
  checkpoint() {
    if (!this.running || this.disposed) return
    const now = this.now()
    const seconds = Math.min(Math.max(0, (now - this.mark) / 1000), Math.max(0, (this.audio.currentTime - this.mediaMark) / this.rate))
    this.mark = now; this.mediaMark = this.audio.currentTime
    if (seconds > 0 && this.context.owner && this.context.category) {
      const endedAt = this.wall()
      this.emit({ id: crypto.randomUUID(), owner: this.context.owner, category: this.context.category,
        startedAt: endedAt - seconds * 1000, endedAt, seconds })
    }
  }
  dispose() {
    if (this.disposed) return
    this.stop(); this.disposed = true; trackers.delete(this)
    this.handlers.forEach(([event, handler]) => this.audio.removeEventListener(event, handler))
    if (this.timer) clearInterval(this.timer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide)
      window.removeEventListener('pageshow', this.onPageShow)
      window.removeEventListener('online', retryListeningWrites)
    }
  }
}
