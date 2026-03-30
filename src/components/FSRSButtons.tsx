import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Rating } from '@/types'
import { rateCard } from '@/lib/fsrs'
import { addStudyLog } from '@/db/crud'

interface FSRSButtonsProps {
  cardId: string
  disabled?: boolean
  className?: string
  onRated?: () => void
}

/**
 * FSRS 四按钮评分组件
 * Again（重来） / Hard（困难） / Good（掌握） / Easy（简单）
 */
export function FSRSButtons({
  cardId,
  disabled,
  className,
  onRated,
}: FSRSButtonsProps) {
  const [loading, setLoading] = useState(false)

  const handleRate = async (rating: Rating) => {
    if (loading) return

    setLoading(true)
    try {
      await rateCard(cardId, rating)

      // 记录学习日志
      await addStudyLog({
        cardId,
        action: 'review',
        rating,
        timestamp: Date.now(),
      })

      // 提示
      const labels = { 1: '重来', 2: '困难', 3: '掌握', 4: '简单' }
      toast.success(`已标记：${labels[rating]}`)

      onRated?.()
    } catch (error) {
      console.error('Failed to rate card:', error)
      toast.error('评分失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('flex gap-2 sm:gap-3', className)}>
      <Button
        onClick={() => handleRate(1)}
        disabled={disabled || loading}
        className="flex-1 bg-red-500 hover:bg-red-600 text-white border-red-500"
      >
        <span className="font-medium">重来</span>
        <span className="ml-1 text-xs opacity-80">Again</span>
      </Button>

      <Button
        onClick={() => handleRate(2)}
        disabled={disabled || loading}
        className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500"
      >
        <span className="font-medium">困难</span>
        <span className="ml-1 text-xs opacity-80">Hard</span>
      </Button>

      <Button
        onClick={() => handleRate(3)}
        disabled={disabled || loading}
        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
      >
        <span className="font-medium">掌握</span>
        <span className="ml-1 text-xs opacity-80">Good</span>
      </Button>

      <Button
        onClick={() => handleRate(4)}
        disabled={disabled || loading}
        className="flex-1 bg-green-500 hover:bg-green-600 text-white border-green-500"
      >
        <span className="font-medium">简单</span>
        <span className="ml-1 text-xs opacity-80">Easy</span>
      </Button>
    </div>
  )
}
