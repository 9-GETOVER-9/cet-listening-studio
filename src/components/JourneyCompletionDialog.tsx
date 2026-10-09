import { CalendarCheck, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { JourneyProgress, CompletionFeedbackKind } from '@/lib/hundredDayJourney'
import type { LearningVolumeSummary } from '@/lib/learningStats'

interface JourneyCompletionDialogProps {
  open: boolean
  progress: JourneyProgress
  feedbackKind: CompletionFeedbackKind
  weeklySummary?: LearningVolumeSummary
  onOpenChange: (open: boolean) => void
  onViewStats?: () => void
}

export function JourneyCompletionDialog({
  open,
  progress,
  feedbackKind,
  weeklySummary,
  onOpenChange,
  onViewStats,
}: JourneyCompletionDialogProps) {
  const isWeekly = feedbackKind === 'weekly'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            {isWeekly ? <RotateCcw className="h-6 w-6" /> : <CalendarCheck className="h-6 w-6" />}
          </div>
          <DialogTitle>{isWeekly ? '这一周，稳稳走完了。' : '今天完成了。'}</DialogTitle>
          <DialogDescription>
            先坚持 100 天，不急着评价结果。今天这一格，已经落下来了。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">100 天进度</span>
              <span className="font-medium">第 {progress.dayOfHundred} / 100 天</span>
            </div>
            <Progress value={progress.progressPercent} className="h-2" />
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">累计完成</p>
                <p className="mt-1 text-xl font-semibold">{progress.completedDays} 天</p>
              </div>
              <div>
                <p className="text-gray-500">当前连续</p>
                <p className="mt-1 text-xl font-semibold">{progress.currentStreak} 天</p>
              </div>
            </div>
          </div>

          {isWeekly && weeklySummary && (
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="mb-3 text-sm font-medium text-gray-900">本周学习量</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">完成天数</span><p className="text-lg font-semibold">{weeklySummary.activeDays}</p></div>
                <div><span className="text-gray-500">复习卡片</span><p className="text-lg font-semibold">{weeklySummary.reviewCards}</p></div>
                <div><span className="text-gray-500">随身听句子</span><p className="text-lg font-semibold">{weeklySummary.walkmanSentences}</p></div>
                <div><span className="text-gray-500">听力分钟</span><p className="text-lg font-semibold">{weeklySummary.listeningMinutes}</p></div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onViewStats && (
            <Button variant="outline" onClick={onViewStats}>
              看学习量
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>继续</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
