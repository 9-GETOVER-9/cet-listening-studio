import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Lock } from 'lucide-react'
import type { Module, NCEBook } from '@/types'
import { cn } from '@/lib/utils'

interface ModuleCardProps {
  module: Module
  isLocked?: boolean
  isPro?: boolean
  onLockedClick?: (book: NCEBook) => void
}

const difficultyVariant = (d: string) => {
  switch (d) {
    case 'basic': return 'basic' as const
    case 'medium': return 'medium' as const
    case 'hard': return 'hard' as const
    case 'advanced': return 'advanced' as const
    default: return 'secondary' as const
  }
}

export function ModuleCard({ module, isLocked, isPro, onLockedClick }: ModuleCardProps) {
  const navigate = useNavigate()
  const completionRate = module.totalCards > 0
    ? Math.round((module.studiedCards / module.totalCards) * 100)
    : 0

  const handleClick = () => {
    if (isLocked && !isPro && onLockedClick) {
      onLockedClick(module.book!)
    } else {
      navigate(`/card/${encodeURIComponent(module.moduleId)}`)
    }
  }

  // NCE lesson subtitle
  const subtitle = module.lessonTitle
    ? `Lesson ${module.lessonNum} · ${module.lessonTitle}`
    : module.lessonTitle

  return (
    <Card
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-md',
        isLocked && !isPro && 'opacity-75'
      )}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2 gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-gray-900 text-sm truncate">
                {module.title}
              </h3>
              {isLocked && !isPro && (
                <Lock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>
            )}
            {module.examDate && (
              <p className="text-xs text-gray-400 mt-0.5">
                {module.examDate} · {module.level}
              </p>
            )}
          </div>
          <Badge variant={difficultyVariant(module.difficulty)} className="shrink-0 text-xs">
            {module.difficulty}
          </Badge>
        </div>

        <Progress value={completionRate} className="h-1.5 mb-2" />

        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>{module.studiedCards}/{module.totalCards} 句</span>
          <span>{completionRate}%</span>
        </div>

        {module.level === 'NCE' && module.book && (
          <div className="mt-2 flex gap-1.5">
            <Badge variant="outline" className="text-xs">
              {module.book}
            </Badge>
            {module.book !== 'Book1' && module.book !== 'Book2' && (
              <Badge variant="outline" className="text-xs bg-gray-100">
                {isPro ? 'PRO' : '🔒 PRO'}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
