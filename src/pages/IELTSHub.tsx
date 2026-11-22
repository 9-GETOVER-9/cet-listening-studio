import { ArrowUpRight, BookOpen, Headphones, LibraryBig, ListMusic, PenLine, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLearningResume } from '@/hooks/useLearningResume'
import { COURSE_COVERS } from '@/config/courseCovers'

const groups = [
  { title: '随身听', items: [
    { to: '/ielts/listening?mode=walkman', title: '王陆语料随身听', description: '按章节连续播放英文和中文。', icon: Headphones },
  ] },
  { title: '听写练词', items: [
    { to: '/ielts/listening', title: '王陆语料听写', description: '听发音，拼写单词与短语。', icon: PenLine },
    { to: '/ielts/listening?source=frequency', title: '雅思高频词听写', description: '练高频词，记录错词和学习进度。', icon: PenLine },
  ] },
  { title: '原音与精听', items: [
    { to: '/cambridge/listening', title: '剑桥雅思原音', description: '选择书册、Test 和 Part 听原音。', icon: LibraryBig },
    { to: '/ielts/listening-cards', title: '雅思逐句听力卡', description: '一句一句精听，对照原文和翻译。', icon: ListMusic },
  ] },
  { title: '阅读词汇', items: [
    { to: '/ielts/reading-538', title: '阅读 538 同义替换', description: '练习考点词与同义表达。', icon: BookOpen },
    { to: '/ielts/reading-538/match', title: '考点对应消消乐', description: '选齐同组表达，通关后回顾词义。', icon: BookOpen },
  ] },
] as const

export default function IELTSHub() {
  const resume = useLearningResume()
  const lastPractice = resume?.path.startsWith('/ielts/') ? resume : null
  return <div className="quiet-page space-y-5">
    <header>
      <h1 className="quiet-display text-3xl sm:text-4xl">雅思学习</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">按今天的目标开始练习。</p>
    </header>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        <section className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.52fr)] items-center gap-3 rounded-[var(--app-radius)] bg-[var(--app-accent)] p-4 text-white sm:gap-5 sm:p-6">
          <div className="min-w-0 space-y-3">
            <h2 className="font-serif text-xl sm:text-2xl">{lastPractice ? '接着上次练' : '从阅读 538 开始'}</h2>
            <p className="text-sm leading-6 text-white/90">{lastPractice ? lastPractice.label : '辨认原文和题目里的对应表达。'}</p>
            <Link to={lastPractice?.path ?? '/ielts/reading-538'} className="inline-flex min-h-11 items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[var(--app-accent)]">
              {lastPractice ? '继续上次学习' : '开始阅读练习'}
            </Link>
          </div>
          <img src={COURSE_COVERS.ielts} alt="" className="w-full max-w-40 justify-self-end rounded-lg" />
        </section>
        <Link to="/ielts/listening?source=frequency&mode=walkman" className="quiet-surface inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-semibold">
          <RotateCcw className="size-4 shrink-0" aria-hidden="true" />复习雅思到期词
        </Link>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {groups.map(group => <section key={group.title} aria-label={group.title} className="quiet-surface min-w-0 px-4 pt-3">
      <h2 className="pb-2 text-base font-semibold text-[var(--app-ink)]">{group.title}</h2>
      <div className="divide-y divide-[var(--app-line)] border-t border-[var(--app-line)]">
        {group.items.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="flex min-h-14 items-center gap-3 py-2.5 hover:underline">
          <Icon className="h-5 w-5 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block font-semibold text-[var(--app-ink)]">{title}</span><span className="mt-1 block text-sm leading-5 text-[var(--app-muted)]">{description}</span></span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
        </Link>)}
      </div>
      </section>)}
      </div>
    </div>
  </div>
}
