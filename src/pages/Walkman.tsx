import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Headphones, Pause, Play, Star, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { addListeningLog, deleteNotebookItem, getCard, getNotebookByType } from '@/db/crud'
import { usePro } from '@/hooks/usePro'
import { applyAudioSpeed } from '@/lib/audioSpeed'
import { AudioTimeTracker, getListeningOwner } from '@/lib/audioTimeTracker'
import type { ListeningCategory } from '@/lib/listeningTime'
import { getTodayDueCards } from '@/lib/fsrs'
import { decodeHtml } from '@/lib/decodeHtml'
import { bookmarkCardSentence } from '@/lib/notebookBookmark'
import {
  buildNotebookWalkmanTracks,
  buildReviewWalkmanTracks,
  getWrappedWalkmanIndex,
  removeWalkmanTrack,
  type WalkmanTrack,
} from '@/lib/walkmanQueue'

const SPEED_OPTIONS = [0.75, 1, 1.5]
const REPEAT_OPTIONS = [1, 2, 3, 5]

function getAudioUrl(audioFile: string): string {
  return `/data/audio/${audioFile}`
}

export default function Walkman() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isPro } = usePro()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackerRef = useRef<AudioTimeTracker | null>(null)
  const tokenRef = useRef(0)
  const playingRef = useRef(false)
  const speedRef = useRef(1)
  const source = searchParams.get('source') === 'pronunciation' ? 'notebook-pronunciation' : 'review'

  const [tracks, setTracks] = useState<WalkmanTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentRepeat, setCurrentRepeat] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [repeatCount, setRepeatCount] = useState(2)
  const [showTranslation, setShowTranslation] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<WalkmanTrack | null>(null)

  const current = tracks[currentIndex]
  const progressPct = tracks.length > 0 ? ((currentIndex + (isPlaying ? 0.5 : 0)) / tracks.length) * 100 : 0

  useEffect(() => {
    const load = async () => {
      try {
        if (source === 'notebook-pronunciation') {
          const items = await getNotebookByType('pronunciation')
          const cards = await Promise.all(items.map((item) => getCard(item.sourceCardId)))
          const availableCards = cards.filter((card): card is NonNullable<typeof card> => Boolean(card))
          const cardsById = new Map(availableCards.map((card) => [card.cardId, card]))
          setTracks(buildNotebookWalkmanTracks(items, cardsById))
          return
        }

        const dueCards = await getTodayDueCards(undefined, undefined, true)
        setTracks(buildReviewWalkmanTracks(dueCards))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [source])

  useEffect(() => {
    if (!current || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: decodeHtml(current.englishText).slice(0, 80),
      artist: source === 'notebook-pronunciation' ? '发音难点本随身听' : '综合复习随身听',
    })
  }, [current, source])

  const playSegment = useCallback((audioFile: string, token: number, category: ListeningCategory | null): Promise<number> => {
    const audio = audioRef.current
    if (!audio) return Promise.reject(new Error('missing audio element'))
    if (!trackerRef.current) trackerRef.current = new AudioTimeTracker(audio, { owner: getListeningOwner(), category })
    else trackerRef.current.setCategory(category)
    audio.src = getAudioUrl(audioFile)
    applyAudioSpeed(audio, speedRef.current)
    audio.load()
    const startedAt = Date.now()

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        audio.removeEventListener('timeupdate', onTimeUpdate)
      }
      const onTimeUpdate = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setProgress(Math.min(100, (audio.currentTime / audio.duration) * 100))
        }
      }
      const onEnded = () => {
        cleanup()
        if (tokenRef.current !== token) return
        const duration = Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : (Date.now() - startedAt) / 1000
        resolve(Math.max(1, Math.round(duration)))
      }
      const onError = () => {
        cleanup()
        reject(new Error(`Audio load failed: ${audioFile}`))
      }

      audio.addEventListener('ended', onEnded)
      audio.addEventListener('error', onError)
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.play().catch((error) => {
        cleanup()
        reject(error)
      })
    })
  }, [])

  const playFrom = useCallback(async (trackIndex: number, repeatRound = 1, token = tokenRef.current + 1) => {
    if (tracks.length === 0) return

    tokenRef.current = token
    playingRef.current = true
    setIsPlaying(true)

    let startIndex = getWrappedWalkmanIndex(tracks.length, trackIndex)
    let firstRound = repeatRound

    while (playingRef.current && tokenRef.current === token) {
      for (let index = startIndex; index < tracks.length; index += 1) {
        const track = tracks[index]
        if (!track || track.audioFiles.length === 0) continue

        setCurrentIndex(index)
        for (let round = index === startIndex ? firstRound : 1; round <= repeatCount; round += 1) {
          setCurrentRepeat(round)
          for (const audioFile of track.audioFiles) {
            if (!playingRef.current || tokenRef.current !== token) return
            setProgress(0)
            try {
              const durationSeconds = await playSegment(audioFile, token, track.listeningCategory ?? null)
              await addListeningLog({
                cardId: track.cardId,
                sentenceCount: 1,
                durationSeconds,
                timestamp: Date.now(),
              })
            } catch {
              if (tokenRef.current !== token) return
              toast.error('有一句音频播放失败，已跳过')
            }
          }
        }
      }
      startIndex = 0
      firstRound = 1
    }

    if (tokenRef.current === token) {
      playingRef.current = false
      setIsPlaying(false)
      setProgress(0)
    }
  }, [playSegment, tracks, repeatCount])

  const handlePlayPause = () => {
    const audio = audioRef.current
    if (isPlaying) {
      playingRef.current = false
      audio?.pause()
      setIsPlaying(false)
      return
    }

    if (audio?.src && audio.paused && progress > 0) {
      playingRef.current = true
      applyAudioSpeed(audio, speedRef.current)
      audio.play().then(() => {
        applyAudioSpeed(audio, speedRef.current)
        setIsPlaying(true)
      }).catch(() => toast.error('播放被浏览器拦截，请再点一次'))
      return
    }

    void playFrom(currentIndex, currentRepeat)
  }

  const handleChangeSpeed = (newSpeed: number) => {
    speedRef.current = newSpeed
    setSpeed(newSpeed)
    if (audioRef.current) {
      applyAudioSpeed(audioRef.current, newSpeed)
    }
  }

  const jumpTo = (nextIndex: number) => {
    const bounded = getWrappedWalkmanIndex(tracks.length, nextIndex)
    tokenRef.current += 1
    audioRef.current?.pause()
    setCurrentIndex(bounded)
    setCurrentRepeat(1)
    setProgress(0)
    if (isPlaying) void playFrom(bounded, 1)
  }

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', handlePlayPause)
    navigator.mediaSession.setActionHandler('pause', handlePlayPause)
    navigator.mediaSession.setActionHandler('previoustrack', () => jumpTo(currentIndex - 1))
    navigator.mediaSession.setActionHandler('nexttrack', () => jumpTo(currentIndex + 1))
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
  })

  useEffect(() => () => {
    tokenRef.current += 1
    playingRef.current = false
    trackerRef.current?.dispose()
    audioRef.current?.pause()
  }, [])

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return

    tokenRef.current += 1
    playingRef.current = false
    audioRef.current?.pause()
    setIsPlaying(false)
    setProgress(0)

    try {
      if (deleteTarget.source === 'notebook-pronunciation' && deleteTarget.notebookId) {
        await deleteNotebookItem(deleteTarget.notebookId)
      }

      const result = removeWalkmanTrack(tracks, deleteTarget.id, currentIndex)
      setTracks(result.tracks)
      setCurrentIndex(result.nextIndex)
      setCurrentRepeat(1)
      setDeleteTarget(null)
      toast.success(deleteTarget.source === 'notebook-pronunciation' ? '已从发音难点本删除' : '已从本次随身听移除')
    } catch {
      toast.error('删除失败，请稍后重试')
    }
  }

  const handleBookmarkCurrent = async () => {
    if (!current) return

    try {
      const card = await getCard(current.cardId)
      if (!card) {
        toast.error('没有找到原句，收藏失败')
        return
      }

      const result = await bookmarkCardSentence(card, isPro)
      if (result === 'already-exists') {
        toast.info('这句已经收藏过了')
        return
      }
      toast.success('已收藏句子')
    } catch (error) {
      if (error instanceof Error && error.message === 'NOTEBOOK_LIMIT_EXCEEDED') {
        toast('今日收藏已达上限，明天继续积累', {
          description: 'Pro 会员可无限收藏难点',
        })
      } else {
        toast.error('收藏失败')
      }
    }
  }

  if (loading) {
    return (
      <div className="quiet-page space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="quiet-page flex min-h-dvh flex-col items-center justify-center text-center">
        <Headphones className="h-14 w-14 text-gray-300" />
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">
          {source === 'notebook-pronunciation' ? '发音难点本暂无可听内容' : '今天没有可听的复习卡片'}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          {source === 'notebook-pronunciation' ? '收藏整句发音后，可以在这里连续听。' : '随身听使用今日到期复习内容，只辅助听，不会消耗任务。'}
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={() => navigate('/')}>回首页</Button>
          <Button onClick={() => navigate(source === 'notebook-pronunciation' ? '/notebook' : '/review')}>
            {source === 'notebook-pronunciation' ? '回难点本' : '去复习'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="quiet-page flex min-h-dvh flex-col gap-5">
      <audio ref={audioRef} preload="metadata" />
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <Badge variant="outline">
          {source === 'notebook-pronunciation' ? '发音随身听' : '随身听'} · {currentIndex + 1} / {tracks.length}
        </Badge>
      </div>

      <Card className="flex-1">
        <CardContent className="flex min-h-[520px] flex-col p-5">
          <div className="mb-4">
            <p className="quiet-kicker">Today Walkman</p>
            <h1 className="quiet-display mt-2 text-4xl">
              {source === 'notebook-pronunciation' ? '把难发音的句子，多听几遍。' : '今天，把句子放进耳朵里。'}
            </h1>
          </div>

          <div className="flex-1 rounded-lg bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
              <span>第 {currentRepeat} / {repeatCount} 遍</span>
              <span>{current?.sourceLabel}</span>
            </div>
            <p className="text-xl font-semibold leading-9 text-gray-900">
              {decodeHtml(current?.englishText ?? '')}
            </p>
            {showTranslation && (
              <p className="mt-4 text-base leading-7 text-gray-600">
                {decodeHtml(current?.chineseText ?? '')}
              </p>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-xs text-gray-500">
                <span>当前句</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <Progress value={progressPct} className="h-1 bg-gray-100" />

            <div className="grid grid-cols-[48px_1fr_48px] items-center gap-3">
              <Button size="icon" variant="outline" onClick={() => jumpTo(currentIndex - 1)} disabled={tracks.length <= 1}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button className="h-14 text-base" onClick={handlePlayPause}>
                {isPlaying ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
                {isPlaying ? '暂停' : '播放'}
              </Button>
              <Button size="icon" variant="outline" onClick={() => jumpTo(currentIndex + 1)} disabled={tracks.length <= 1}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => void handleBookmarkCurrent()}
              >
                <Star className="mr-2 h-4 w-4" />
                收藏句子
              </Button>
              <Button
                className="w-full text-red-500 hover:text-red-600"
                variant="outline"
                onClick={() => current && setDeleteTarget(current)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除当前句子
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-gray-500">倍速</p>
                <div className="grid grid-cols-3 gap-2">
                  {SPEED_OPTIONS.map((option) => (
                    <Button key={option} size="sm" variant={speed === option ? 'default' : 'outline'} onClick={() => handleChangeSpeed(option)}>
                      {option}x
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs text-gray-500">每句遍数</p>
                <div className="grid grid-cols-4 gap-2">
                  {REPEAT_OPTIONS.map((option) => (
                    <Button key={option} size="sm" variant={repeatCount === option ? 'default' : 'outline'} onClick={() => setRepeatCount(option)}>
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Button variant="ghost" onClick={() => setShowTranslation((value) => !value)}>
              {showTranslation ? '隐藏翻译' : '查看翻译'}
            </Button>
            <p className="text-center text-xs text-gray-400">锁屏播放会尽量支持，实际表现取决于手机系统和浏览器。</p>
          </div>
        </CardContent>
      </Card>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这句吗？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.source === 'notebook-pronunciation'
                ? '这会从发音难点本中删除这条收藏，并从当前随身听队列移除。'
                : '这只会从本次综合复习随身听队列移除，不会删除原始题库卡片。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={() => void handleConfirmDelete()}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
