import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Headphones, RotateCcw, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AIPanel } from '@/components/AIPanel'
import { AnnotatedSentence } from '@/components/AnnotatedSentence'
import { NCEPracticeActions } from '@/components/NCEPracticeActions'
import { FSRSButtons } from '@/components/FSRSButtons'
import { JourneyCompletionDialog } from '@/components/JourneyCompletionDialog'
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
import { StreakBadge } from '@/components/StreakBadge'
import { deleteCard, getCurrentStreak, getLearningVolumeSummary, recordDailyTaskCompletion } from '@/db/crud'
import type { CommitCardRatingResult } from '@/db/reviewRepository'
import { useAudio } from '@/hooks/useAudio'
import { usePro } from '@/hooks/usePro'
import { useTapToFlip } from '@/hooks/useTapToFlip'
import { decodeHtml } from '@/lib/decodeHtml'
import { getTodayDueCards } from '@/lib/fsrs'
import type { CompletionFeedbackKind, JourneyProgress } from '@/lib/hundredDayJourney'
import type { LearningVolumeSummary } from '@/lib/learningStats'
import { bookmarkCardSentence } from '@/lib/notebookBookmark'
import {
  advanceReviewSession,
  createReviewSession,
  isReviewSessionComplete,
  nextDueAt,
  recordScheduledCard,
  removeCardFromReviewSession,
  type ReviewSession,
} from '@/lib/reviewQueue'
import { useSettingsStore } from '@/store/settingsStore'
import type { Card as CardType } from '@/types'

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5]

type CompletionFeedback = {
  progress: JourneyProgress
  feedbackKind: CompletionFeedbackKind
  weeklySummary?: LearningVolumeSummary
}

