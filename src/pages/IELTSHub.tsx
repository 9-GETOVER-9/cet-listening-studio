import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Headphones, LibraryBig, ListMusic } from 'lucide-react'

type Area = {
  to: string
  icon: typeof Headphones
  kind: '听力' | '阅读'
  eyebrow: string
  title: string
  description: string
  meta: string
  action: string
  details: string[]
}

const areas: Area[] = [
  { to: '/ielts/listening', icon: Headphones, kind: '听力', eyebrow: '01 · WORD BANK', title: '雅思听力语料库', description: '听写、错词复习和随身听。', meta: '王陆语料 · 雅思高频词', details: ['听写练习', '错词回顾', '中英随身听'], action: '进入听力练习' },
  { to: '/cambridge/listening', icon: LibraryBig, kind: '听力', eyebrow: '02 · CAMBRIDGE AUDIO', title: '剑桥雅思原音', description: '从已接入的剑桥书册中选择 Test 和 Part。', meta: '本地音频 · 私人账号播放', details: ['书册选择', 'Test 连播', 'Part 点播'], action: '打开剑桥音频' },
  { to: '/ielts/listening-cards', icon: ListMusic, kind: '听力', eyebrow: '03 · SENTENCE CARDS', title: '雅思逐句听力卡', description: '播放一句原音，再对照英文原句和中文译文。', meta: 'Part 1–4 · 每个 Part 前 10 篇', details: ['一句一张卡', '原音定位播放', '中英切换'], action: '继续逐句精听' },
  { to: '/ielts/reading-538', icon: BookOpen, kind: '阅读', eyebrow: '04 · READING 538', title: '阅读 538 同义替换', description: '熟悉考点词，也认得它的另一种说法。', meta: '第一章 · 三类考点词', details: ['多选辨认', '主动回忆', '间隔复习'], action: '进入阅读练习' },
]

type Filter = '全部' | '听力' | '阅读'
const filters: Filter[] = ['全部', '听力', '阅读']

export default function IELTSHub() {
  const [filter, setFilter] = useState<Filter>('全部')
  const visibleAreas = useMemo(() => areas.filter(area => filter === '全部' || area.kind === filter), [filter])
  const listeningCount = areas.filter(area => area.kind === '听力').length
  const readingCount = areas.filter(area => area.kind === '阅读').length

  return <div className="quiet-page flex min-h-dvh flex-col">
    <div className="mb-6 border-b border-[var(--app-line)] pb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[var(--app-accent)]">IELTS · STUDY LIBRARY</p>
      <h1 className="quiet-display text-3xl md:text-4xl">雅思英语。</h1>
      <p className="mt-2 text-sm text-[var(--app-muted)]">{areas.length} 个学习入口 · 听力 {listeningCount} 项 · 阅读 {readingCount} 项</p>
    </div>

    <section className="quiet-surface px-4 py-4 md:px-6" aria-label="筛选学习内容">
      <p className="mb-2 text-xs font-medium text-[var(--app-muted)]">选择学习内容</p>
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[var(--app-paper-2)] p-1">
        {filters.map(option => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}
          className={`min-h-11 rounded-lg px-4 text-sm font-medium transition-colors ${filter === option ? 'bg-[var(--app-surface)] text-[var(--app-ink)] shadow-sm' : 'text-[var(--app-muted)] hover:text-[var(--app-ink)]'}`}>
          {option}
        </button>)}
      </div>
    </section>

    <div className="flex-1 py-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleAreas.map(({ to, icon: Icon, eyebrow, title, description, meta, details, action }) => <article key={to} className="quiet-surface flex min-h-[230px] flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--app-accent)]">{eyebrow}</span>
            <Icon className="h-5 w-5 text-[var(--app-muted)]" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-serif text-2xl leading-tight">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{description}</p>
          <p className="mt-1 text-xs text-[var(--app-muted)]">{meta}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {details.map(detail => <span key={detail} className="rounded-full bg-[var(--app-paper-2)] px-2.5 py-1 text-xs text-[var(--app-muted)]">{detail}</span>)}
          </div>
          <Link to={to} className="mt-auto flex min-h-11 items-end justify-between gap-3 border-t border-[var(--app-line)] pt-4 text-sm font-semibold text-[var(--app-accent)] hover:underline">
            {action}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        </article>)}
      </div>
    </div>
  </div>
}
