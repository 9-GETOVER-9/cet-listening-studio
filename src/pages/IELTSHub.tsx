import { ArrowUpRight, BookOpen, Headphones, LibraryBig, ListMusic, PenLine, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'

const groups = [
  { title: '听词与复习', items: [
    { to: '/ielts/listening?source=frequency&mode=walkman', title: '复习雅思到期词', description: '查看到期词，可听写或连续播放。', icon: RotateCcw },
    { to: '/ielts/listening?mode=walkman', title: '王陆语料随身听', description: '按章节连续播放英文和中文。', icon: Headphones },
    { to: '/ielts/listening', title: '王陆语料听写', description: '听发音，拼写单词与短语。', icon: PenLine },
    { to: '/ielts/listening?source=frequency', title: '雅思高频词听写', description: '练高频词，记录错词和学习进度。', icon: PenLine },
  ] },
  { title: '真题与阅读', items: [
    { to: '/cambridge/listening', title: '剑桥雅思原音', description: '选择书册、Test 和 Part 听原音。', icon: LibraryBig },
    { to: '/ielts/listening-cards', title: '雅思逐句听力卡', description: '一句一句精听，对照原文和翻译。', icon: ListMusic },
    { to: '/ielts/reading-538', title: '阅读 538 同义替换', description: '练习考点词与同义表达。', icon: BookOpen },
  ] },
] as const

export default function IELTSHub() {
  return <div className="quiet-page max-w-4xl space-y-7">
    <header className="border-b border-[var(--app-line)] pb-5">
      <h1 className="quiet-display text-3xl sm:text-4xl">今天想练什么？</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">选择一个目标，直接开始雅思学习。</p>
    </header>
    {groups.map(group => <section key={group.title} aria-label={group.title}>
      <h2 className="mb-3 text-base font-semibold text-[var(--app-ink)]">{group.title}</h2>
      <div className="overflow-hidden rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)] divide-y divide-[var(--app-line)]">
        {group.items.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="group flex min-h-20 items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--app-accent-soft)] sm:px-5">
          <Icon className="h-5 w-5 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block font-semibold text-[var(--app-ink)]">{title}</span><span className="mt-1 block text-sm leading-5 text-[var(--app-muted)]">{description}</span></span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
        </Link>)}
      </div>
    </section>)}
  </div>
}
