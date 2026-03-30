import { useEffect, useState, useMemo } from 'react'
import { getStudyDatesInRange } from '@/db/crud'
import { cn } from '@/lib/utils'

interface StudyHeatmapProps {
  className?: string
}

const WEEKS = 13 // 显示 13 周

// 颜色等级：0 = 无, 1-5 = 少, 6-15 = 中, 16+ = 多
function getColorClass(count: number): string {
  if (count === 0) return 'bg-gray-100'
  if (count <= 5) return 'bg-blue-200'
  if (count <= 15) return 'bg-blue-400'
  return 'bg-blue-600'
}

// 获取日期的星期几（0=周日）
function getDayOfWeek(date: Date): number {
  return date.getDay()
}

/**
 * 学习热力图
 * GitHub 风格，显示最近 13 周的学习情况
 */
export function StudyHeatmap({ className = '' }: StudyHeatmapProps) {
  const [dateMap, setDateMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const load = async () => {
      const endDate = new Date()
      endDate.setHours(23, 59, 59, 999)
      const startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1))

      const map = await getStudyDatesInRange(startDate, endDate)
      setDateMap(map)
      setLoading(false)
    }
    load()
  }, [])

  // 生成日期网格数据
  const { grid, months } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 从今天往前推 13 周的第一天（对齐到周日）
    const endDate = new Date(today)
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1))

    // 对齐到周日
    while (getDayOfWeek(startDate) !== 0) {
      startDate.setDate(startDate.getDate() - 1)
    }

    const grid: { date: Date; count: number }[][] = []
    const months: { label: string; weekIndex: number }[] = []
    let currentMonth = -1
    let currentWeek: { date: Date; count: number }[] = []

    const cursor = new Date(startDate)
    let weekIndex = 0

    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().slice(0, 10)
      const count = dateMap.get(dateStr) || 0

      // 月份标签
      const month = cursor.getMonth()
      if (month !== currentMonth && currentWeek.length === 0) {
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
        months.push({ label: monthNames[month], weekIndex })
        currentMonth = month
      }

      currentWeek.push({ date: new Date(cursor), count })

      // 周日结束一行
      if (getDayOfWeek(cursor) === 6) {
        grid.push(currentWeek)
        currentWeek = []
        weekIndex++
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    // 补齐最后一周（如果没满）
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        const dummy = new Date(0)
        currentWeek.push({ date: dummy, count: -1 }) // -1 表示空白
      }
      grid.push(currentWeek)
    }

    return { grid, months }
  }, [dateMap])

  if (loading) {
    return (
      <div className={cn('animate-pulse space-y-2', className)}>
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="flex gap-1">
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="h-3 w-3 rounded-sm bg-gray-200" />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const dayLabels = ['', '一', '', '三', '', '五', '']
  const totalStudyDays = Array.from(dateMap.values()).filter((c) => c > 0).length
  const totalCards = Array.from(dateMap.values()).reduce((a, b) => a + b, 0)

  return (
    <div className={className}>
      {/* 标题 */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">学习热力图</h3>
        <span className="text-sm text-gray-500">
          {totalStudyDays} 天活跃 · 共 {totalCards} 次学习
        </span>
      </div>

      {/* 热力图网格 */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-0">
          {/* 月份标签 */}
          <div className="mb-1 flex text-xs text-gray-400">
            <div className="w-4" /> {/* 对齐 */}
            <div className="flex gap-1">
              {months.map((m, i) => (
                <span
                  key={i}
                  style={{ marginLeft: i === 0 ? 0 : `${(m.weekIndex - (months[i - 1]?.weekIndex || 0) - 1) * 14}px` }}
                  className="absolute"
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-1 pt-4">
            {/* 星期标签 */}
            <div className="flex flex-col gap-1 pr-1">
              {dayLabels.map((label, i) => (
                <div key={i} className="h-3 w-3 text-[10px] leading-3 text-gray-400">
                  {label}
                </div>
              ))}
            </div>

            {/* 周网格 */}
            <div className="flex gap-1">
              {grid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day, di) => {
                    const isDummy = day.count === -1
                    const isFuture = day.date > new Date()
                    const dateStr = day.date.toISOString().slice(0, 10)

                    return (
                      <div
                        key={di}
                        className={cn(
                          'h-3 w-3 rounded-sm transition-colors',
                          isDummy || isFuture
                            ? 'bg-transparent'
                            : getColorClass(day.count),
                          !isDummy && !isFuture && 'cursor-pointer hover:ring-2 hover:ring-blue-300'
                        )}
                        onClick={() => {
                          if (!isDummy && !isFuture) {
                            setTooltip({
                              date: dateStr,
                              count: day.count,
                              x: 0,
                              y: 0,
                            })
                          }
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 图例 */}
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <span>少</span>
            <div className="h-3 w-3 rounded-sm bg-gray-100" />
            <div className="h-3 w-3 rounded-sm bg-blue-200" />
            <div className="h-3 w-3 rounded-sm bg-blue-400" />
            <div className="h-3 w-3 rounded-sm bg-blue-600" />
            <span>多</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="mt-2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white">
          <p className="font-medium">{tooltip.date}</p>
          <p>{tooltip.count} 次学习</p>
        </div>
      )}
    </div>
  )
}
