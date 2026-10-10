import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Headphones } from 'lucide-react'
import { QuietPageHeader } from '@/components/QuietPageHeader'

export default function IELTSHub() {
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
    <QuietPageHeader eyebrow="IELTS · Your study space" title="雅思，一处学。" description="听清关键词，认出同义替换。选择今天的练习，把积累留给下一次。" stamp={<>LISTEN<br />READ<br />REMEMBER</>} />
    <div className="grid gap-5 md:grid-cols-2">
      <Link to="/ielts/listening" className="group rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)] p-6 sm:p-8">
        <Headphones className="mb-8 h-7 w-7 text-[var(--app-accent)]" aria-hidden="true" /><p className="quiet-kicker">01 · LISTENING</p>
        <h2 className="mt-2 font-serif text-3xl">听力语料库</h2><p className="mt-4 text-sm leading-7 text-[var(--app-muted)]">王陆语料 · 高频词汇<br />听写测试、中英随身听与词条笔记。</p>
        <span className="mt-8 flex items-center justify-between text-sm font-semibold">进入听力练习<ArrowUpRight className="h-5 w-5" /></span>
      </Link>
      <Link to="/ielts/reading-538" className="group rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)] p-6 sm:p-8">
        <BookOpen className="mb-8 h-7 w-7 text-[var(--app-accent)]" aria-hidden="true" /><p className="quiet-kicker">02 · READING</p>
        <h2 className="mt-2 font-serif text-3xl">阅读 538 同义替换</h2><p className="mt-4 text-sm leading-7 text-[var(--app-muted)]">第一章 · 三类考点词<br />多选辨认、主动回忆与间隔复习。</p>
        <span className="mt-8 flex items-center justify-between text-sm font-semibold">进入阅读练习<ArrowUpRight className="h-5 w-5" /></span>
      </Link>
    </div>
  </div>
}
