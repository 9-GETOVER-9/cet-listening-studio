import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import { toast } from 'sonner'
import { getCard, refreshModuleStats } from '@/db/crud'
import { commitCardRating, type CommitCardRatingResult } from '@/db/reviewRepository'
import { previewFSRSRatings } from '@/lib/fsrs'
import { formatReviewInterval } from '@/lib/reviewInterval'
import { cn } from '@/lib/utils'
import type { FSRSState, Rating } from '@/types'
import { Button } from '@/components/ui/button'

interface FSRSButtonsProps {
  cardId: string
  fsrsState: FSRSState
  disabled?: boolean
  className?: string
  onRated?: (result: CommitCardRatingResult) => void
}

const RATING_LABELS: Record<Rating, string> = { 1: '重来', 2: '困难', 3: '掌握', 4: '简单' }
const BUTTON_STYLES: Record<Rating, string> = {
  1: '[--rating:#b94735]',
  2: '[--rating:#a36b18]',
  3: '[--rating:#285c77]',
  4: '[--rating:#41724e]',
}

export function FSRSButtons({ cardId, fsrsState, disabled, className, onRated }: FSRSButtonsProps) {
  const [loading, setLoading] = useState(false)
  const interactionLock = useRef(false)
  const [previewAt] = useState(() => new Date())
  const previews = useMemo(() => previewFSRSRatings(fsrsState, previewAt), [fsrsState, previewAt])

  const handleRate = async (rating: Rating) => {
    if (interactionLock.current || loading || disabled) return
    interactionLock.current = true
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
    event.preventDefault()
    event.stopPropagation()
    if (event.pointerType === 'mouse' && event.button !== 0) return
    void handleRate(rating)
  }

  const handleKeyboard = (event: KeyboardEvent<HTMLButtonElement>, rating: Rating) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    void handleRate(rating)
  }

  const swallowClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3', className)}>
      {([1, 2, 3, 4] as Rating[]).map((rating) => (
        <Button
          key={rating}
          data-interactive
          disabled={disabled || loading}
          variant="outline"
          className={cn('min-h-16 min-w-0 justify-start border-[var(--app-line)] bg-transparent px-3 text-left text-[var(--app-ink)] before:mr-1 before:h-8 before:w-0.5 before:bg-[var(--rating)] hover:border-[var(--rating)] hover:bg-[color-mix(in_srgb,var(--rating)_7%,transparent)]', BUTTON_STYLES[rating])}
          onPointerDown={(event) => handlePointerDown(event, rating)}
          onKeyDown={(event) => handleKeyboard(event, rating)}
          onClick={swallowClick}
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
