import { COURSE_COVERS } from '@/config/courseCovers'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Gift, Headphones, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CourseLibrary, WalkmanLink } from '@/components/CourseLibrary'
import { useLearningResume } from '@/hooks/useLearningResume'
import { resumeCourse } from '@/lib/learningResume'
import { DailyTaskCard } from '@/components/DailyTaskCard'
import { getAllModules, getCurrentStreak, getTodayTaskStats, getTodayStudiedCount } from '@/db/crud'
import { useSettingsStore } from '@/store/settingsStore'
import { usePro } from '@/hooks/usePro'
import { useAccountSyncStatus } from '@/lib/accountSync'
import { shouldShowProReminder } from '@/lib/membershipPolicy'

interface Stats {
  totalCards: number
  studiedCards: number
  todayReview: number
  todayTaskTotal: number
  todayTaskCompleted: number
  todayStudied: number
  streak: number
}

export default function Home() {
  const navigate = useNavigate()
  const resume = useLearningResume()
  const lastCourse = resume ? resumeCourse(resume.path) : null
  const owner = useAccountSyncStatus(s => s.owner)
  const lastSynced = useAccountSyncStatus(s => s.lastSynced)
  const initialized = useSettingsStore(s => s.initialized)
  const { isGuestTrial, isPro, proDaysLeft, proExpiresAt } = usePro()
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [snapshot, setSnapshot] = useState<{ owner: typeof owner; stats: Stats } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const stats = snapshot?.owner === owner ? snapshot.stats : null
  const showProReminder = shouldShowProReminder({ isGuestTrial, isPro, proDaysLeft, proExpiresAt })

  useEffect(() => {
    let active = true
    if (!initialized) return
    const loadData = async () => {
      try {
        const [allModules, todayTask, streak, todayStudied] = await Promise.all([
          getAllModules(), getTodayTaskStats(), getCurrentStreak(), getTodayStudiedCount(),
        ])
        if (!active) return
        setSnapshot({ owner, stats: {
          totalCards: allModules.reduce((sum, module) => sum + module.totalCards, 0),
          studiedCards: allModules.reduce((sum, module) => sum + module.studiedCards, 0),
          todayReview: todayTask.remaining,
          todayTaskTotal: todayTask.total,
          todayTaskCompleted: todayTask.completed,
          todayStudied,
          streak,
        } })
        setLoadError('')
      } catch {
        if (active) setLoadError('学习统计暂时无法读取，请重试。你仍可以选择课程。')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadData()
    return () => { active = false }
  }, [owner, lastSynced, initialized, refreshIndex])

  function refreshStats() {
    setLoading(true)
    setLoadError('')
    setRefreshIndex(value => value + 1)
  }

  const statsPending = loading || !initialized || (!stats && !loadError)

  return (
    <div className="quiet-page space-y-6">
      <header className="flex items-end justify-between gap-4 border-b border-[var(--app-line)] pb-5">
        <div><p className="quiet-kicker mb-2">A little listening, every day</p><h1 id="home-title" className="quiet-display text-3xl sm:text-4xl">今天，听清一个细节。</h1></div>
        <Headphones className="hidden h-7 w-7 text-[var(--app-accent)] sm:block" aria-hidden="true" />
      </header>
      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]" aria-label="今日学习安排">
        <div className="relative flex min-h-52 items-center gap-5 overflow-hidden rounded-[var(--app-radius)] bg-[var(--app-accent)] p-5 text-white sm:p-7">
          <div className="relative z-10 min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[.16em] text-white/75">{resume ? 'CONTINUE LEARNING' : 'YOUR NEXT CHAPTER'}</p>
            <h2 className="mt-3 font-serif text-xl leading-tight sm:text-2xl">{resume ? '接着上次，继续听。' : '从一段好内容开始。'}</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">{resume ? lastCourse?.name : '选择一门课程，找到自己的练习节奏。'}</p>
            {resume && resume.label !== '继续上次学习' && <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{resume.label}</p>}
            <Button className="mt-5 h-11 bg-white px-5 text-[var(--app-accent)] hover:bg-white/90 hover:brightness-100" onClick={() => navigate(resume?.path ?? '/courses')}>
              {resume ? '继续上次学习' : '浏览课程'}<ArrowUpRight aria-hidden="true" />
            </Button>
          </div>
          <img src={COURSE_COVERS[lastCourse?.image ?? 'nce']} alt="" width="600" height="800" fetchPriority="high" className="h-28 w-21 shrink-0 rotate-6 rounded-md object-cover shadow-xl sm:h-40 sm:w-30 xl:h-48 xl:w-36" />
        </div>
        {loadError ? <section role="alert" className="quiet-surface flex flex-col justify-center gap-4 p-5"><p className="text-sm leading-6 text-[var(--app-muted)]">{loadError}</p><Button variant="outline" onClick={refreshStats}><RefreshCw aria-hidden="true" />重新读取</Button></section> : <DailyTaskCard className="h-full" total={stats?.todayTaskTotal ?? 0} completed={stats?.todayTaskCompleted ?? 0}
          remaining={stats?.todayReview ?? 0} loading={statsPending} onRefresh={refreshStats}
          action={<Button variant="outline" className="h-11 w-full justify-between" onClick={() => navigate(stats && stats.todayReview > 0 ? '/review/session' : '/courses')}>
            {stats && stats.todayReview > 0 ? '开始今日复习' : '选择新的练习'}<ArrowUpRight aria-hidden="true" />
          </Button>} />}
      </section>

      <dl className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="学习概览" aria-busy={statsPending}>
        {[
          { label: '今日已复习', value: stats?.todayStudied, unit: '张' },
          { label: '连续学习', value: stats?.streak, unit: '天' },
          { label: '累计学习', value: stats?.studiedCards, unit: '张' },
        ].map(item => <div key={item.label} className="quiet-surface min-w-0 px-3 py-4 sm:px-5">
          <dt className="text-xs text-[var(--app-muted)]">{item.label}</dt>
          <dd className="mt-2 flex flex-wrap items-baseline gap-x-1.5 font-semibold tabular-nums text-[var(--app-ink)]">
            <span className="text-[clamp(1.125rem,5vw,1.5rem)] tracking-tight sm:text-3xl">{item.value === undefined ? '—' : item.value.toLocaleString()}</span>
            <span className="text-xs font-normal text-[var(--app-muted)]">{item.unit}</span>
          </dd>
        </div>)}
      </dl>

      <section aria-labelledby="home-courses">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="home-courses" className="font-serif text-2xl text-[var(--app-ink)]">选择今天的练习</h2>
          <p className="text-xs text-[var(--app-muted)]">听力 · 阅读 · 跟读</p>
        </div>
        <CourseLibrary />
      </section>
      <WalkmanLink />

      {isGuestTrial && <section className="quiet-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="Pro 体验">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
          <div><p className="text-sm font-semibold">今日 Pro 体验中</p><p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">体验 AI 解析、句子拼接与新概念全四册。</p></div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/profile?tab=account')}>领取 2 个月</Button>
      </section>}

      {showProReminder && <section className="quiet-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="会员到期提醒">
        <div><p className="text-sm font-semibold">{isPro ? `Pro 将在 ${proDaysLeft} 天后到期` : owner === 'guest' ? 'Pro 体验已结束，免费课程仍可学习' : 'Pro 已到期'}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">{owner === 'guest' ? '注册账号可领取 Pro，继续使用完整内容并同步进度。' : '在个人中心输入续期邀请码，继续学习完整内容。'}</p></div>
        <Button variant="outline" size="sm" onClick={() => navigate('/profile?tab=account')}>{owner === 'guest' ? '查看账号权益' : '去续期'}</Button>
      </section>}

      {stats && <p className="text-center text-xs leading-5 text-[var(--app-muted)]">累计学习 {stats.studiedCards.toLocaleString()} / {stats.totalCards.toLocaleString()} 张卡片 · 每一步都有记录</p>}
    </div>
  )
}
