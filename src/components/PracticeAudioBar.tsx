import { Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { playing: boolean; loading: boolean; error?: boolean; speed: number; onPlay: () => void; onSpeed: (speed: number) => void; onFlip: () => void }
export function PracticeAudioBar({ playing, loading, error, speed, onPlay, onSpeed, onFlip }: Props) {
  return <div className="mb-3 flex items-center gap-2">
    <Button className="h-11 shrink-0" variant="outline" disabled={loading} onClick={onPlay} aria-label={loading ? '正在加载音频' : playing ? '暂停音频' : error ? '重试播放音频' : '重播音频'}>{loading ? <RotateCcw className="animate-spin" aria-hidden="true" /> : playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{playing ? '暂停' : error ? '重试' : '重播'}</span></Button>
    <label className="flex items-center gap-1 text-xs text-[var(--app-muted)]"><span className="sr-only">播放速度</span><select className="h-11 rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] px-2 text-sm text-[var(--app-ink)]" aria-label="播放速度" value={speed} onChange={event => onSpeed(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
    <Button variant="ghost" className="ml-auto h-11 px-3 text-xs" onClick={onFlip}>返回题面</Button>
  </div>
}
