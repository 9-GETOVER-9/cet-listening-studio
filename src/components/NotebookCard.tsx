import { ArrowUpRight, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NotebookItem } from '@/types'

interface NotebookCardProps {
  item: NotebookItem
  onJumpToSource?: () => void
  onDelete?: () => void
  deleteConfirming?: boolean
  onCancelDelete?: () => void
  className?: string
}

// 类型标签配置
const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  phrase: { label: '短语', className: 'bg-brand-light text-brand' },
  vocabulary: { label: '词汇', className: 'bg-purple-100 text-purple-800' },
  pronunciation: { label: '发音', className: 'bg-green-100 text-green-800' },
}

export function NotebookCard({
  item,
  onJumpToSource,
  onDelete,
  deleteConfirming,
  onCancelDelete,
  className,
}: NotebookCardProps) {
  const typeConfig = TYPE_CONFIG[item.type] ?? { label: item.type, className: 'bg-gray-100 text-gray-800' }

  return (
    <Card className={cn('transition-shadow hover:shadow-md', className)}>
      <CardContent className="p-4">
        {/* 头部：类型标签 + 操作按钮 */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge className={typeConfig.className}>{typeConfig.label}</Badge>
            {item.fsrsNotebook.reps > 0 && (
              <Badge variant="outline" className="text-xs">
                已复习 {item.fsrsNotebook.reps} 次
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {deleteConfirming ? (
              <>
                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onDelete}>
                  确认
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancelDelete}>
                  取消
                </Button>
              </>
            ) : (
              <>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-500"
                    onClick={(e) => { e.stopPropagation(); onDelete() }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {onJumpToSource && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-brand"
                    onClick={(e) => { e.stopPropagation(); onJumpToSource() }}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 内容 */}
        <div className="mb-2">
          <p className="text-base font-semibold text-gray-900">{item.content}</p>
        </div>

        {/* 例句 */}
        {item.exampleSentence && (
          <div className="rounded-lg bg-gray-50 p-2">
            <p className="text-sm text-gray-600 italic">{item.exampleSentence}</p>
          </div>
        )}

        {/* 来源标签 */}
        <div className="mt-3">
          <p className="text-xs text-gray-400">来源：{item.sourceTag}</p>
        </div>
      </CardContent>
    </Card>
  )
}
