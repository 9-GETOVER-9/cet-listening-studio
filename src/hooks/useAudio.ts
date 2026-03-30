import { useState, useRef, useCallback, useEffect } from 'react'

export type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface UseAudioReturn {
  playState: PlayState
  speed: number
  play: () => void
  pause: () => void
  resume: () => void
  changeSpeed: (speed: number) => void
}

/**
 * 音频播放 Hook
 * 使用原生 HTML5 Audio，直接支持 playbackRate 速度调节
 */
export function useAudio(
  audioFile: string,
  options: { defaultSpeed?: number } = {}
): UseAudioReturn {
  const { defaultSpeed = 1.0 } = options

  const [playState, setPlayState] = useState<PlayState>('idle')
  const [speed, setSpeed] = useState(defaultSpeed)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speedRef = useRef(defaultSpeed)

  // 清理
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
  }, [])

  const play = useCallback(() => {
    if (!audioFile) {
      setPlayState('error')
      return
    }

    stopCurrent()
    setPlayState('loading')

    const audioUrl = `/data/audio/${audioFile}`
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.playbackRate = speedRef.current

    audio.addEventListener('canplaythrough', () => {
      setPlayState('playing')
    }, { once: true })

    audio.addEventListener('ended', () => {
      setPlayState('idle')
    })

    audio.addEventListener('error', (e) => {
      console.error('Audio error:', audioUrl, e)
      setPlayState('error')
    })

    audio.play().catch((err) => {
      console.error('Audio play failed:', audioUrl, err)
      setPlayState('error')
    })
  }, [audioFile, stopCurrent])

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setPlayState('paused')
    }
  }, [])

  const resume = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play()
      setPlayState('playing')
    }
  }, [])

  const changeSpeed = useCallback((newSpeed: number) => {
    setSpeed(newSpeed)
    speedRef.current = newSpeed

    // 直接设置 playbackRate，即时生效
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed
    }
  }, [])

  return {
    playState,
    speed,
    play,
    pause,
    resume,
    changeSpeed,
  }
}
