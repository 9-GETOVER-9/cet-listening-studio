import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AIPanel } from '@/components/AIPanel'
import { FSRSButtons } from '@/components/FSRSButtons'
import { useAudio } from '@/hooks/useAudio'
import { getModuleCards } from '@/db/crud'
import { useSettingsStore } from '@/store/settingsStore'
import { toast } from 'sonner'
import type { Card as CardType, NotebookType } from '@/types'
import { addNotebookItem } from '@/db/crud'

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5]

/**
 * 听力卡片页
 * - 空格：播放音频（不翻转）
 * - 回车：翻转卡片
 * - 左右箭头：切换卡片
 */
export default function CardFlash() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const navigate = useNavigate()
  const playSpeed = useSettingsStore((s) => s.playSpeed)

  const [cards, setCards] = useState<CardType[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)

  // 加载模块卡片
  useEffect(() => {
    if (!moduleId) return
    const loadCards = async () => {
      setLoading(true)
      try {
        const decodedModuleId = decodeURIComponent(moduleId)
        const moduleCards = await getModuleCards(decodedModuleId)
        setCards(moduleCards)
      } finally {
        setLoading(false)
      }
    }
    loadCards()
  }, [moduleId])

  const currentCard = cards[currentIndex]

  const {
    playState,
    speed,
    play,
    changeSpeed,
  } = useAudio(
    currentCard?.audioFile || '',
    { defaultSpeed: playSpeed }
  )

  // 切换卡片时重置翻转
  useEffect(() => {
    setIsFlipped(false)
  }, [currentIndex])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
    }
  }, [currentIndex])

  const goNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      navigate(currentCard?.level === 'NCE' ? '/nce' : '/cet')
    }
  }, [currentIndex, cards.length, navigate, currentCard])

  const handleRated = useCallback(() => {
    goNext()
  }, [goNext])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 输入框内不响应快捷键
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          goNext()
          break
        case ' ':
          e.preventDefault()
          play()
          break
        case 'Enter':
          e.preventDefault()
          setIsFlipped((f) => !f)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrev, goNext, play])

  // 收藏到难点本
  const handleBookmark = async (type: NotebookType, content: string) => {
    if (!currentCard) return
    try {
      // 来源标签：CET 用考试日期，NCE 用课程信息
      const sourceTag = currentCard.level === 'NCE'
        ? `NCE ${currentCard.book} Lesson ${currentCard.lessonNum || ''}`
        : `${currentCard.examDate || ''} ${currentCard.title || ''}`
      await addNotebookItem({
        type,
        content,
        exampleSentence: currentCard.englishText,
        sourceCardId: currentCard.cardId,
        sourceTag: sourceTag.trim(),
      })
      const labels: Record<string, string> = {
        phrase: '短语',
        vocabulary: '词汇',
        pronunciation: '发音',
        terminology: '术语',
      }
      toast.success(`已收藏到「${labels[type] || type}」`)
    } catch {
      toast.error('收藏失败')
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
        <Button variant="outline" onClick={() => navigate('/cet')} className="mt-4">
          返回选择页
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(currentCard?.level === 'NCE' ? '/nce' : '/cet')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <span className="text-sm font-medium text-gray-700">
          {currentCard.level === 'NCE'
            ? `${currentCard.book || 'NCE'} · Lesson ${currentCard.lessonNum || ''}`
            : (currentCard.title || moduleId)}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={goPrev} disabled={currentIndex === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goNext} disabled={currentIndex === cards.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 卡片区域 */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <Card className="w-full">
            <CardContent className="p-6">
              {/* 进度信息 */}
              <div className="mb-4 flex items-center justify-between">
                <Badge variant="outline">{currentIndex + 1} / {cards.length}</Badge>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{currentCard.level}</Badge>
                  <Badge variant={
                    currentCard.difficulty === 'basic' ? 'basic' :
                    currentCard.difficulty === 'medium' ? 'medium' :
                    currentCard.difficulty === 'hard' ? 'hard' : 'advanced'
                  }>
                    {currentCard.difficulty}
                  </Badge>
                </div>
              </div>

              {!isFlipped ? (
                /* ========== 正面：听写模式 ========== */
                <div className="flex flex-col items-center py-6">
                  {/* 播放按钮 */}
                  <button
                    className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-gray-200 bg-white shadow-md transition-all hover:border-brand hover:shadow-lg"
                    onClick={(e) => {
                      e.stopPropagation()
                      play()
                    }}
                  >
                    {playState === 'loading' ? (
                      <RotateCcw className="h-8 w-8 animate-spin text-gray-400" />
                    ) : playState === 'playing' ? (
                      <div className="flex gap-1.5">
                        <div className="h-6 w-2 rounded bg-brand" />
                        <div className="h-6 w-2 rounded bg-brand" />
                      </div>
                    ) : (
                      <div className="ml-1 flex h-0 w-0 items-center border-t-[12px] border-r-0 border-b-[12px] border-l-[20px] border-t-transparent border-b-transparent border-l-brand" />
                    )}
                  </button>

                  {/* 速度控制 */}
                  <div className="mt-4 flex items-center gap-2">
                    {SPEED_OPTIONS.map((s) => (
                      <Button
                        key={s}
                        variant={speed === s ? 'default' : 'outline'}
                        size="sm"
                        className={`h-8 min-w-12 text-xs ${speed === s ? 'bg-brand hover:bg-brand-dark' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          changeSpeed(s)
                        }}
                      >
                        {s}x
                      </Button>
                    ))}
                  </div>

                  {playState === 'error' && (
                    <p className="mt-2 text-xs text-red-500">音频加载失败</p>
                  )}

                  <p className="mt-6 text-sm text-gray-400">
                    按回车键查看答案
                  </p>
                </div>
              ) : (
                /* ========== 背面：答案 + 解析 ========== */
                <div className="flex flex-col gap-4">
                  {/* 英文原文（可点击选词收藏） */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">English</p>
                    <p className="text-lg font-medium text-gray-900 leading-relaxed">
                      {currentCard.englishText.split(/(\s+)/).map((word, i) => {
                        // 跳过空格和标点
                        if (/^\s+$/.test(word) || /^[.,!?;:'"()\-]+$/.test(word)) return word
                        return (
                          <span
                            key={i}
                            className="cursor-pointer rounded px-0.5 transition-colors hover:bg-blue-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBookmark('vocabulary', word.replace(/[.,!?;:'"]/g, ''))
                            }}
                            title="点击收藏此词"
                          >
                            {word}
                          </span>
                        )
                      })}
                    </p>
                  </div>

                  {/* 中文翻译 */}
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">中文</p>
                    <p className="text-sm text-gray-600">{currentCard.chineseText}</p>
                  </div>

                  {/* AI 解析面板 */}
                  <AIPanel
                    analysis={currentCard.aiAnalysis}
                    onBookmarkPhrase={(phrase, meaning) => handleBookmark('phrase', `${phrase} — ${meaning}`)}
                  />

                  {/* 发音收藏按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBookmark('pronunciation', currentCard.englishText)
                    }}
                  >
                    收藏整句发音到难点本
                  </Button>

                  {/* FSRS 评分按钮 */}
                  <div className="pt-2">
                    <p className="mb-2 text-xs text-gray-500">请选择记忆难度：</p>
                    <FSRSButtons
                      cardId={currentCard.cardId}
                      onRated={handleRated}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 快捷键提示 */}
          <div className="mt-4 flex justify-center gap-4 text-xs text-gray-400">
            <span>空格：播放</span>
            <span>回车：翻转</span>
            <span>← →：切换</span>
          </div>
        </div>
      </div>
    </div>
  )
}
