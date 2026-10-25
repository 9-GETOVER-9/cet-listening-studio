import { CourseLibrary, WalkmanLink } from '@/components/CourseLibrary'

export default function Courses() {
  return <div className="quiet-page space-y-6">
    <header className="border-b border-[var(--app-line)] pb-6"><p className="quiet-kicker mb-2">Your listening library</p><h1 className="quiet-display text-3xl sm:text-4xl">找到适合今天的课程。</h1><p className="mt-3 text-sm text-[var(--app-muted)]">备考、精听、跟读，从一个小目标开始。</p></header>
    <section aria-label="课程目录"><CourseLibrary /></section>
    <WalkmanLink />
    <p className="text-xs leading-6 text-[var(--app-muted)]">新概念前两册与 CET-4 可免费学习；Pro 内容会在进入前说明。</p>
  </div>
}
