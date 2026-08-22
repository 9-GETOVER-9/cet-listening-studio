import { Bookmark, Lock, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AIAnalysis } from '@/types'

const PRONUNCIATION_COLORS: Record<string, string> = {
  连读: 'bg-blue-100 text-blue-800',
  弱读: 'bg-purple-100 text-purple-800',
  失爆: 'bg-orange-100 text-orange-800',
  同化: 'bg-green-100 text-green-800',
  侵入音: 'bg-pink-100 text-pink-800',
}

interface AIPanelProps {
  analysis: AIAnalysis
  className?: string
  onBookmarkPhrase?: (phrase: string, meaning: string) => void
  isLocked?: boolean
  aiRemaining?: number
  onSignIn?: () => void
}

/**
 * AI 智能解析面板
 * 短语可一键收藏，发音和语法用于辅助理解句子
 */
export function AIPanel({
  analysis,
  className,
  onBookmarkPhrase,
  isLocked = false,
  aiRemaining = -1,
  onSignIn,
}: AIPanelProps) {
  const { phrases, pronunciation, grammar } = analysis

  if (isLocked) {
    return (
      <div className={className}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500">AI 智能解析</p>
          <Badge variant="outline" className="text-orange-500">
            <Lock className="mr-1 h-3 w-3" />
            已锁定
          </Badge>
        </div>

        <div className="rounded-lg bg-gradient-to-r from-gray-50 to-gray-100 p-6 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="mb-1 font-medium text-gray-700">今日 AI 解析次数已用完</p>
          <p className="mb-4 text-sm text-gray-500">每天签到可累计获得 5 次 AI 解析</p>
          {onSignIn ? <Button onClick={onSignIn} size="sm">每日签到</Button> : <p className="text-xs text-gray-400">请先签到</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">AI 智能解析</p>
        {aiRemaining >= 0 && (
          <Badge variant="outline" className="text-green-600">
            剩余 {aiRemaining} 次
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            短语标注
          </p>
          {phrases.length > 0 ? (
            <ul className="space-y-2">
              {phrases.map((item, index) => (
                <li key={index} className="group relative">
                  <span className="font-semibold text-gray-900">{item.phrase}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{item.meaning}</span>
                  {onBookmarkPhrase && (
                    <button
                      type="button"
                      className="absolute right-0 top-0 rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-brand opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        onBookmarkPhrase(item.phrase, item.meaning)
                      }}
                      aria-label="收藏这个短语"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">暂无短语标注</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            发音现象
          </p>
          {pronunciation.length > 0 ? (
            <ul className="space-y-2">
              {pronunciation.map((item, index) => (
                <li key={index} className="flex flex-col gap-1">
                  <Badge className={PRONUNCIATION_COLORS[item.type] ?? 'bg-gray-100 text-gray-800'}>
                    {item.type}
                  </Badge>
                  <code className="text-xs text-gray-700">{item.example}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">暂无发音标注</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            语法解析
          </p>
          {grammar.length > 0 ? (
            <ul className="space-y-2">
              {grammar.map((item, index) => (
                <li key={index}>
                  <span className="font-semibold text-gray-900">{item.structure}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{item.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">暂无语法解析</p>
          )}
        </div>
      </div>
    </div>
  )
}
