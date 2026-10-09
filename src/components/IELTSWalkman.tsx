import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IELTSPlayer, type PlayerState } from '@/lib/ieltsPlayer'
import type { IELTSCorpus } from '@/lib/ieltsDictation'
import { AudioTimeTracker, getListeningOwner } from '@/lib/audioTimeTracker'

export function IELTSWalkman({ corpus, chapter, section, title, rate, book }: { corpus: IELTSCorpus; chapter: number; section: string; title: string; rate: number; book: 'wanglu' | 'frequency' }) {
  const tracks = useMemo(() => (corpus.tracks ?? []).filter(track => track.chapter === chapter &&
    (section === 'all' || track.cardIds.some(id => corpus.cards.some(c => c.id === id && c.section === section)))), [corpus, chapter, section])
  const [state, setState] = useState<PlayerState>({ index: 0, playing: false, error: '' })
  const [loop, setLoop] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const playerRef = useRef<IELTSPlayer | null>(null)
  const track = tracks[state.index]
  const entries = useMemo(() => {
    const ids = new Set(track?.cardIds)
    return corpus.cards.filter(c => ids.has(c.id))
  }, [corpus, track])

  useEffect(() => {
    if (!audioRef.current) return
    const tracker = new AudioTimeTracker(audioRef.current, { owner: getListeningOwner(), category: book })
    return () => tracker.dispose()
  }, [book])

  useEffect(() => {
    if (!audioRef.current) return
    const player = new IELTSPlayer(audioRef.current, setState)
    playerRef.current = player
    player.setQueue(tracks.map(t => t.audio))
    return () => { player.dispose(); playerRef.current = null }
  }, [tracks])
  useEffect(() => { if (playerRef.current) playerRef.current.loop = loop }, [loop, tracks])
  useEffect(() => { playerRef.current?.setRate(rate) }, [rate, tracks])
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return
    if (typeof MediaMetadata !== 'undefined') navigator.mediaSession.metadata = new MediaMetadata({ title: track.label, artist: title, album: '雅思随身听' })
    const handlers = { play: () => { void playerRef.current?.play() }, pause: () => playerRef.current?.pause(),
      nexttrack: () => playerRef.current?.next(), previoustrack: () => playerRef.current?.previous() }
    const supported: MediaSessionAction[] = []
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler); supported.push(action as MediaSessionAction) } catch { /* Optional browser capability. */ }
    }
    navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused'
    return () => { supported.forEach(action => navigator.mediaSession.setActionHandler(action, null)); navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none' }
  }, [track, title, state.playing])
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

  return <section className="mt-6 border-t border-[var(--app-line)] pt-6" aria-label="雅思随身听">
    <p className="quiet-kicker">随身听 · 英文 → 中文</p>
    <h2 className="mt-3 text-xl font-semibold">{track?.label ?? '双语音频准备中'}</h2>
    {corpus.chineseVoice && <p className="mt-2 text-sm text-[var(--app-muted)]">中文配音 · {corpus.chineseVoice.name}</p>}
    <p className="mt-2 text-sm text-[var(--app-muted)]">按所选章或单元顺序连续播放。当前 {rate} 倍速，中英间隔约 {(2.5 / rate).toFixed(1)} 秒（原速 2.5 秒）。切换内容时会停止当前音频。</p>
    <audio ref={audioRef} preload="metadata" onLoadStart={() => { setTime(0); setDuration(0) }} onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
      onLoadedMetadata={e => { setTime(0); setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0) }} />
    <div className="my-5 flex flex-wrap items-center gap-3">
      <Button variant="outline" aria-label="上一段" disabled={!tracks.length} onClick={() => playerRef.current?.previous()}><SkipBack className="h-4 w-4" /></Button>
      <Button disabled={!tracks.length} onClick={() => state.playing ? playerRef.current?.pause() : void playerRef.current?.play()}>
        {state.playing ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{state.playing ? '暂停随身听' : '播放随身听'}
      </Button>
      <Button variant="outline" aria-label="下一段" disabled={!tracks.length} onClick={() => playerRef.current?.next()}><SkipForward className="h-4 w-4" /></Button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />循环所选内容</label>
    </div>
    {state.error && <p role="alert" className="mb-3 text-sm text-red-600">{state.error}</p>}
    <label className="block text-sm text-[var(--app-muted)]">第 {tracks.length ? state.index + 1 : 0} / {tracks.length} 段 · {clock(time)} / {clock(duration)}
      <input aria-label="播放进度" type="range" className="mt-3 w-full" min="0" max={duration || 1} step="1" value={Math.min(time, duration || 1)}
        disabled={!duration} onChange={e => { if (audioRef.current) { audioRef.current.currentTime = Number(e.target.value); setTime(Number(e.target.value)) } }} />
    </label>
    <details className="mt-5"><summary className="cursor-pointer text-sm">查看本段词汇与中文 · {entries.length} 条</summary>
      <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-[var(--app-line)]">
        {entries.map(card => <div key={card.id} className="py-3"><p className="font-medium">{card.word}</p><p className="mt-1 text-sm text-[var(--app-muted)]">{card.chinese}</p></div>)}
      </div>
    </details>
    {corpus.translationNote && <p className="mt-4 text-xs leading-5 text-[var(--app-muted)]">{corpus.translationNote} · <a className="underline" href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">词典来源</a></p>}
  </section>
}
