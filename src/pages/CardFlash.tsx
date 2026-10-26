import { useCallback, useEffect, useRef, useState } from 'react'
import { useMemo } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Eye, Layers, MoreHorizontal, Pause, Play, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { CommitCardRatingResult } from '@/db/reviewRepository'
import { AIPanel } from '@/components/AIPanel'
import { AnnotatedSentence } from '@/components/AnnotatedSentence'
import { NCEPracticeActions } from '@/components/NCEPracticeActions'
import { PracticeAudioBar } from '@/components/PracticeAudioBar'
import { difficultyLabel, listeningTitle } from '@/lib/coursePresentation'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FSRSButtons } from '@/components/FSRSButtons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { addNotebookItem, deleteCard, getModuleCards, mergeCards } from '@/db/crud'
import { db } from '@/db/schema'
import { useAudio } from '@/hooks/useAudio'
import { usePro } from '@/hooks/usePro'
import { useTapToFlip } from '@/hooks/useTapToFlip'
import { getInitPromise } from '@/lib/dataLoader'
import { decodeHtml } from '@/lib/decodeHtml'
import { saveLearningResume, useAccountSyncStatus } from '@/lib/accountSync'
import { useSettingsStore } from '@/store/settingsStore'
import type { Card as CardType, NotebookType } from '@/types'

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5]

