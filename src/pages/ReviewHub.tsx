import { BookOpenCheck, ChevronRight, Headphones, Radio } from 'lucide-react'
import { Link } from 'react-router-dom'

const entries = [
  {
    to: '/walkman',
    title: '到期卡片随身听',
    description: '连续听今天到期的课程卡片，不会消耗复习任务。',
    icon: Radio,
  },
  {
    to: '/ielts/listening?source=frequency&mode=walkman',
    title: '雅思到期词复习',
    description: '查看雅思高频到期词，听写或连续播放。',
    icon: Headphones,
  },
  {
    to: '/review/session',
    title: '常规到期复习',
    description: '复习课程词句与难点卡片，继续原有 FSRS 进度。',
    icon: BookOpenCheck,
  },
  {
    to: '/jiufen',
    title: '九分错句复习',
    description: '复习九分学长听力错题对应的答案句、原音频与笔记。',
    icon: Headphones,
  },
] as const

export default function ReviewHub() {
  return <div className="quiet-page mx-auto max-w-5xl space-y-8 px-5 py-10 sm:px-8 lg:py-14">
    <header className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--app-accent)]">Review</p>
      <h1 className="font-serif text-4xl text-[var(--app-ink)] sm:text-5xl">复习</h1>
      <p className="max-w-2xl text-[var(--app-muted)]">选择今天要继续的复习内容。</p>
    </header>
    <section className="grid gap-5 md:grid-cols-2" aria-label="复习类型">
      {entries.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="group flex items-center gap-4 rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)] p-5 transition-colors hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]">
        <Icon className="h-5 w-5 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
        <span className="min-w-0 flex-1"><h2 className="font-semibold text-[var(--app-ink)]">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{description}</p></span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
      </Link>)}
    </section>
  </div>
}
