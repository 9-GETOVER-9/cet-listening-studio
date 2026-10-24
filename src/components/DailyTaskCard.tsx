import { CheckCircle2, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

interface DailyTaskCardProps {
  className?: string
  total: number
  completed: number
  remaining: number
  loading?: boolean
  onRefresh?: () => void
}

export function DailyTaskCard({ className = '', total, completed, remaining, loading = false, onRefresh }: DailyTaskCardProps) {
  const progress = total > 0 ? Math.min(100, (completed / total) * 100) : 0
  const isComplete = !loading && remaining === 0 && total > 0
  const message = loading ? '正在读取今日进度…'
    : total === 0 ? '今天暂无到期任务，可以选择一项课程开始练习。'
      : isComplete ? '今日复习已完成，给自己的坚持一点肯定。'
        : `还有 ${remaining} 张待复习，按自己的节奏继续。`

  return <Card className={className} aria-busy={loading}>
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isComplete && <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />}
          <h2 className="text-sm font-semibold text-[var(--app-ink)]">今日复习进度</h2>
          {!loading && total > 0 && <span className="text-xs tabular-nums text-[var(--app-muted)]">{completed} / {total}</span>}
        </div>
        {onRefresh && <Button variant="ghost" size="sm" disabled={loading} onClick={onRefresh}>
          <RefreshCw className={loading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />{loading ? '读取中' : '刷新进度'}
        </Button>}
      </div>
      {!loading && total > 0 && <Progress value={progress} className="mt-3 h-1.5" aria-label="今日复习进度" />}
      <p role="status" className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{message}</p>
    </CardContent>
  </Card>
}
