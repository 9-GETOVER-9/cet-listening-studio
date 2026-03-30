import { Bookmark } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AIAnalysis } from '@/types'

const PRONUNCIATION_COLORS: Record<string, string> = {
  '连读': 'bg-blue-100 text-blue-800',
  '弱读': 'bg-purple-100 text-purple-800',
  '失爆': 'bg-orange-100 text-orange-800',
  '同化': 'bg-green-100 text-green-800',
  '侵入音': 'bg-pink-100 text-pink-800',
}

interface AIPanelProps {
  analysis: AIAnalysis
  className?: string
  onBookmarkPhrase?: (phrase: string, meaning: string) => void
}

/**
 * AI 智能解析面板
 * 短语可一键收藏，发音/语法可点击收藏
 */
export function AIPanel({ analysis, className, onBookmarkPhrase }: AIPanelProps) {
  const { phrases, pronunciation, grammar } = analysis

  return (
    <div className={className}>
      <p className="mb-3 text-sm font-medium text-gray-500">AI 智能解析</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 短语标注（可收藏） */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            短语标注
          </p>
          {phrases.length > 0 ? (
            <ul className="space-y-2">
              {phrases.map((p, i) => (
                <li key={i} className="group relative">
                  <span className="font-semibold text-gray-900">{p.phrase}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{p.meaning}</span>
                  {onBookmarkPhrase && (
                    <button
                      className="absolute right-0 top-0 hidden rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-brand group-hover:block"
                      onClick={(e) => {
                        e.stopPropagation()
                        onBookmarkPhrase(p.phrase, p.meaning)
                      }}
                      title="收藏此短语"
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

        {/* 发音现象 */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            发音现象
          </p>
          {pronunciation.length > 0 ? (
            <ul className="space-y-2">
              {pronunciation.map((p, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <Badge className={PRONUNCIATION_COLORS[p.type] ?? 'bg-gray-100 text-gray-800'}>
                    {p.type}
                  </Badge>
                  <code className="text-xs text-gray-700">{p.example}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">暂无发音标注</p>
          )}
        </div>

        {/* 语法解析 */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            语法解析
          </p>
          {grammar.length > 0 ? (
            <ul className="space-y-2">
              {grammar.map((g, i) => (
                <li key={i}>
                  <span className="font-semibold text-gray-900">{g.structure}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{g.note}</span>
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