export default function CardFlash() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const playSpeed = useSettingsStore((state) => state.playSpeed)
  const setPlaySpeed = useSettingsStore((state) => state.setPlaySpeed)

  const [cards, setCards] = useState<CardType[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(() => {
    const value = Number.parseInt(searchParams.get('index') || '0', 10)
    return Number.isNaN(value) || value < 0 ? 0 : value
  })
  const [isFlipped, setIsFlipped] = useState(false)
  const [aiConsumed, setAiConsumed] = useState(false)
  const [mergeSheetOpen, setMergeSheetOpen] = useState(false)
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
  const [merging, setMerging] = useState(false)
  const [adjacentCards, setAdjacentCards] = useState<{
    prev: CardType | null
    next: CardType | null
    nextNext: CardType | null
  }>({ prev: null, next: null, nextNext: null })

  const isNavigatingRef = useRef(false)
  const flipLockRef = useRef(false)
  const mergeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const backActionLockUntilRef = useRef(0)
  const mergeActionLockUntilRef = useRef(0)

  const notebookState = (location.state ?? {}) as {
    notebookQueue?: { notebookId: string; cardId: string; moduleId: string }[]
    currentIndex?: number
  }
  const notebookQueue = useMemo(() => notebookState.notebookQueue ?? [], [notebookState.notebookQueue])
  const notebookIndex = notebookState.currentIndex ?? 0
  const isNotebookReview = notebookQueue.length > 0

  const targetCardId = searchParams.get('targetCardId')
  const indexFromQuery = searchParams.get('index')

  useEffect(() => {
    if (!moduleId) return

    const loadCards = async () => {
      setLoading(true)
      try {
        const decodedModuleId = decodeURIComponent(moduleId)
        let moduleCards = await getModuleCards(decodedModuleId)
        if (moduleCards.length === 0) {
          // Import can finish between the first query and checking its ready flag.
          // Always re-read after the pending import before declaring a module empty.
          await getInitPromise()
          moduleCards = await getModuleCards(decodedModuleId)
        }

        setCards(moduleCards)
        setCurrentIndex(0)

        if (targetCardId) {
          const targetIndex = moduleCards.findIndex((card) => card.cardId === targetCardId)
          if (targetIndex >= 0) {
            setCurrentIndex(targetIndex)
            return
          }
        }

        const parsedIndex = Number.parseInt(indexFromQuery || '0', 10)
        if (!Number.isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < moduleCards.length) {
          setCurrentIndex(parsedIndex)
        }
      } finally {
        setLoading(false)
      }
    }

    void loadCards()
  }, [moduleId, targetCardId, indexFromQuery])

  const currentCard = cards[currentIndex]
  const syncOwner = useAccountSyncStatus(s => s.owner)
  useEffect(() => {
    if (!currentCard || !moduleId) return
    const courseLabel = currentCard.level === 'NCE'
      ? `${currentCard.book ?? 'NCE'} · Lesson ${currentCard.lessonNum ?? ''}`
      : `${currentCard.level} · ${currentCard.examDate ?? ''} · ${listeningTitle(currentCard.title ?? '')}`
    void saveLearningResume(syncOwner, `/card/${encodeURIComponent(moduleId)}?targetCardId=${encodeURIComponent(currentCard.cardId)}`, `${courseLabel} · 第 ${currentIndex + 1} / ${cards.length} 句`)
  }, [syncOwner, moduleId, currentCard, currentIndex, cards.length])

  const { playState, speed, play, pause, changeSpeed, playMultiple, isPlaying } = useAudio(
    currentCard?.audioFile || '',
    { defaultSpeed: playSpeed, card: currentCard },
  )

  const { canViewAi, aiRemaining, consumeAi, handleSignIn, isPro } = usePro()

  const getAudioFilesToPlay = useCallback(() => {
    if (!currentCard) return []

    if (currentCard.isMerged) {
      if (currentCard.mergedAudioFiles?.length) return currentCard.mergedAudioFiles
      if (currentCard.mergedFrom?.length) {
        const files = currentCard.mergedFrom
          .map((id) => cards.find((card) => card.cardId === id)?.audioFile)
          .filter((file): file is string => Boolean(file))
        if (files.length) return files
      }
    }

    return currentCard.audioFile ? [currentCard.audioFile] : []
  }, [cards, currentCard])

  useEffect(() => {
    setIsFlipped(false)
    setAiConsumed(false)
  }, [currentCard?.cardId])

  useEffect(() => {
    if (!isFlipped || aiConsumed || !currentCard) return
    if (currentCard.aiUnlocked) {
      setAiConsumed(true)
      return
    }
    if (!canViewAi) return

    void consumeAi().then((success) => {
      if (!success) return
      setAiConsumed(true)
      void db.cards.update(currentCard.cardId, { aiUnlocked: true })
    })
  }, [aiConsumed, canViewAi, consumeAi, currentCard, isFlipped])

  const loadAdjacentCards = useCallback(async () => {
    if (!currentCard || !moduleId) return
    const allCards = await getModuleCards(decodeURIComponent(moduleId))
    const index = allCards.findIndex((card) => card.cardId === currentCard.cardId)

    setAdjacentCards({
      prev: index > 0 ? allCards[index - 1] : null,
      next: index < allCards.length - 1 ? allCards[index + 1] : null,
      nextNext: index < allCards.length - 2 ? allCards[index + 2] : null,
    })
  }, [currentCard, moduleId])

  const handleOpenMerge = useCallback(() => {
    mergeActionLockUntilRef.current = Date.now() + 550
    void loadAdjacentCards()
    setSelectedForMerge(currentCard ? [currentCard.cardId] : [])
    setMergeSheetOpen(true)
  }, [currentCard, loadAdjacentCards])

  const handleCloseMerge = useCallback(() => {
    setMergeSheetOpen(false)
    setSelectedForMerge([])
    requestAnimationFrame(() => {
      mergeTriggerRef.current?.focus()
    })
  }, [])

  const handleMerge = useCallback(async () => {
    if (selectedForMerge.length < 2) {
      toast.error('请至少选择 2 个句子')
      return
    }

    setMerging(true)
    try {
      const newCard = await mergeCards(selectedForMerge)
      const refreshedCards = await getModuleCards(decodeURIComponent(moduleId || ''))
      setCards(refreshedCards)

      const newIndex = refreshedCards.findIndex((card) => card.cardId === newCard.cardId)
      if (newIndex >= 0) setCurrentIndex(newIndex)

      handleCloseMerge()
      setIsFlipped(false)
      toast.success('拼接成功')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '拼接失败')
    } finally {
      setMerging(false)
    }
  }, [handleCloseMerge, moduleId, selectedForMerge])

  const handleDeleteCard = useCallback(async () => {
    if (!currentCard) return
    const confirmed = window.confirm('确定要删除这张卡片吗？此操作不可恢复。')
    if (!confirmed) return

    try {
      await deleteCard(currentCard.cardId)
      const refreshedCards = await getModuleCards(decodeURIComponent(moduleId || ''))
      setCards(refreshedCards)
      if (currentIndex >= refreshedCards.length) {
        setCurrentIndex(Math.max(0, refreshedCards.length - 1))
      }
      toast.success('卡片已删除')
    } catch {
      toast.error('删除失败')
    }
  }, [currentCard, currentIndex, moduleId])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((index) => index - 1)
  }, [currentIndex])

  const goNext = useCallback(async () => {
    if (isNavigatingRef.current) return
    isNavigatingRef.current = true

    // 立刻同步重置翻卡状态，不等 useEffect
    setIsFlipped(false)
    setAiConsumed(false)

    try {
      if (isNotebookReview) {
        const nextIndex = notebookIndex + 1
        if (nextIndex < notebookQueue.length) {
          const next = notebookQueue[nextIndex]
          navigate(`/card/${encodeURIComponent(next.moduleId)}`, {
            state: { notebookQueue, currentIndex: nextIndex },
          })
        } else {
          toast.success('难点本复习完成')
          navigate('/notebook')
        }
        return
      }

      const refreshedCards = await getModuleCards(decodeURIComponent(moduleId || ''))
      const freshIndex = refreshedCards.findIndex((card) => card.cardId === currentCard?.cardId)

      if (freshIndex >= 0 && freshIndex < refreshedCards.length - 1) {
        if (refreshedCards.length !== cards.length) setCards(refreshedCards)
        setCurrentIndex(freshIndex + 1)
        return
      }

      if (freshIndex === refreshedCards.length - 1) {
        const isSequentialEnd = currentIndex === cards.length - 1
        if (isSequentialEnd) {
          navigate(currentCard?.level === 'NCE' ? '/nce' : '/cet')
        } else {
          setCards(refreshedCards)
          setCurrentIndex(Math.min(currentIndex, Math.max(0, refreshedCards.length - 1)))
        }
        return
      }

      setCards(refreshedCards)
      setCurrentIndex(Math.min(currentIndex, Math.max(0, refreshedCards.length - 1)))
    } finally {
      isNavigatingRef.current = false
    }
  }, [cards.length, currentCard, currentIndex, isNotebookReview, moduleId, navigate, notebookIndex, notebookQueue])

  const handleRated = useCallback((result: CommitCardRatingResult) => {
    setCards((current) => current.map((card) => card.cardId === currentCard?.cardId
      ? { ...card, fsrsMain: result.fsrsState }
      : card))
    void goNext()
  }, [currentCard?.cardId, goNext])

  const handleFlip = useCallback(() => {
    if (mergeSheetOpen) return
    if (flipLockRef.current) return
    flipLockRef.current = true
    setIsFlipped((value) => {
      if (!value) backActionLockUntilRef.current = Date.now() + 650
      return !value
    })
    setTimeout(() => { flipLockRef.current = false }, 300)
  }, [mergeSheetOpen])

  const shouldIgnoreBackAction = useCallback(() => (
    Date.now() < backActionLockUntilRef.current
  ), [])

  const cardTap = useTapToFlip({
    disabled: mergeSheetOpen,
    onTap: handleFlip,
  })

  const toggleMergeSelection = useCallback((cardId: string, wouldExceed: boolean) => {
    if (Date.now() < mergeActionLockUntilRef.current) return
    if (wouldExceed) {
      toast.error('最多只能拼接 4 个原始句子')
      return
    }

    setSelectedForMerge((prev) => (
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId]
    ))
  }, [])

  const handlePlayPause = useCallback((event?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()

    if (isPlaying) {
      pause()
      return
    }

    const audioFiles = getAudioFilesToPlay()
    try {
      if (audioFiles.length > 1) playMultiple(audioFiles)
      else play()
    } catch (error) {
      if (error instanceof Error && error.message === 'MERGE_LIMIT_EXCEEDED') {
        toast('今日拼接次数已用完，明天继续加油！✨', {
          description: 'Pro 会员可无限使用句子拼接功能',
        })
      }
    }
  }, [getAudioFilesToPlay, isPlaying, pause, play, playMultiple])

  const handleChangeSpeed = useCallback((newSpeed: number) => {
    changeSpeed(newSpeed)
    setPlaySpeed(newSpeed)
  }, [changeSpeed, setPlaySpeed])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('button, input, textarea, select, summary, a, [contenteditable], [role="button"], [role="menuitem"]')) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          goPrev()
          break
        case 'ArrowRight':
          event.preventDefault()
          void goNext()
          break
        case ' ':
          event.preventDefault()
          handlePlayPause(event)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev, handlePlayPause])

  const handleBookmark = async (type: NotebookType, content: string) => {
    if (!currentCard) return

    try {
      const sourceTag = currentCard.level === 'NCE'
        ? `NCE ${currentCard.book || ''} Lesson ${currentCard.lessonNum || ''}`.trim()
        : `${currentCard.examDate || ''} ${currentCard.title || ''}`.trim()

      await addNotebookItem({
        type,
        content,
        exampleSentence: currentCard.englishText,
        sourceCardId: currentCard.cardId,
        sourceTag,
      }, isPro)

      const labels: Record<NotebookType, string> = {
        phrase: '短语',
        vocabulary: '词汇',
        pronunciation: '发音',
        terminology: '术语',
      }
      toast.success(`已收藏到${labels[type]}`)
    } catch (error) {
      if (error instanceof Error && error.message === 'NOTEBOOK_LIMIT_EXCEEDED') {
        toast('今日收藏已达上限，明天继续积累！\u{1F4DD}', {
          description: 'Pro 会员可无限收藏难点',
        })
      } else {
        toast.error('收藏失败')
      }
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col p-4">
        <Skeleton className="mb-4 h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (!currentCard) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-4">
        <p className="text-gray-500">没有找到该模块的卡片</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/cet')}>
          返回选择页
        </Button>
      </div>
    )
  }

  const currentMergedCount = currentCard.isMerged ? (currentCard.mergedFrom?.length ?? 1) : 1
  const nextMergedCount = adjacentCards.next?.isMerged ? (adjacentCards.next.mergedFrom?.length ?? 1) : 1
  const nextNextMergedCount = adjacentCards.nextNext?.isMerged ? (adjacentCards.nextNext.mergedFrom?.length ?? 1) : 1

  const selectedSentenceCount = selectedForMerge.reduce((count, id) => {
    if (id === currentCard.cardId) return count + currentMergedCount
    if (id === adjacentCards.next?.cardId) return count + nextMergedCount
    if (id === adjacentCards.nextNext?.cardId) return count + nextNextMergedCount
    return count + 1
  }, 0)

  return (
    <div data-practice className="quiet-page practice-page flex min-h-dvh flex-col">
      <div className="mb-5 flex items-center justify-between border-b border-[var(--app-line)] pb-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (isNotebookReview) navigate('/notebook')
            else navigate(currentCard.level === 'NCE' ? '/nce' : '/cet')
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <h1 className="min-w-0 flex-1 px-2 text-center text-xs font-medium leading-5 text-[var(--app-ink)] sm:text-sm">
          {isNotebookReview
            ? `难点复习 ${notebookIndex + 1}/${notebookQueue.length}`
            : currentCard.level === 'NCE'
              ? `${currentCard.book || 'NCE'} · Lesson ${currentCard.lessonNum || ''}`
              : listeningTitle(currentCard.title || moduleId || '')}
        </h1>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="上一张卡片" onClick={goPrev} disabled={currentIndex === 0 || isNotebookReview}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" aria-label="下一张卡片" onClick={() => void goNext()} disabled={isNotebookReview}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="更多卡片操作"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-red-600" onSelect={() => void handleDeleteCard()}><Trash2 className="mr-2 h-4 w-4" />删除当前卡片</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </div>

      <div className="flex flex-1 justify-center">
        <div className="w-full max-w-4xl">
          <div className="mb-3 flex items-center justify-between px-1 text-xs text-[var(--app-muted)]">
            <span>听力精练</span>
            <span>{currentIndex + 1} / {cards.length}</span>
          </div>
          <div className="mb-4 h-1 overflow-hidden rounded-full bg-[var(--app-paper-2)]" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-500 ease-out" style={{ width: `${cards.length ? ((currentIndex + 1) / cards.length) * 100 : 0}%` }} />
          </div>
          <Card
            className="min-h-80 w-full select-none overflow-hidden rounded-[1.5rem] border-[var(--app-line)] bg-white shadow-[var(--app-shadow)] transition-shadow duration-300"
            role="region"
            aria-label={isFlipped ? '卡片答案' : '听力题面'}
            style={{ touchAction: 'pan-y pinch-zoom' }}
            {...cardTap.handlers}
          >
            <CardContent className="p-5 md:p-9">
              <div className="mb-5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">{isFlipped ? 'A closer look' : 'Listen & remember'}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{currentCard.level}</Badge>
                  {currentCard.isMerged && <Badge variant="secondary">已拼接 ({currentCard.mergedLevel}句)</Badge>}
                  <Badge
                    variant={
                      currentCard.difficulty === 'basic'
                        ? 'basic'
                        : currentCard.difficulty === 'medium'
                          ? 'medium'
                          : currentCard.difficulty === 'hard'
                            ? 'hard'
                            : 'advanced'
                    }
                  >
                    {difficultyLabel(currentCard.difficulty)}
                  </Badge>
                </div>
              </div>

              {!isFlipped ? (
                <div key="question" className="practice-face-in flex min-h-[19rem] flex-col items-center justify-center py-5 text-center">
                  <p className="mb-2 text-sm font-medium text-[var(--app-ink)]">先听一遍，试着复述这句话</p>
                  <p className="mb-7 text-xs text-[var(--app-muted)]">准备好后再翻看答案</p>
                  <button
                    type="button"
                    className={`flex h-20 w-20 items-center justify-center rounded-full ring-8 ring-[var(--app-paper)] transition-all duration-300 active:scale-95 ${playState === 'playing' ? 'bg-[var(--app-accent)] text-white shadow-[0_10px_35px_rgba(35,78,104,0.3)]' : 'bg-[var(--app-accent)] text-white shadow-[0_8px_25px_rgba(35,78,104,0.2)] hover:scale-105'} ${playState === 'loading' ? 'opacity-70' : ''}`}
                    aria-label={playState === 'loading' ? '正在加载音频' : isPlaying ? '暂停音频' : playState === 'error' ? '重试播放音频' : '播放音频'}
                    aria-pressed={isPlaying}
                    onClick={(event) => handlePlayPause(event)}
                    disabled={playState === 'loading'}
                    style={{ touchAction: 'manipulation' }}
                  >
                    {playState === 'loading' ? (
                      <RotateCcw className="h-8 w-8 animate-spin text-gray-400" />
                    ) : playState === 'playing' ? (
                      <Pause className="h-8 w-8" aria-hidden="true" />
                    ) : playState === 'error' ? (
                      <div className="text-xs text-red-500">加载失败</div>
                    ) : (
                      <Play className="ml-1 h-8 w-8 fill-current" aria-hidden="true" />
                    )}
                  </button>

                  <div className="mt-6 flex items-center gap-1 rounded-full bg-[var(--app-paper)] p-1" role="group" aria-label="播放速度">
                    {SPEED_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`flex h-9 min-w-[46px] items-center justify-center rounded-full px-3 text-xs font-medium transition-all duration-200 active:scale-95 ${speed === option ? 'bg-white text-[var(--app-accent)] shadow-sm' : 'text-[var(--app-muted)] hover:text-[var(--app-ink)]'}`}
                        aria-pressed={speed === option}
                        onClick={(event) => {
                          event.stopPropagation()
                          event.preventDefault()
                          handleChangeSpeed(option)
                        }}
                        style={{ touchAction: 'manipulation' }}
                      >
                        {option}x
                      </button>
                    ))}
                  </div>

                  {playState === 'loading' && <p className="mt-2 text-xs text-blue-500">正在加载音频...</p>}
                  {playState === 'paused' && <p className="mt-2 text-xs text-amber-500">已暂停</p>}
                  {playState === 'error' && <p className="mt-2 text-xs text-red-500">音频加载失败</p>}

                  <button
                    type="button"
                    className="mt-8 flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--app-accent)] px-7 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(35,78,104,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(35,78,104,0.24)] active:scale-[0.98]"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleFlip()
                    }}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />查看答案<ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  {isPro ? (
                    <Sheet
                      open={mergeSheetOpen}
                      onOpenChange={(open) => {
                        if (open) {
                          setMergeSheetOpen(true)
                        } else {
                          handleCloseMerge()
                        }
                      }}
                    >
                      <SheetTrigger asChild>
                        <button
                          ref={mergeTriggerRef}
                          type="button"
                          className="mt-4 flex h-11 items-center gap-1.5 rounded-xl bg-transparent px-4 text-sm font-medium text-gray-600 transition-all duration-100 active:scale-95 active:bg-gray-100"
                          onClick={(event) => {
                            event.stopPropagation()
                            event.preventDefault()
                            handleOpenMerge()
                          }}
                          style={{ touchAction: 'manipulation' }}
                        >
                          <Layers className="h-4 w-4" />
                          拼接句子
                        </button>
                      </SheetTrigger>
                      <SheetContent
                        side="bottom"
                        hideCloseButton
                        onEscapeKeyDown={(event) => event.preventDefault()}
                        onPointerDownOutside={(event) => event.preventDefault()}
                        onInteractOutside={(event) => event.preventDefault()}
                        className="h-[85dvh] max-h-[85dvh] overflow-hidden rounded-t-2xl border-0 bg-white p-0 sm:mx-auto sm:h-auto sm:max-h-[80vh] sm:max-w-2xl"
                      >
                        <div className="flex h-full flex-col">
                          <div className="border-b bg-white px-4 pb-3 pt-4">
                            <div className="flex items-start justify-between gap-3">
                              <SheetHeader className="space-y-1 text-left">
                                <SheetTitle>选择要拼接的句子，最多 4 句</SheetTitle>
                                <SheetDescription>
                                  当前已选 {selectedSentenceCount}/4 句。只有点右上角关闭或底部取消才会退出。
                                </SheetDescription>
                              </SheetHeader>
                              <SheetClose asChild>
                                <button
                                  type="button"
                                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                                >
                                  <X className="h-5 w-5" />
                                  <span className="sr-only">关闭拼接面板</span>
                                </button>
                              </SheetClose>
                            </div>
                          </div>

                          <div className="flex-1 overflow-hidden px-4 py-4">
                            <div className="h-full overflow-y-auto">
                              <div className="space-y-3 pb-4">
                              {[
                                { card: currentCard, label: '当前卡片', sentenceCount: currentMergedCount },
                                { card: adjacentCards.next, label: '下一句', sentenceCount: nextMergedCount },
                                { card: adjacentCards.nextNext, label: '下下一句', sentenceCount: nextNextMergedCount },
                              ].map(({ card, label, sentenceCount }) => {
                                if (!card) return null
                                const isSelected = selectedForMerge.includes(card.cardId)
                                const wouldExceed = !isSelected && selectedSentenceCount + sentenceCount > 4
                                return (
                                  <button
                                    key={card.cardId}
                                    type="button"
                                    disabled={wouldExceed}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      toggleMergeSelection(card.cardId, wouldExceed)
                                    }}
                                    className={`relative w-full rounded-xl border-2 p-3 text-left transition-colors ${wouldExceed ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50' : isSelected ? 'border-brand bg-blue-50' : 'border-gray-200 active:bg-gray-50'}`}
                                  >
                                    {/* 右上角选中标记 */}
                                    <div className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full transition-all ${isSelected ? 'bg-brand text-white' : 'border-2 border-gray-300 bg-white'}`}>
                                      {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                                    </div>
                                    <div className="pr-7">
                                      <div className="mb-1 flex items-center gap-2">
                                        <Badge className="text-xs" variant="outline">{label}</Badge>
                                        {card.isMerged && <Badge className="text-xs" variant="secondary">含 {sentenceCount} 句</Badge>}
                                      </div>
                                      <p className="text-sm font-medium leading-relaxed text-gray-900">{decodeHtml(card.englishText)}</p>
                                      <p className="mt-1 text-sm leading-relaxed text-gray-500">{decodeHtml(card.chineseText)}</p>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          </div>

                          <div className="border-t bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                            <div className="flex gap-3">
                              <SheetClose asChild>
                                <Button className="flex-1 h-12" variant="outline">取消</Button>
                              </SheetClose>
                              <Button className="flex-1 h-12" disabled={selectedForMerge.length < 2 || merging} onClick={() => void handleMerge()}>
                                {merging ? '拼接中...' : `确认拼接 (${selectedSentenceCount}句)`}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                  ) : (
                    <Button className="mt-4 text-gray-500" onClick={() => navigate('/profile?tab=account')} size="sm" variant="ghost"><Layers className="mr-1 h-4 w-4" />解锁句子拼接功能</Button>
                  )}
                </div>
              ) : (
                <div key="answer" className="practice-face-in flex flex-col gap-5">
                  <div>
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">ENGLISH</p>
                    <AnnotatedSentence
                      text={decodeHtml(currentCard.englishText)}
                      analysis={currentCard.aiAnalysis}
                      unlocked={canViewAi || Boolean(currentCard.aiUnlocked)}
                      onWordClick={(word) => {
                        if (Date.now() < backActionLockUntilRef.current) return
                        void handleBookmark('vocabulary', word)
                      }}
                    />
                  </div>
                  <div className="rounded-2xl bg-[var(--app-paper)] px-4 py-4 md:px-5">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">中文释义</p>
                    <p className="text-[15px] leading-7 text-[var(--app-ink)]">{decodeHtml(currentCard.chineseText)}</p>
                  </div>
                  <details data-interactive className="rounded-xl border border-[var(--app-line)] p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--app-accent)]">查看详细解析</summary><div className="pt-3">
                  <AIPanel
                    analysis={currentCard.aiAnalysis}
                    aiRemaining={aiRemaining}
                    isLocked={!canViewAi && !currentCard.aiUnlocked}
                    shouldIgnoreAction={shouldIgnoreBackAction}
                    onBookmarkPhrase={(phrase, meaning) => { void handleBookmark('phrase', `${phrase} - ${meaning}`) }}
                    onSignIn={async () => {
                      const result = await handleSignIn()
                      if (result.success) toast.success(result.message)
                      else toast.info(result.message)
                    }}
                  /></div></details>
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      if (shouldIgnoreBackAction()) return
                      void handleBookmark('pronunciation', currentCard.englishText)
                    }}
                  >
                    收藏整句发音到难点本
                  </Button>

                </div>
              )}
            </CardContent>
          </Card>
          <NCEPracticeActions card={currentCard} />
          <div className="mt-4 flex justify-center gap-4 pb-safe text-xs text-gray-400"><span>空格：播放</span><span>左右方向键：切换</span></div>
        </div>
      </div>
      {isFlipped && <section className="practice-dock" aria-label="音频与记忆评分"><div className="practice-dock-inner">
        <PracticeAudioBar playing={isPlaying} loading={playState === 'loading'} error={playState === 'error'} speed={speed} onPlay={() => handlePlayPause()} onSpeed={handleChangeSpeed} onFlip={handleFlip} />
        <FSRSButtons key={currentCard.cardId} cardId={currentCard.cardId} fsrsState={currentCard.fsrsMain} onRateStart={cardTap.suppressTap} onRated={handleRated} />
        <p className="mt-2 text-center text-[11px] text-[var(--app-muted)]">根据记忆程度评分，安排下一次复习</p>
      </div></section>}
    </div>
  )
}
