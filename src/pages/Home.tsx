import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Headphones, BookOpen, ChevronRight, Zap, TrendingUp, Target, Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { StreakBadge } from '@/components/StreakBadge'
import { DailyTaskCard } from '@/components/DailyTaskCard'
import { StudyHeatmap } from '@/components/StudyHeatmap'
import {
  getTotalStudiedCount,
  getTotalCardCount,
  getTodayReviewCount,
  getNotebookCount,
  getCurrentStreak,
  getNCEModulesByBook,
} from '@/db/crud'
import { useSettingsStore } from '@/store/settingsStore'

interface Stats {
  totalCards: number
  studiedCards: number
  todayReview: number
  notebookCount: number
  streak: number
  nceBook1Cards: number
  nceBook1Studied: number
  nceBook2Cards: number
  nceBook2Studied: number
}

export default function Home() {
  const navigate = useNavigate()
  const isPro = useSettingsStore((s) => s.isPro)

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    totalCards: 0,
    studiedCards: 0,
    todayReview: 0,
    notebookCount: 0,
    streak: 0,
    nceBook1Cards: 0,
    nceBook1Studied: 0,
    nceBook2Cards: 0,
    nceBook2Studied: 0,
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        const [totalCards, studiedCards, todayReview, notebookCount, streak,
               book1Modules, book2Modules] = await Promise.all([
          getTotalCardCount(),
          getTotalStudiedCount(),
          getTodayReviewCount(),
          getNotebookCount(),
          getCurrentStreak(),
          getNCEModulesByBook('Book1'),
          getNCEModulesByBook('Book2'),
        ])

        const calcStudied = async (modules: typeof book1Modules) => {
          let total = 0, studied = 0
          for (const m of modules) {
            total += m.totalCards
            studied += m.studiedCards
          }
          return { total, studied }
        }
        const book1 = await calcStudied(book1Modules)
        const book2 = await calcStudied(book2Modules)

        setStats({
          totalCards, studiedCards, todayReview, notebookCount, streak,
          nceBook1Cards: book1.total,
          nceBook1Studied: book1.studied,
          nceBook2Cards: book2.total,
          nceBook2Studied: book2.studied,
        })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleComingSoon = () => {
    toast.info('即将上线，敬请期待', { description: '长句合并训练功能开发中' })
  }

  const StatCard = ({
    icon: Icon,
    label,
    value,
    subtext,
    color,
  }: {
    icon: React.ElementType
    label: string
    value: number | string
    subtext?: string
    color: string
  }) => (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
          {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const studyRate = stats.totalCards > 0
    ? Math.round((stats.studiedCards / stats.totalCards) * 100)
    : 0

  return (
    <div className="space-y-6 p-4">
      {/* 欢迎区 + Streak */}
      <div className="rounded-2xl bg-gradient-to-r from-brand to-blue-400 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
              <span className="text-3xl">🎧</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">CET Listening Studio</h1>
              <p className="mt-1 text-sm text-white/80">四六级 & 新概念听力智能学习</p>
            </div>
          </div>
          <StreakBadge days={stats.streak} />
        </div>

        {/* 今日复习进度 */}
        {stats.todayReview > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span>今日待复习</span>
              <span className="font-medium">{stats.todayReview} 张卡片</span>
            </div>
            <Progress
              value={Math.min(100, (stats.studiedCards / stats.totalCards) * 100)}
              className="mt-2 h-2 bg-white/20"
            />
          </div>
        )}
      </div>

      {/* 今日任务卡片 */}
      <DailyTaskCard />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Target} label="已学习" value={stats.studiedCards} subtext={`共 ${stats.totalCards} 张`} color="bg-blue-100 text-blue-600" />
        <StatCard icon={Zap} label="今日待复习" value={stats.todayReview} color="bg-orange-100 text-orange-600" />
        <StatCard icon={TrendingUp} label="学习进度" value={`${studyRate}%`} color="bg-green-100 text-green-600" />
        <StatCard icon={BookOpen} label="难点收藏" value={stats.notebookCount} color="bg-purple-100 text-purple-600" />
      </div>

      {/* 学习热力图 */}
      <Card>
        <CardContent className="p-4">
          <StudyHeatmap />
        </CardContent>
      </Card>

      {/* 快捷入口 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">快捷入口</h2>
        <div className="space-y-3">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/cet')}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light">
                <Headphones className="h-6 w-6 text-brand" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">四六级听力</h3>
                <p className="mt-1 text-sm text-gray-500">按日期、Section、题型选择真题练习</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/nce')}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
                <BookOpen className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">新概念英语</h3>
                <p className="mt-1 text-sm text-gray-500">Book 1-4 系统课程，免费学习前两册</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={handleComingSoon}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
                <TrendingUp className="h-6 w-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">长句合并训练</h3>
                  <Badge variant="secondary" className="text-xs">即将上线</Badge>
                </div>
                <p className="mt-1 text-sm text-gray-500">多段音频合并练习</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 四六级分类 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">四六级听力</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/cet')}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
                <span className="text-xl font-bold text-green-600">4</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">CET-4</h3>
                <p className="text-sm text-gray-500">四级听力</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/cet')}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                <span className="text-xl font-bold text-blue-600">6</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">CET-6</h3>
                <p className="text-sm text-gray-500">六级听力</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 新概念英语入口 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">新概念英语</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate('/nce')}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
                <BookOpen className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Book 1 & 2</h3>
                <p className="text-xs text-gray-500">
                  {stats.nceBook1Cards + stats.nceBook2Cards > 0
                    ? `已学 ${stats.nceBook1Studied + stats.nceBook2Studied} 句`
                    : '免费学习'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => isPro ? navigate('/nce') : toast.info('请开通 PRO 解锁')}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
                {isPro ? (
                  <BookOpen className="h-6 w-6 text-purple-600" />
                ) : (
                  <Lock className="h-6 w-6 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Book 3 & 4</h3>
                <p className="text-xs text-gray-500">{isPro ? '已解锁' : '🔒 PRO 解锁'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
