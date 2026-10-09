import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarCheck, Headphones, RotateCcw, Target } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { getHundredDayCompletionDates, getLearningVolumeSummary } from '@/db/crud'
import { buildJourneyProgress, type JourneyProgress } from '@/lib/hundredDayJourney'
import type { LearningVolumeSummary } from '@/lib/learningStats'
import { ListeningTimeStats } from '@/components/ListeningTimeStats'
import { useAuth } from '@/hooks/useAuth'

function getRange(days: number): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - days + 1)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export default function LearningStats() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [journey, setJourney] = useState<JourneyProgress | null>(null)
  const [week, setWeek] = useState<LearningVolumeSummary | null>(null)
  const [month, setMonth] = useState<LearningVolumeSummary | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const weekRange = getRange(7)
        const monthRange = getRange(30)
        const [dates, weekSummary, monthSummary] = await Promise.all([
          getHundredDayCompletionDates(),
          getLearningVolumeSummary(weekRange.start, weekRange.end),
          getLearningVolumeSummary(monthRange.start, monthRange.end),
        ])
        setJourney(buildJourneyProgress(dates))
        setWeek(weekSummary)
        setMonth(monthSummary)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading || !journey || !week || !month) {
    return (
      <div className="quiet-page space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const Metric = ({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: number | string }) => (
    <div className="rounded-lg border border-gray-200 p-4">
      <Icon className="mb-3 h-5 w-5 text-gray-500" />
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  )

  return (
    <div className="quiet-page space-y-5">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => navigate('/profile')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          我的
        </Button>
      </div>

      <div>
        <p className="quiet-kicker">100 Days</p>
        <h1 className="quiet-display mt-2 text-4xl md:text-6xl">学习量。</h1>
        <p className="mt-3 text-sm text-gray-500">不急着评价结果，先看见自己每天放下的一格。</p>
      </div>

      <ListeningTimeStats owner={user?.id ?? 'guest'} ready={!authLoading} details />

      <Card>
        <CardHeader><CardTitle className="text-base">100 天进度</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-500">第 {journey.dayOfHundred} / 100 天</span>
            <span className="font-medium">{journey.progressPercent}%</span>
          </div>
          <Progress value={journey.progressPercent} className="h-2.5" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric icon={CalendarCheck} label="累计完成天数" value={journey.completedDays} />
            <Metric icon={RotateCcw} label="当前连续天数" value={journey.currentStreak} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">近 7 天学习量</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Metric icon={CalendarCheck} label="活跃天数" value={week.activeDays} />
          <Metric icon={Target} label="复习卡片" value={week.reviewCards} />
          <Metric icon={Headphones} label="随身听句子" value={week.walkmanSentences} />
          <Metric icon={Headphones} label="随身听音频分钟（原长度）" value={week.listeningMinutes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">近 30 天概览</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Metric icon={CalendarCheck} label="活跃天数" value={month.activeDays} />
          <Metric icon={Target} label="复习卡片" value={month.reviewCards} />
          <Metric icon={Headphones} label="随身听句子" value={month.walkmanSentences} />
          <Metric icon={Headphones} label="随身听音频分钟（原长度）" value={month.listeningMinutes} />
        </CardContent>
      </Card>
    </div>
  )
}
