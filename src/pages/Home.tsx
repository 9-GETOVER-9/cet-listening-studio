import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Headphones, BookOpen, ChevronRight, TrendingUp, Target, Lock, Gift } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { StreakBadge } from '@/components/StreakBadge'
import { DailyTaskCard } from '@/components/DailyTaskCard'
import {
  getAllModules,
  getNotebookCount,
  getCurrentStreak,
  getTodayTaskStats,
  getTodayStudiedCount,
} from '@/db/crud'
import { useSettingsStore } from '@/store/settingsStore'
import { usePro } from '@/hooks/usePro'
import { shouldShowProReminder } from '@/lib/membershipPolicy'

interface Stats {
  totalCards: number
  studiedCards: number
  todayReview: number
  todayTaskTotal: number
  todayTaskCompleted: number
  todayStudied: number
  notebookCount: number
  streak: number
  nceBook1Cards: number
  nceBook1Studied: number
  nceBook2Cards: number
  nceBook2Studied: number
}

export default function Home() {
  const navigate = useNavigate()
  const initialized = useSettingsStore((s) => s.initialized)
  const { isGuestTrial, isPro, proDaysLeft, proExpiresAt } = usePro()

  const [loading, setLoading] = useState(true)

  const safeNavigate = (path: string) => {
    navigate(path)
  }
  const [stats, setStats] = useState<Stats>({
    totalCards: 0,
    studiedCards: 0,
    todayReview: 0,
    todayTaskTotal: 0,
    todayTaskCompleted: 0,
    todayStudied: 0,
    notebookCount: 0,
    streak: 0,
    nceBook1Cards: 0,
    nceBook1Studied: 0,
    nceBook2Cards: 0,
    nceBook2Studied: 0,
  })
  const showProReminder = shouldShowProReminder({ isGuestTrial, isPro, proDaysLeft, proExpiresAt })

  useEffect(() => {
    const loadData = async () => {
      try {
        const [allModules, todayTask, notebookCount, streak, todayStudied] = await Promise.all([
          getAllModules(),
          getTodayTaskStats(),
          getNotebookCount(),
          getCurrentStreak(),
          getTodayStudiedCount(),
        ])

        const totalCards = allModules.reduce((sum, module) => sum + module.totalCards, 0)
        const studiedCards = allModules.reduce((sum, module) => sum + module.studiedCards, 0)
        const book1 = allModules
          .filter((module) => module.book === 'Book1')
          .reduce((acc, module) => ({
            total: acc.total + module.totalCards,
            studied: acc.studied + module.studiedCards,
          }), { total: 0, studied: 0 })
        const book2 = allModules
          .filter((module) => module.book === 'Book2')
          .reduce((acc, module) => ({
            total: acc.total + module.totalCards,
            studied: acc.studied + module.studiedCards,
          }), { total: 0, studied: 0 })

        setStats({
          totalCards,
          studiedCards,
          todayReview: todayTask.remaining,
          todayTaskTotal: todayTask.total,
          todayTaskCompleted: todayTask.completed,
          todayStudied,
          notebookCount,
          streak,
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
      <div className="quiet-page space-y-4">
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

  return (
    <div className="quiet-page space-y-8">
      {/* 欢迎区 + Streak */}
      <section className="min-h-[320px] bg-[var(--app-ink)] p-7 text-[var(--app-surface)] shadow-[var(--app-shadow)] md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-full border border-white/40">
              <Headphones className="h-6 w-6" />
            </div>
            <div>
              <p className="quiet-kicker !text-[#b8c1bd]">Today · Listening Edit</p>
              <h1 className="quiet-display mt-2 text-4xl md:text-6xl">今天，听清一个细节。</h1>
              <p className="mt-3 text-sm text-white/70">四六级与新概念听力，按记忆节奏慢慢听懂。</p>
            </div>
          </div>
          <StreakBadge days={stats.streak} />
        </div>

        {/* 今日复习进度 */}
        {stats.todayReview > 0 && (
          <div className="mt-16 border-t border-white/25 pt-5">
            <div className="flex items-center justify-between text-sm">
              <span>今日待复习</span>
              <span className="font-medium">{stats.todayReview} 张卡片</span>
            </div>
            <Progress
              value={stats.todayTaskTotal > 0 ? Math.min(100, (stats.todayTaskCompleted / stats.todayTaskTotal) * 100) : 0}
              className="mt-2 h-2 bg-white/20"
            />
          </div>
        )}
      </section>

      {/* 今日任务卡片 */}
      {isGuestTrial && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-gray-900">今日 Pro 体验中</p>
              <p className="mt-1 text-sm text-gray-600">
                直接体验 AI 解析、句子拼接和新概念 Book 3-4。
              </p>
            </div>
            <Button className="shrink-0" size="sm" onClick={() => navigate('/profile')}>
              领取 2 个月
            </Button>
          </CardContent>
        </Card>
      )}

      {showProReminder && (
        <Card className={isPro ? 'border-amber-200 bg-amber-50' : 'border-orange-200 bg-orange-50'}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {isPro ? `Pro 将在 ${proDaysLeft} 天后到期` : 'Pro 已到期'}
                </p>
                <p className="text-sm text-gray-600">
                  可在个人中心输入续期邀请码，免费功能和云同步不受影响。
                </p>
              </div>
            </div>
            <Button className="shrink-0" size="sm" variant="outline" onClick={() => navigate('/profile')}>
              去续期
            </Button>
          </CardContent>
        </Card>
      )}

      <DailyTaskCard
        total={stats.todayTaskTotal}
        completed={stats.todayTaskCompleted}
        remaining={stats.todayReview}
        loading={loading}
      />

      {/* 今日建议 */}
      {stats.todayReview > 0 ? (
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-gray-900">📅 今日建议</p>
              <p className="mt-1 text-sm text-gray-600">
                你有 <span className="font-bold text-blue-600">{stats.todayReview}</span> 张卡片需要复习
              </p>
              <p className="text-xs text-gray-400">
                预计需要 {Math.max(1, Math.ceil(stats.todayReview * 0.5))} 分钟
              </p>
            </div>
            <Button
              onClick={() => {
                if (!initialized) {
                  toast.info('听力材料正在加载中，请稍候...')
                  return
                }
                navigate('/review')
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              开始复习
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-gray-900">🎉 今日已完成</p>
              <p className="mt-1 text-sm text-gray-600">太棒了！今天已完成所有复习任务</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Target} label="今日已复习" value={stats.todayStudied} subtext="张" color="bg-blue-100 text-blue-600" />
        <StatCard icon={TrendingUp} label="连续打卡" value={stats.streak} subtext="天" color="bg-orange-100 text-orange-600" />
        <StatCard icon={BookOpen} label="累计掌握" value={stats.studiedCards} subtext={`共 ${stats.totalCards} 张`} color="bg-green-100 text-green-600" />
      </div>

      {/* 快捷入口 */}
      <div>
        <h2 className="quiet-display mb-4 text-3xl">继续学习</h2>
        <div className="space-y-3">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => safeNavigate('/cet')}>
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

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => safeNavigate('/nce')}>
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

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => safeNavigate('/cet')}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light">
                <TrendingUp className="h-6 w-6 text-brand" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">长句合并训练</h3>
                  {isPro ? (
                    <Badge variant="default" className="text-xs bg-brand text-white">PRO功能</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <Lock className="mr-1 h-3 w-3" />
                      PRO专属
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {isPro ? '合并相邻句子进行练习' : '升级PRO解锁句子拼接功能'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 四六级分类 */}
      <div>
        <h2 className="quiet-display mb-4 text-3xl">四六级听力</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => safeNavigate('/cet')}>
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

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => safeNavigate('/cet')}>
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
        <h2 className="quiet-display mb-4 text-3xl">新概念英语</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => safeNavigate('/nce')}>
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

          <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => isPro ? safeNavigate('/nce') : toast.info('请开通 PRO 解锁')}>
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
