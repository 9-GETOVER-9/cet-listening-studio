import { BookOpenCheck, ChevronRight, Headphones } from 'lucide-react'
import { Link } from 'react-router-dom'

const entries = [
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
      {entries.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="group flex min-h-56 flex-col rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)] p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--app-accent)] hover:shadow-[var(--app-shadow)]">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><Icon className="h-6 w-6" aria-hidden="true" /></span>
        <h2 className="mt-7 font-serif text-2xl text-[var(--app-ink)]">{title}</h2>
        <p className="mt-2 flex-1 text-sm leading-7 text-[var(--app-muted)]">{description}</p>
        <span className="mt-6 flex items-center justify-between text-sm font-semibold text-[var(--app-accent)]">进入复习 <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
      </Link>)}
    </section>
  </div>
}
