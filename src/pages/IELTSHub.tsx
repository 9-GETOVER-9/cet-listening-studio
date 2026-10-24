import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Headphones } from 'lucide-react'
import { QuietPageHeader } from '@/components/QuietPageHeader'

const areas = [
  { to: '/ielts/listening', icon: Headphones, eyebrow: '01 · Listening', title: '听力语料库', description: '从听清一个词，到记住一组表达。', content: '王陆语料 · 雅思高频词汇', features: ['听写测试', '错词复习', '中英随身听'], action: '进入听力练习' },
  { to: '/ielts/reading-538', icon: BookOpen, eyebrow: '02 · Reading', title: '阅读 538 同义替换', description: '熟悉考点词，也认得它的另一种说法。', content: '第一章 · 三类考点词', features: ['多选辨认', '主动回忆', '间隔复习'], action: '进入阅读练习' },
]

export default function IELTSHub() {
  return <div className="quiet-page">
    <QuietPageHeader eyebrow="IELTS · Your study space" title="雅思，一处学。" description="听清关键词，认出同义替换。选一项练习，接着上一次的积累。" />
    <div className="grid gap-4 md:grid-cols-2">
      {areas.map(({ to, icon: Icon, eyebrow, title, description, content, features, action }) => <Link key={to} to={to}
        className="study-link quiet-surface group flex flex-col p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><Icon className="h-6 w-6" aria-hidden="true" /></span>
          <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--app-muted)]">{eyebrow}</span>
        </div>
        <h2 className="mt-5 font-serif text-2xl leading-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">{description}</p>
        <p className="mt-1 text-xs leading-6 text-[var(--app-muted)]">{content}</p>
        <div className="mb-6 mt-4 flex flex-wrap gap-2">
          {features.map(feature => <span key={feature} className="rounded-full bg-[var(--app-paper)] px-2.5 py-1 text-xs text-[var(--app-muted)]">{feature}</span>)}
        </div>
        <span className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--app-line)] pt-4 text-sm font-semibold text-[var(--app-accent)]">
          {action}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </span>
      </Link>)}
    </div>
  </div>
}
