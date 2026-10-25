import { COURSE_COVERS } from '@/config/courseCovers'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Radio } from 'lucide-react'

const COURSES = [
  { to: '/ielts', key: 'ielts', label: '雅思', tag: 'IELTS', description: '听写语料库 · 阅读 538', detail: '练习关键词与同义替换' },
  { to: '/cet', key: 'cet', label: '四六级听力', tag: 'CET-4 / CET-6', description: '历年真题 · 逐句精听', detail: '从真题出发，听懂每一句' },
  { to: '/nce', key: 'nce', label: '新概念英语', tag: 'BOOK 1–4', description: '听力卡片 · 输入法跟读', detail: '系统学习，也开口表达' },
] as const

export function CourseLibrary() {
  return <div className="grid gap-3 sm:grid-cols-3">
    {COURSES.map(course => <Link key={course.key} to={course.to} className="study-link group flex gap-4 p-4 sm:block sm:p-5">
      <img src={COURSE_COVERS[course.key]} alt="" width="600" height="800" loading="lazy" decoding="async" className="h-32 w-24 shrink-0 rounded-md object-cover shadow-sm sm:mx-auto sm:h-44 sm:w-33 xl:h-52 xl:w-39" />
      <div className="flex min-w-0 flex-1 flex-col justify-center sm:mt-5">
        <p className="quiet-kicker">{course.tag}</p>
        <div className="mt-1 flex items-center justify-between gap-2"><h3 className="text-lg font-semibold">{course.label}</h3><ArrowUpRight className="h-4 w-4 text-[var(--app-accent)]" aria-hidden="true" /></div>
        <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">{course.description}</p>
        <p className="mt-1 hidden text-xs leading-5 text-[var(--app-muted)] lg:block">{course.detail}</p>
      </div>
    </Link>)}
  </div>
}

export function WalkmanLink() {
  return <Link to="/walkman" className="study-link flex items-center gap-4 px-5 py-4">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><Radio className="h-5 w-5" aria-hidden="true" /></span>
    <div className="flex-1"><h3 className="text-sm font-semibold">随身听</h3><p className="mt-0.5 text-xs leading-5 text-[var(--app-muted)]">散步、通勤时，连续听一听学过的内容。</p></div>
    <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
  </Link>
}
