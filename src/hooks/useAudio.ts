import { useState, useRef, useCallback, useEffect } from 'react'

import { applyAudioSpeed } from '@/lib/audioSpeed'
import { AudioTimeTracker, getListeningOwner } from '@/lib/audioTimeTracker'
import { getListeningCategory } from '@/lib/listeningTime'
import type { Card } from '@/types'

export type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface UseAudioReturn {
  playState: PlayState
  speed: number
  play: () => void
  pause: () => void
  resume: () => void
  changeSpeed: (speed: number) => void
  playMultiple: (audioFiles: string[]) => void
  isPlaying: boolean
}

function getAudioUrl(audioFile: string): string {
  return `/data/audio/${audioFile}`
}

export { applyAudioSpeed }

export function useAudio(
  audioFile: string,
  options: { defaultSpeed?: number; card?: Pick<Card, 'cardId' | 'level' | 'book'> } = {}
): UseAudioReturn {
  const { defaultSpeed = 1.0 } = options

  const [playState, setPlayState] = useState<PlayState>('idle')
  const [speedOverride, setSpeedOverride] = useState<number | null>(null)
  const speed = speedOverride ?? defaultSpeed
  const speedRef = useRef(speed)

  const currentTokenRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const trackerRef = useRef<AudioTimeTracker | null>(null)
  const category = options.card ? getListeningCategory(options.card) : null

  useEffect(() => { trackerRef.current?.setCategory(category) }, [category])
  useEffect(() => () => {
    currentTokenRef.current += 1
    cancelRef.current?.()
    audioRef.current?.pause()
    trackerRef.current?.checkpoint()
    setPlayState('idle')
  }, [audioFile, options.card?.cardId])

  useEffect(() => {
    speedRef.current = speed
    if (audioRef.current) {
      applyAudioSpeed(audioRef.current, speed)
    }
  }, [speed])

  // 仅在组件卸载时销毁 Audio 元素。
  // audioFile 变化时的播放切换由 currentTokenRef 令牌机制处理（play() → stopAndGetToken() 递增令牌使旧播放作废）。
  // Audio 元素必须跨 audioFile 复用以保持浏览器 autoplay policy 授予的播放权限，因此不将 audioFile 加入依赖数组。
  useEffect(() => {
    return () => {
      currentTokenRef.current += 1
      cancelRef.current?.()
      trackerRef.current?.dispose()
      trackerRef.current = null
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  const stopAndGetToken = useCallback((): number => {
    currentTokenRef.current += 1
    cancelRef.current?.()
    if (audioRef.current) {
      audioRef.current.pause()
      // 不销毁 audio 元素，复用它以保持浏览器的播放权限
    }
    return currentTokenRef.current
  }, [])

  /**
   * 获取或创建一个可复用的 Audio 元素。
   * 复用同一个元素可以避免浏览器 autoplay policy 拦截后续播放。
   * 用户首次交互时创建的 Audio 元素会被浏览器"解锁"，
   * 后续切换 src 可沿用该元素；若浏览器仍拒绝播放，则显示错误并由用户点击重试。
   */
  const getOrCreateAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current
    const audio = new Audio()
    audioRef.current = audio
    trackerRef.current = new AudioTimeTracker(audio, { owner: getListeningOwner(), category })
    return audio
  }, [category])

  /**
   * 用复用的 Audio 元素播放单个音频文件。
   * 通过切换 src 而非创建新 Audio 来规避 autoplay 限制。
   */
  const playOne = useCallback((audioFileName: string, token: number): Promise<void> => {
    if (currentTokenRef.current !== token) {
      return Promise.reject(new Error('cancelled'))
    }

    const audioUrl = getAudioUrl(audioFileName)
    const audio = getOrCreateAudio()
    applyAudioSpeed(audio, speedRef.current)

    return new Promise<void>((resolve, reject) => {
      if (currentTokenRef.current !== token) {
        reject(new Error('cancelled'))
        return
      }

      const clearWatch = () => clearTimeout(timeoutRef.current)
      const watch = () => {
        clearWatch()
        timeoutRef.current = setTimeout(() => {
          fail(new Error('Audio playback timed out'))
        }, 15000)
      }
      const onPlaying = () => {
        if (currentTokenRef.current !== token) return
        clearWatch()
        applyAudioSpeed(audio, speedRef.current)
        setPlayState('playing')
      }
      const onWaiting = () => {
        if (currentTokenRef.current !== token) return
        setPlayState('loading')
        watch()
      }
      const onPause = () => {
        if (currentTokenRef.current !== token || !audio.paused || audio.ended) return
        clearWatch()
        setPlayState('paused')
      }
      const onEnded = () => { if (currentTokenRef.current !== token) return; cleanup(); resolve() }
      const onError = () => fail(new Error(`Audio load failed: ${audioUrl}`))
      const fail = (err: unknown) => {
        if (currentTokenRef.current !== token) return
        cleanup()
        audio.pause()
        reject(err)
      }
      const cancel = () => { cleanup(); reject(new Error('cancelled')) }
      const cleanup = () => {
        clearWatch()
        audio.removeEventListener('playing', onPlaying)
        audio.removeEventListener('waiting', onWaiting)
        audio.removeEventListener('pause', onPause)
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        if (cancelRef.current === cancel) cancelRef.current = null
      }
      cancelRef.current = cancel
      audio.addEventListener('playing', onPlaying)
      audio.addEventListener('waiting', onWaiting)
      audio.addEventListener('pause', onPause)
      audio.addEventListener('ended', onEnded)
      audio.addEventListener('error', onError)
      audio.src = audioUrl
      audio.load()
      watch()
      // Call synchronously inside the user's click, preserving mobile activation.
      try { void audio.play().catch(fail) } catch (err) { fail(err) }

    })
  }, [getOrCreateAudio])

  const play = useCallback(() => {
    if (!audioFile) {
      setPlayState('error')
      return
    }
    const token = stopAndGetToken()
    setPlayState('loading')

    playOne(audioFile, token)
      .then(() => {
        if (currentTokenRef.current !== token) return
        setPlayState('idle')
      })
      .catch((err) => {
        if (currentTokenRef.current !== token) return
        if (err?.message === 'cancelled') return
        setPlayState('error')
      })
  }, [audioFile, stopAndGetToken, playOne])

  const playMultiple = useCallback((audioFiles: string[]) => {
    if (audioFiles.length === 0) {
      setPlayState('idle')
      return
    }

    const token = stopAndGetToken()
    setPlayState('loading')

    const playNext = async (index: number): Promise<void> => {
      if (currentTokenRef.current !== token) return
      if (index >= audioFiles.length) {
        setPlayState('idle')
        return
      }

      try {
        await playOne(audioFiles[index], token)
        if (currentTokenRef.current !== token) return
        await new Promise(resolve => setTimeout(resolve, 50))
        if (currentTokenRef.current !== token) return
        await playNext(index + 1)
      } catch (err) {
        if (currentTokenRef.current !== token) return
        if ((err as Error)?.message === 'cancelled') return
        setPlayState('error')
      }
    }

    playNext(0)
  }, [stopAndGetToken, playOne])

  const pause = useCallback(() => {
    if (audioRef.current) {
      clearTimeout(timeoutRef.current)
      audioRef.current.pause()
      setPlayState('paused')
    }
  }, [])

  const resume = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const token = currentTokenRef.current
    applyAudioSpeed(audio, speedRef.current)
    setPlayState('loading')
    const failed = () => {
      if (currentTokenRef.current !== token) return
      cancelRef.current?.()
      audio.pause()
      setPlayState('error')
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(failed, 15000)
    try { void audio.play().catch(failed) } catch { failed() }
  }, [])

  const changeSpeed = useCallback((newSpeed: number) => {
    setSpeedOverride(newSpeed)
    speedRef.current = newSpeed
    if (audioRef.current) {
      applyAudioSpeed(audioRef.current, newSpeed)
    }
  }, [])

  const isPlaying = playState === 'playing'

  return { playState, speed, play, pause, resume, changeSpeed, playMultiple, isPlaying }
}
