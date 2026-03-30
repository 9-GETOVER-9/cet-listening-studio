import { Play, Pause, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PlayState } from '@/hooks/useAudio'

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5]

interface AudioPlayerProps {
  playState: PlayState
  speed: number
  onPlay: () => void
  onPause: () => void
  onChangeSpeed: (speed: number) => void
  className?: string
}

/**
 * 音频播放器 UI 组件
 * 使用 shadcn/ui Slider + lucide-react 图标
 */
export function AudioPlayer({
  playState,
  speed,
  onPlay,
  onPause,
  onChangeSpeed,
  className,
}: AudioPlayerProps) {
  const isLoading = playState === 'loading'
  const isPlaying = playState === 'playing'

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* 播放按钮 */}
      <Button
        size="lg"
        variant={isPlaying ? 'default' : 'outline'}
        className={cn(
          'h-20 w-20 rounded-full shadow-md transition-all',
          isPlaying && 'bg-brand hover:bg-brand-dark'
        )}
        onClick={isPlaying ? onPause : onPlay}
        disabled={isLoading}
      >
        {isLoading ? (
          <RotateCcw className="h-8 w-8 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-8 w-8" />
        ) : (
          <Play className="ml-1 h-8 w-8" />
        )}
      </Button>

      {/* 速度控制 */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-gray-500">播放速度</p>
        <div className="flex items-center gap-2">
          {SPEED_OPTIONS.map((s) => (
            <Button
              key={s}
              variant={speed === s ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-8 min-w-12 px-2 text-xs',
                speed === s && 'bg-brand hover:bg-brand-dark'
              )}
              onClick={() => onChangeSpeed(s)}
            >
              {s}x
            </Button>
          ))}
        </div>
      </div>

      {/* 错误提示 */}
      {playState === 'error' && (
        <p className="text-xs text-red-500">音频加载失败</p>
      )}
    </div>
  )
}
