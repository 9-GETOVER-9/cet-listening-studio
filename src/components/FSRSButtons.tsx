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
  1: 'border-red-500 bg-red-500 hover:bg-red-600',
  2: 'border-yellow-500 bg-yellow-500 hover:bg-yellow-600',
  3: 'border-blue-500 bg-blue-500 hover:bg-blue-600',
  4: 'border-green-500 bg-green-500 hover:bg-green-600',
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
          className={cn('min-w-0 px-3 text-white', BUTTON_STYLES[rating])}
          onPointerDown={(event) => handlePointerDown(event, rating)}
          onKeyDown={(event) => handleKeyboard(event, rating)}
          onClick={swallowClick}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="flex flex-col leading-tight">
            <span className="font-medium">{RATING_LABELS[rating]}</span>
            <span className="text-xs opacity-80">{formatReviewInterval(previews[rating].due, previewAt)}</span>
          </span>
        </Button>
      ))}
    </div>
  )
}
