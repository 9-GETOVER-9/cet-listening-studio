import { useCallback, useEffect, useRef, useState } from 'react'
import { useMemo } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Layers, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { CommitCardRatingResult } from '@/db/reviewRepository'
import { AIPanel } from '@/components/AIPanel'
import { AnnotatedSentence } from '@/components/AnnotatedSentence'
import { NCEPracticeActions } from '@/components/NCEPracticeActions'
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
import { useSettingsStore } from '@/store/settingsStore'
import type { Card as CardType, NotebookType } from '@/types'

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5]

function encourageText(index: number, total: number): string {
  const ratio = index / Math.max(total - 1, 1)
  if (index === 0) return '\u{1F331} 万事开头难，坚持就是胜利！'
  if (index === total - 1) return '\u{1F389} 最后一张了，太棒了！'
  if (ratio < 0.25) return '\u{1F4AA} 好的开始是成功的一半！'
  if (ratio < 0.5) return '\u{1F525} 继续保持，你已经渐入佳境了！'
  if (ratio < 0.75) return '⚡ 过半了，你的努力看得见！'
  return '\u{1F31F} 快完成了，再加把劲！'
}

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

  const handleCardKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (mergeSheetOpen) return
    if (event.key !== 'Enter' && event.key !== ' ') return

    const target = event.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('[data-interactive]')) {
      return
    }

    event.preventDefault()
    handleFlip()
  }, [handleFlip, mergeSheetOpen])

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
      const tagName = target?.tagName ?? ''
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'BUTTON' || target?.closest('[role="button"]')) return

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
    <div className="quiet-page flex min-h-dvh flex-col">
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
        <span className="text-sm font-medium text-gray-700">
          {isNotebookReview
            ? `难点复习 ${notebookIndex + 1}/${notebookQueue.length}`
            : currentCard.level === 'NCE'
              ? `${currentCard.book || 'NCE'} · Lesson ${currentCard.lessonNum || ''}`
              : currentCard.title || moduleId}
        </span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="上一张卡片" onClick={goPrev} disabled={currentIndex === 0 || isNotebookReview}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" aria-label="下一张卡片" onClick={() => void goNext()} disabled={isNotebookReview}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="删除当前卡片" className="text-red-400 hover:text-red-600" onClick={() => void handleDeleteCard()}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 justify-center">
        <div className="w-full max-w-4xl">
          <Card
            className="min-h-[620px] w-full cursor-pointer select-none shadow-[var(--app-shadow)]"
            role="button"
            tabIndex={0}
            aria-pressed={isFlipped}
            aria-label={isFlipped ? '当前显示答案，按回车或空格可翻回题面' : '当前显示题面，按回车或空格可显示答案'}
            style={{ touchAction: 'pan-y pinch-zoom' }}
            {...cardTap.handlers}
            onKeyDown={handleCardKeyDown}
          >
            <CardContent className="p-6 md:p-10">
              <div className="mb-4 flex items-center justify-between">
                <Badge variant="outline">{currentIndex + 1} / {cards.length}</Badge>
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
                    {currentCard.difficulty}
                  </Badge>
                </div>
              </div>

              {!isFlipped ? (
                <div className="flex flex-col items-center py-3">
                  <button
                    type="button"
                    className={`flex h-22 w-22 items-center justify-center rounded-full border-2 bg-white shadow-md transition-all duration-100 active:scale-95 ${playState === 'playing' ? 'border-brand shadow-lg' : 'border-gray-200 hover:border-brand hover:shadow-lg'} ${playState === 'loading' ? 'opacity-70' : ''}`}
                    aria-label={playState === 'loading' ? '正在加载音频' : isPlaying ? '暂停音频' : playState === 'error' ? '重试播放音频' : '播放音频'}
                    aria-pressed={isPlaying}
                    onClick={(event) => handlePlayPause(event)}
                    disabled={playState === 'loading'}
                    style={{ touchAction: 'manipulation' }}
                  >
                    {playState === 'loading' ? (
                      <RotateCcw className="h-8 w-8 animate-spin text-gray-400" />
                    ) : playState === 'playing' ? (
                      <div className="flex gap-1.5"><div className="h-6 w-2 animate-pulse rounded bg-brand" /><div className="h-6 w-2 animate-pulse rounded bg-brand" /></div>
                    ) : playState === 'error' ? (
                      <div className="text-xs text-red-500">加载失败</div>
                    ) : (
                      <div className="ml-1 h-0 w-0 border-b-[12px] border-l-[20px] border-r-0 border-t-[12px] border-b-transparent border-l-brand border-t-transparent" />
                    )}
                  </button>

                  <div className="mt-4 flex items-center gap-3" role="group" aria-label="播放速度">
                    {SPEED_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`flex h-11 min-w-[48px] items-center justify-center rounded-lg px-3 text-sm font-medium transition-all duration-100 active:scale-95 ${speed === option ? 'bg-brand text-white shadow-md' : 'border-2 border-gray-200 bg-white text-gray-700 active:bg-gray-50'}`}
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
                    className="mt-6 flex h-12 items-center justify-center rounded-lg border-2 border-gray-200 bg-white px-8 text-base font-medium text-gray-700 shadow-sm transition-all duration-100 active:scale-95 active:bg-gray-50 hover:shadow-md"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleFlip()
                    }}
                    style={{ touchAction: 'manipulation' }}
                  >
                    显示答案
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
                    <Button className="mt-4 text-gray-400" disabled size="sm" variant="ghost"><Layers className="mr-1 h-4 w-4" />解锁句子拼接功能</Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">English</p>
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
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">中文</p>
                    <p className="text-sm text-gray-600">{decodeHtml(currentCard.chineseText)}</p>
                  </div>
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
                  />
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
                  <div className="pb-safe pt-2">
                    <p className="mb-2 text-xs text-gray-500">{encourageText(currentIndex, cards.length)}</p>
                    <FSRSButtons
                      key={currentCard.cardId}
                      cardId={currentCard.cardId}
                      fsrsState={currentCard.fsrsMain}
                      onRateStart={cardTap.suppressTap}
                      onRated={handleRated}
                    />
                    <p className="mt-2 text-center text-xs text-gray-400">所选间隔会决定这张卡何时进入综合复习队列</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <NCEPracticeActions card={currentCard} />
          <div className="mt-4 flex justify-center gap-4 pb-safe text-xs text-gray-400"><span>空格：播放</span><span>左右方向键：切换</span></div>
        </div>
      </div>
    </div>
  )
}