export default function Review() {
  const navigate = useNavigate()
  const playSpeed = useSettingsStore((s) => s.playSpeed)
  const setPlaySpeed = useSettingsStore((s) => s.setPlaySpeed)
  const { canViewAi, aiRemaining, consumeAi, handleSignIn, isPro } = usePro()

  const [phase, setPhase] = useState<'loading' | 'empty' | 'reviewing' | 'waiting' | 'complete'>('loading')
  const [cards, setCards] = useState<CardType[]>([])
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [initialCardCount, setInitialCardCount] = useState(0)
  const [countdownMs, setCountdownMs] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [aiConsumed, setAiConsumed] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [streak, setStreak] = useState(0)
  const [completionFeedback, setCompletionFeedback] = useState<CompletionFeedback | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CardType | null>(null)

  const flipLockRef = useRef(false)
  const completionRecordedRef = useRef(false)
  const backContentRef = useRef<HTMLDivElement>(null)
  const playBtnRef = useRef<HTMLButtonElement>(null)
  const prefersReducedMotion = useReducedMotion()

  const currentCard = cards.find((card) => card.cardId === session?.ready[0])

  const { playState, speed, play, pause, changeSpeed, playMultiple, isPlaying } = useAudio(
    currentCard?.audioFile || '',
    { defaultSpeed: playSpeed, card: currentCard },
  )

  useEffect(() => {
    const load = async () => {
      try {
        const [dueCards, currentStreak] = await Promise.all([
          getTodayDueCards(undefined, undefined, true),
          getCurrentStreak(),
        ])
        setStreak(currentStreak)
        if (dueCards.length === 0) {
          setPhase('empty')
        } else {
          setCards(dueCards)
          setInitialCardCount(dueCards.length)
          setSession(createReviewSession(dueCards.map((card) => card.cardId)))
          setPhase('reviewing')
        }
      } catch {
        setPhase('empty')
      }
    }
    void load()
  }, [])

  useEffect(() => {
    // 卡片切换时停止旧音频
    pause()
  }, [currentCard?.cardId, pause])

  // 新卡片加载后焦点移到播放按钮
  useEffect(() => {
    if (phase === 'reviewing') {
      setTimeout(() => playBtnRef.current?.focus(), 100)
    }
  }, [currentCard?.cardId, phase])

  // 翻卡后将焦点移到背面内容区
  useEffect(() => {
    if (isFlipped) {
      setTimeout(() => backContentRef.current?.focus(), 100)
    }
  }, [isFlipped])

  useEffect(() => {
    if (!isFlipped || aiConsumed || !currentCard) return
    if (currentCard.aiUnlocked) return
    if (!canViewAi) return
    void consumeAi().then((success) => {
      if (success) setAiConsumed(true)
    })
  }, [aiConsumed, canViewAi, consumeAi, currentCard, isFlipped])

  useEffect(() => {
    if (phase !== 'complete' || initialCardCount === 0 || completionRecordedRef.current) return
    completionRecordedRef.current = true

    const recordCompletion = async () => {
      const result = await recordDailyTaskCompletion()
      if (!result.isNewCompletion) return

      const end = new Date()
      const start = new Date()
      start.setDate(end.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      const weeklySummary = result.feedbackKind === 'weekly'
        ? await getLearningVolumeSummary(start, end)
        : undefined

      setCompletionFeedback({
        progress: result.progress,
        feedbackKind: result.feedbackKind,
        weeklySummary,
      })
    }

    void recordCompletion()
  }, [initialCardCount, phase])

  const handleRated = useCallback((result: CommitCardRatingResult) => {
    if (!currentCard) return
    setIsFlipped(false)
    setAiConsumed(false)
    setReviewedCount((c) => c + 1)
    setCards((current) => current.map((card) => card.cardId === currentCard.cardId
      ? { ...card, fsrsMain: result.fsrsState }
      : card))
    setSession((current) => {
      if (!current) return current
      const next = recordScheduledCard(current, currentCard.cardId, result.fsrsState)
      if (next.ready.length > 0) setPhase('reviewing')
      else if (next.waiting.length > 0) setPhase('waiting')
      else setPhase('complete')
      return next
    })
  }, [currentCard])

  useEffect(() => {
    if (phase !== 'waiting' || !session) return
    const dueAt = nextDueAt(session)
    if (dueAt === undefined) return

    const updateCountdown = () => setCountdownMs(Math.max(0, dueAt - Date.now()))
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1_000)
    const timeout = window.setTimeout(() => {
      setSession((current) => {
        if (!current) return current
        const next = advanceReviewSession(current, new Date())
        setPhase(isReviewSessionComplete(next) ? 'complete' : next.ready.length > 0 ? 'reviewing' : 'waiting')
        return next
      })
    }, Math.max(0, dueAt - Date.now()))

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [phase, session])

  const handleFlip = useCallback(() => {
    if (flipLockRef.current) return
    flipLockRef.current = true
    setIsFlipped((v) => !v)
    setTimeout(() => { flipLockRef.current = false }, 300)
  }, [])

  const cardTap = useTapToFlip({ onTap: handleFlip })

  const getAudioFilesToPlay = useCallback(() => {
    if (!currentCard) return []
    if (currentCard.isMerged && currentCard.mergedAudioFiles?.length) {
      return currentCard.mergedAudioFiles
    }
    return currentCard?.audioFile ? [currentCard.audioFile] : []
  }, [currentCard])

  const handlePlayPause = useCallback((e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.()
    if (isPlaying) { pause(); return }
    const files = getAudioFilesToPlay()
    if (files.length > 1) playMultiple(files)
    else play()
  }, [getAudioFilesToPlay, isPlaying, pause, play, playMultiple])

  const handleChangeSpeed = useCallback((newSpeed: number) => {
    changeSpeed(newSpeed)
    setPlaySpeed(newSpeed)
  }, [changeSpeed, setPlaySpeed])

  const handleBookmarkSentence = useCallback(async (event?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()
    if (!currentCard) return

    try {
      const result = await bookmarkCardSentence(currentCard, isPro)
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
  }, [currentCard, isPro])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return

    try {
      pause()
      await deleteCard(deleteTarget.cardId)
      setCards((current) => current.filter((card) => card.cardId !== deleteTarget.cardId))
      setInitialCardCount((count) => Math.max(0, count - 1))
      setIsFlipped(false)
      setAiConsumed(false)
      setSession((current) => {
        if (!current) return current
        const next = removeCardFromReviewSession(current, deleteTarget.cardId)
        setPhase(isReviewSessionComplete(next) ? 'complete' : next.ready.length > 0 ? 'reviewing' : 'waiting')
        return next
      })
      setDeleteTarget(null)
      toast.success('已删除当前句子')
    } catch {
      toast.error('删除失败')
    }
  }, [deleteTarget, pause])

  // Keyboard: space to play
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || target?.closest('[role="button"]')) return
      if (e.key === ' ') { e.preventDefault(); handlePlayPause() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handlePlayPause])

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="quiet-page flex min-h-dvh flex-col">
        <Skeleton className="mb-4 h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  // ── Empty ──
  if (phase === 'empty') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-4">
        <motion.div
          initial={prefersReducedMotion ? false : { scale: 0 }}
          animate={prefersReducedMotion ? false : { scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 200 }}
          className="text-center"
        >
          <div className="text-6xl">📚</div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">还没有待复习的卡片</h1>
          <p className="mt-2 max-w-xs text-sm text-gray-500">
            先去浏览 CET 或 NCE 的卡片，给它们打分后，这里就会自动出现你的专属复习队列
          </p>
          {streak > 0 && (
            <div className="mt-4 flex justify-center">
              <StreakBadge days={streak} />
            </div>
          )}
          <div className="mt-6 flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>返回首页</Button>
            <Button onClick={() => navigate('/cet')}>去学习新卡片</Button>
          </div>
        </motion.div>
      </div>
    )
  }

  if (phase === 'waiting') {
    const seconds = Math.max(1, Math.ceil(countdownMs / 1_000))
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-4 text-center">
        <div className="text-5xl">⏳</div>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">正在巩固短期记忆</h1>
        <p className="mt-2 text-gray-500">下一张卡片将在约 {seconds} 秒后回来</p>
        <p className="mt-2 max-w-sm text-sm text-gray-400">保持本页打开即可，到期后会自动继续，不需要刷新。</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate('/')}>暂时退出</Button>
      </div>
    )
  }

  // ── Complete ──
  if (phase === 'complete') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-4">
        {completionFeedback && (
          <JourneyCompletionDialog
            open={Boolean(completionFeedback)}
            progress={completionFeedback.progress}
            feedbackKind={completionFeedback.feedbackKind}
            weeklySummary={completionFeedback.weeklySummary}
            onOpenChange={(open) => { if (!open) setCompletionFeedback(null) }}
            onViewStats={() => navigate('/profile/stats')}
          />
        )}
        <motion.div
          initial={prefersReducedMotion ? false : { scale: 0 }}
          animate={prefersReducedMotion ? false : { scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 200 }}
          className="text-center"
        >
          <motion.div
            animate={prefersReducedMotion ? false : { scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, repeat: 2, repeatDelay: 1 }}
          >
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
          </motion.div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">复习完成！</h1>
          <p className="mt-2 text-gray-500">
            本次复习了 <span className="font-bold text-brand">{reviewedCount}</span> 张卡片
          </p>
          {streak > 0 && (
            <div className="mt-4 flex justify-center">
              <StreakBadge days={streak} />
            </div>
          )}
          <Button className="mt-6" onClick={() => navigate('/')}>
            返回首页
          </Button>
        </motion.div>
      </div>
    )
  }

  if (!currentCard) {
    return (
      <div className="flex min-h-dvh flex-col p-4">
        <Skeleton className="mb-4 h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  // ── Reviewing ──
  const progressPct = initialCardCount > 0
    ? Math.min(100, (reviewedCount / initialCardCount) * 100)
    : 0

  return (
    <div className="quiet-page flex min-h-dvh flex-col">
      {/* Top bar */}
      <div className="mb-5 border-b border-[var(--app-line)] pb-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            退出
          </Button>
          <span className="text-sm font-medium text-gray-700">
            复习 · 已完成 {reviewedCount} 次
          </span>
          <Button size="sm" variant="outline" onClick={() => navigate('/walkman')}>
            <Headphones className="mr-1 h-4 w-4" />
            随身听
          </Button>
        </div>
        <Progress value={progressPct} className="mt-2 h-1" aria-label="复习进度" />
      </div>

      {/* Card area */}
      <div className="flex flex-1 justify-center">
        <div className="w-full max-w-4xl">
          <Card
            className="min-h-[620px] w-full cursor-pointer select-none shadow-[var(--app-shadow)]"
            style={{ touchAction: 'pan-y pinch-zoom' }}
            {...cardTap.handlers}
          >
            <CardContent className="p-6 md:p-10">
              {/* Top badges */}
              <div className="mb-4 flex items-center justify-between">
                <Badge variant="outline">
                  队列剩余 {session?.ready.length ?? 0}
                </Badge>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{currentCard.level}</Badge>
                  {currentCard.isMerged && (
                    <Badge variant="secondary">已拼接</Badge>
                  )}
                  <Badge
                    variant={
                      currentCard.difficulty === 'basic' ? 'basic'
                      : currentCard.difficulty === 'medium' ? 'medium'
                      : currentCard.difficulty === 'hard' ? 'hard'
                      : 'advanced'
                    }
                  >
                    {currentCard.difficulty}
                  </Badge>
                </div>
              </div>

              {!isFlipped ? (
                /* Front — audio controls */
                <div className="flex flex-col items-center py-3">
                  <button
                    ref={playBtnRef}
                    type="button"
                    aria-label={playState === 'playing' ? '暂停音频' : '播放音频'}
                    className={`flex h-22 w-22 items-center justify-center rounded-full border-2 bg-white shadow-md transition-all duration-100 active:scale-95 ${
                      playState === 'playing' ? 'border-brand shadow-lg' : 'border-gray-200 hover:border-brand hover:shadow-lg'
                    } ${playState === 'loading' ? 'opacity-70' : ''}`}
                    onPointerDown={(e) => handlePlayPause(e)}
                    disabled={playState === 'loading'}
                    style={{ touchAction: 'manipulation' }}
                  >
                    {playState === 'loading' ? (
                      <RotateCcw className="h-8 w-8 animate-spin text-gray-400" />
                    ) : playState === 'playing' ? (
                      <div className="flex gap-1.5">
                        <div className="h-6 w-2 animate-pulse rounded bg-brand" />
                        <div className="h-6 w-2 animate-pulse rounded bg-brand" />
                      </div>
                    ) : (
                      <div className="ml-1 h-0 w-0 border-b-[12px] border-l-[20px] border-r-0 border-t-[12px] border-b-transparent border-l-brand border-t-transparent" />
                    )}
                  </button>

                  <div className="mt-4 flex items-center gap-3">
                    {SPEED_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={speed === opt}
                        aria-label={`播放速度 ${opt} 倍`}
                        className={`flex h-11 min-w-[48px] items-center justify-center rounded-lg px-3 text-sm font-medium transition-all duration-100 active:scale-95 ${
                          speed === opt
                            ? 'bg-brand text-white shadow-md'
                            : 'border-2 border-gray-200 bg-white text-gray-700 active:bg-gray-50'
                        }`}
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handleChangeSpeed(opt) }}
                        style={{ touchAction: 'manipulation' }}
                      >
                        {opt}x
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="mt-6 flex h-12 items-center justify-center rounded-lg border-2 border-gray-200 bg-white px-8 text-base font-medium text-gray-700 shadow-sm transition-all duration-100 active:scale-95 active:bg-gray-50 hover:shadow-md"
                    onClick={(e) => { e.stopPropagation(); handleFlip() }}
                    style={{ touchAction: 'manipulation' }}
                  >
                    显示答案
                  </button>

                  <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-3">
                    <Button variant="outline" onClick={(event) => void handleBookmarkSentence(event)}>
                      <Star className="mr-2 h-4 w-4" />
                      收藏句子
                    </Button>
                    <Button variant="outline" className="text-red-500 hover:text-red-600" onClick={(event) => {
                      event.stopPropagation()
                      setDeleteTarget(currentCard)
                    }}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除句子
                    </Button>
                  </div>
                </div>
              ) : (
                /* Back — content + FSRS */
                <div ref={backContentRef} tabIndex={-1} role="status" aria-live="polite" className="flex flex-col gap-4 outline-none">
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">English</p>
                    <AnnotatedSentence
                      text={decodeHtml(currentCard.englishText)}
                      analysis={currentCard.aiAnalysis}
                      unlocked={canViewAi || Boolean(currentCard.aiUnlocked)}
                    />
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">中文</p>
                    <p className="text-sm text-gray-600">
                      {decodeHtml(currentCard.chineseText)}
                    </p>
                  </div>

                  <AIPanel
                    analysis={currentCard.aiAnalysis}
                    aiRemaining={aiRemaining}
                    isLocked={!canViewAi && !currentCard.aiUnlocked}
                    onBookmarkPhrase={() => {}}
                    onSignIn={async () => {
                      const result = await handleSignIn()
                      if (result.success) toast.success(result.message)
                      else toast.info(result.message)
                    }}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      className="w-full"
                      size="sm"
                      variant="outline"
                      onClick={(event) => void handleBookmarkSentence(event)}
                    >
                      <Star className="mr-2 h-4 w-4" />
                      收藏句子
                    </Button>
                    <Button
                      className="w-full text-red-500 hover:text-red-600"
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeleteTarget(currentCard)
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除句子
                    </Button>
                  </div>

                  <div className="pb-safe pt-2">
                    <FSRSButtons
                      key={currentCard.cardId}
                      cardId={currentCard.cardId}
                      fsrsState={currentCard.fsrsMain}
                      onRateStart={cardTap.suppressTap}
                      onRated={handleRated}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <NCEPracticeActions card={currentCard} />
          <div className="mt-4 flex justify-center pb-safe text-xs text-gray-400">
            <span>空格：播放</span>
          </div>
        </div>
      </div>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这句吗？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，这张卡片会从本地题库和当前复习队列中移除。这个操作不可恢复。
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
