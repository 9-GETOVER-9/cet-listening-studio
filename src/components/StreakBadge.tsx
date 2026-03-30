import { Flame } from 'lucide-react'

interface StreakBadgeProps {
  days: number
  className?: string
}

/**
 * 连续学习天数徽章
 * - 0 天：灰色
 * - 1-6 天：橙色
 * - 7+ 天：红色
 */
export function StreakBadge({ days, className = '' }: StreakBadgeProps) {
  const colorClass =
    days === 0
      ? 'text-gray-400 bg-gray-100'
      : days < 7
        ? 'text-orange-500 bg-orange-50'
        : 'text-red-500 bg-red-50'

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${colorClass} ${className}`}
    >
      <Flame className="h-4 w-4" />
      <span>
        {days > 0 ? `连续学习 ${days} 天` : '还没有开始学习'}
      </span>
    </div>
  )
}
