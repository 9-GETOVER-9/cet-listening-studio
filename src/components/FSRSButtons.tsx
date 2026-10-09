import { useMemo, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { toast } from 'sonner'
import { getCard, refreshModuleStats } from '@/db/crud'
import { commitCardRating, type CommitCardRatingResult } from '@/db/reviewRepository'
import { previewFSRSRatings } from '@/lib/fsrs'
import { formatReviewInterval } from '@/lib/reviewInterval'
import { shouldActivateRating } from '@/lib/ratingActivation'
import { cn } from '@/lib/utils'
import type { FSRSState, Rating } from '@/types'
import { Button } from '@/components/ui/button'

interface FSRSButtonsProps {
  cardId: string
  fsrsState: FSRSState
  disabled?: boolean
  className?: string
  onRateStart?: () => void
  onRated?: (result: CommitCardRatingResult) => void
}

// 三个常规反馈对应 FSRS 的 Good、Hard、Again，评分数值保持兼容历史记录。
const VISIBLE_RATINGS: Rating[] = [3, 2, 1]
const RATING_LABELS: Record<Rating, string> = { 1: '忘记', 2: '模糊', 3: '认识', 4: '简单' }
const BUTTON_STYLES: Record<Rating, string> = {
  1: '[--rating:#b94735]',
  2: '[--rating:#a36b18]',
  3: '[--rating:#285c77]',
  4: '[--rating:#41724e]',
}

export function FSRSButtons({ cardId, fsrsState, disabled, className, onRateStart, onRated }: FSRSButtonsProps) {
  const [loading, setLoading] = useState(false)
  const interactionLock = useRef(false)
  const [previewAt] = useState(() => new Date())
  const previews = useMemo(() => previewFSRSRatings(fsrsState, previewAt), [fsrsState, previewAt])

  const handleRate = async (rating: Rating) => {
    if (interactionLock.current || loading || disabled) return
    interactionLock.current = true
    onRateStart?.()
    setLoading(true)
    try {
      const result = await commitCardRating({
        cardId,
        rating,
        operationId: crypto.randomUUID(),
        reviewedAt: new Date(),
      })
      const card = await getCard(cardId)
      if (card) await refreshModuleStats(card.moduleId)
      toast.success(`已标记：${RATING_LABELS[rating]}`)
      onRated?.(result)
    } catch (error) {
      console.error('Failed to rate card:', error)
      toast.error('评分失败，请稍后重试')
    } finally {
      interactionLock.current = false
      setLoading(false)
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, rating: Rating) => {
    event.stopPropagation()
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (shouldActivateRating('pointerdown')) void handleRate(rating)
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>, rating: Rating) => {
    event.preventDefault()
    event.stopPropagation()
    if (shouldActivateRating('click')) void handleRate(rating)
  }

  return (
    <div className={cn('grid grid-cols-3 gap-2 sm:gap-3', className)}>
      {VISIBLE_RATINGS.map((rating) => (
        <Button
          key={rating}
          data-interactive
          disabled={disabled || loading}
          variant="outline"
          className={cn('min-h-16 min-w-0 justify-start border-[var(--app-line)] bg-transparent px-3 text-left text-[var(--app-ink)] before:mr-1 before:h-8 before:w-0.5 before:bg-[var(--rating)] hover:border-[var(--rating)] hover:bg-[color-mix(in_srgb,var(--rating)_7%,transparent)]', BUTTON_STYLES[rating])}
          onPointerDown={(event) => handlePointerDown(event, rating)}
          onClick={(event) => handleClick(event, rating)}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="flex flex-col leading-tight">
            <span className="font-medium">{RATING_LABELS[rating]}</span>
            <span className="text-xs text-[var(--app-muted)]">{formatReviewInterval(previews[rating].due, previewAt)}</span>
          </span>
        </Button>
      ))}
    </div>
  )
}
