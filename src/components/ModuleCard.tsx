import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Headphones, Lock, Mic } from 'lucide-react'
import type { Module, NCEBook } from '@/types'
import { difficultyLabel } from '@/lib/coursePresentation'

interface ModuleCardProps { module: Module; isLocked?: boolean; isPro?: boolean; onLockedClick?: (book: NCEBook) => void }

export function ModuleCard({ module, isLocked, isPro, onLockedClick }: ModuleCardProps) {
  const navigate = useNavigate()
  const locked = isLocked && !isPro
  const completionRate = module.totalCards > 0 ? Math.round(module.studiedCards / module.totalCards * 100) : 0
  const openLesson = () => {
    if (locked) { if (module.book) onLockedClick?.(module.book); return }
    navigate(`/card/${encodeURIComponent(module.moduleId)}`)
  }
  return <Card className="h-full">
    <CardContent className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="quiet-kicker">{module.book} · Lesson {module.lessonNum}</p><h3 className="mt-2 text-base font-semibold leading-6">{module.lessonTitle || module.title}</h3></div>
        <Badge variant="outline" className="shrink-0">{difficultyLabel(module.difficulty)}</Badge>
      </div>
      <div className="mb-2 mt-auto flex justify-between gap-2 pt-5 text-xs text-[var(--app-muted)]"><span>{module.studiedCards}/{module.totalCards} 句已学</span><span>{completionRate}%</span></div>
      <Progress value={completionRate} className="h-1.5" aria-label={`${module.lessonTitle || module.title}学习进度`} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" className={locked ? 'col-span-2' : ''} onClick={openLesson}>{locked ? <Lock aria-hidden="true" /> : <Headphones aria-hidden="true" />}{locked ? '查看解锁方式' : '逐句精听'}</Button>
        {!locked && <Button variant="outline" asChild><Link to={`/nce/shadowing/${encodeURIComponent(module.moduleId)}`}><Mic aria-hidden="true" />输入法跟读</Link></Button>}
      </div>
    </CardContent>
  </Card>
}
