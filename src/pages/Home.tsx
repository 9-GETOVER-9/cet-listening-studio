import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Gift, Headphones, Radio, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

  const courses = [
    { to: '/ielts', icon: Headphones, label: '雅思', subtitle: '听清关键词，认出同义替换', detail: '听写语料库 · 阅读 538 · 错词复习', index: '01' },
    { to: '/cet', icon: Radio, label: '四六级听力', subtitle: '从真题出发，练习每一句', detail: `CET-4 / CET-6 · 长句合并${isPro ? '已解锁' : '（Pro）'}`, index: '02' },
    { to: '/nce', icon: BookOpen, label: '新概念英语', subtitle: '系统学习，也可以开口跟读', detail: `Book 1–4 · ${isPro ? '全四册已解锁' : '前两册免费'}`, index: '03' },
    { to: '/walkman', icon: Headphones, label: '随身听', subtitle: '把碎片时间留给耳朵', detail: '连续播放 · 跟随今日复习顺序', index: '04' },
  ]
  const statsPending = loading || !initialized || (!stats && !loadError)

  return (
    <div className="quiet-page space-y-6">
      <section className="overflow-hidden rounded-[var(--app-radius)] bg-[var(--app-accent)] p-6 text-white sm:p-8" aria-labelledby="home-title">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-white/75">Your daily listening space</p>
          <Headphones className="h-5 w-5 shrink-0 text-white/75" aria-hidden="true" />
        </div>
        <div className="mt-5 flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div>
            <h1 id="home-title" className="font-serif text-[clamp(1.85rem,3.5vw,2.8rem)] leading-tight tracking-tight">今天，听清一个细节。</h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/80">从一次练习开始，让听过的内容慢慢变熟悉。</p>
          </div>
          <Button className="h-11 shrink-0 border-white/30 bg-white/10 px-5 text-white hover:bg-white/20 hover:brightness-100"
            disabled={!initialized && !!stats?.todayReview}
            onClick={() => navigate(stats && !loadError && stats.todayReview > 0 ? '/review' : '/ielts')}>
            {stats && !loadError && stats.todayReview > 0 ? '开始今日复习' : '开始雅思练习'}<ArrowUpRight aria-hidden="true" />
          </Button>
        </div>
      </section>

      {loadError ? <section role="alert" className="quiet-surface flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm leading-6 text-[var(--app-muted)]">{loadError}</p>
        <Button variant="outline" onClick={refreshStats}><RefreshCw aria-hidden="true" />重新读取</Button>
      </section> : <DailyTaskCard total={stats?.todayTaskTotal ?? 0} completed={stats?.todayTaskCompleted ?? 0}
        remaining={stats?.todayReview ?? 0} loading={statsPending} onRefresh={refreshStats} />}

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
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map(({ to, icon: Icon, label, subtitle, detail, index }) => <Link key={to} to={to}
            className="study-link quiet-surface group block p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="font-serif text-sm text-[var(--app-muted)]">{index}</span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{label}</h3>
            <p className="mt-1.5 text-sm leading-6 text-[var(--app-muted)]">{subtitle}</p>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--app-line)] pt-3">
              <span className="text-xs leading-5 text-[var(--app-muted)]">{detail}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
            </div>
          </Link>)}
        </div>
      </section>

      {isGuestTrial && <section className="quiet-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="Pro 体验">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
          <div><p className="text-sm font-semibold">今日 Pro 体验中</p><p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">体验 AI 解析、句子拼接与新概念全四册。</p></div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>领取 2 个月</Button>
      </section>}

      {showProReminder && <section className="quiet-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="会员到期提醒">
        <div><p className="text-sm font-semibold">{isPro ? `Pro 将在 ${proDaysLeft} 天后到期` : 'Pro 已到期'}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">在个人中心输入续期邀请码，继续学习完整内容。</p></div>
        <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>去续期</Button>
      </section>}

      {stats && <p className="text-center text-xs leading-5 text-[var(--app-muted)]">累计学习 {stats.studiedCards.toLocaleString()} / {stats.totalCards.toLocaleString()} 张卡片 · 每一步都有记录</p>}
    </div>
  )
}
