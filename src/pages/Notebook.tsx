import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, MessageSquareText, ScrollText, Trash2, RotateCcw, Crown, Volume2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  getNotebookByType,
  deleteNotebookItem,
  getNotebookCountByType,
  getCard,
} from '@/db/crud'
import { usePro } from '@/hooks/usePro'
import type { NotebookItem, NotebookType } from '@/types'

const tabIcons: Record<NotebookType, React.ReactNode> = {
  phrase: <MessageSquareText className="h-3.5 w-3.5" />,
  vocabulary: <BookOpen className="h-3.5 w-3.5" />,
  pronunciation: <Volume2 className="h-3.5 w-3.5" />,
  terminology: <ScrollText className="h-3.5 w-3.5" />,
}

const TABS: { type: NotebookType; label: string; description: string }[] = [
  { type: 'phrase', label: '短语', description: '高频固定搭配' },
  { type: 'vocabulary', label: '词汇', description: '单词、专业术语' },
  { type: 'pronunciation', label: '发音', description: '连读、弱读、失爆等' },
  { type: 'terminology', label: '术语', description: '专业词汇解析' },
]

const PRO_LIMIT = 50

export default function Notebook() {
  const navigate = useNavigate()
  const { isPro } = usePro()

  const [items, setItems] = useState<NotebookItem[]>([])
  const [counts, setCounts] = useState<Record<NotebookType, number>>({
    phrase: 0, vocabulary: 0, pronunciation: 0, terminology: 0,
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<NotebookType>('phrase')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)
  const isAtLimit = !isPro && totalCount >= PRO_LIMIT

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const tabItems = await getNotebookByType(activeTab)
      setItems(tabItems)
      const newCounts: Record<NotebookType, number> = {
        phrase: await getNotebookCountByType('phrase'),
        vocabulary: await getNotebookCountByType('vocabulary'),
        pronunciation: await getNotebookCountByType('pronunciation'),
        terminology: await getNotebookCountByType('terminology'),
      }
      setCounts(newCounts)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (notebookId: string) => {
    try {
      await deleteNotebookItem(notebookId)
      setDeletingId(null)
      toast.success('已删除')
      loadData()
    } catch {
      toast.error('删除失败')
    }
  }

  // ✅ 修复问题5+6：跳转到具体卡片，并携带整个难点本队列
  const handleStartReview = async (startItem: NotebookItem, allItems: NotebookItem[]) => {
    // 构建整个难点本的卡片队列（按当前tab的顺序，从 startItem 开始循环）
    const startIdx = allItems.findIndex(i => i.notebookId === startItem.notebookId)
    const orderedItems = [
      ...allItems.slice(startIdx),
      ...allItems.slice(0, startIdx),
    ]

    // ✅ Promise.all 并行获取所有卡片
    const cardResults = await Promise.all(
      orderedItems.map(item => getCard(item.sourceCardId))
    )

    const queue: { notebookId: string; cardId: string; moduleId: string }[] = []
    orderedItems.forEach((item, i) => {
      const card = cardResults[i]
      if (card) {
        queue.push({
          notebookId: item.notebookId,
          cardId: card.cardId,
          moduleId: card.moduleId,
        })
      }
    })

    if (queue.length === 0) {
      toast.error('找不到对应卡片')
      return
    }

    // 跳转到第一个难点的卡片页，携带队列信息
    navigateToNotebookCard(queue, 0)
  }

  // ✅ 跳转到难点本队列中的第N个卡片（通过 location.state 传递队列）
  const navigateToNotebookCard = (
    queue: { notebookId: string; cardId: string; moduleId: string }[],
    index: number
  ) => {
    if (index >= queue.length) {
      toast.success('🎉 难点本复习完成！')
      navigate('/notebook')
      return
    }
    const { cardId, moduleId } = queue[index]
    navigate(`/card/${encodeURIComponent(moduleId)}?targetCardId=${cardId}`, {
      state: { notebookQueue: queue, currentIndex: index },
    })
  }

  // ✅ 修复问题5：点击↗跳转到该卡片的具体位置
  const handleJumpToSource = async (item: NotebookItem) => {
    const card = await getCard(item.sourceCardId)
    if (!card) {
      toast.error('找不到原句')
      navigate('/notebook')
      return
    }
    // 获取该卡片在模块中的索引
    const { getModuleCards } = await import('@/db/crud')
    const moduleCards = await getModuleCards(card.moduleId)
    const cardIndex = moduleCards.findIndex(c => c.cardId === card.cardId)
    const index = cardIndex >= 0 ? cardIndex : 0
    navigate(`/card/${encodeURIComponent(card.moduleId)}?index=${index}`)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-10 bg-gray-50 p-4 pb-0">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">难点收集本</h1>
            <p className="mt-1 text-sm text-gray-500">共 {totalCount} 条收藏</p>
          </div>
          {/* ✅ 修复问题6：专项复习改为从第一条开始连续复习 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (items.length === 0) {
                toast.info('当前分类暂无收藏')
                return
              }
              handleStartReview(items[0], items)
            }}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            开始复习
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NotebookType)}>
          <TabsList className="w-full">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.type} value={tab.type} className="flex-1 gap-1.5">
                {tabIcons[tab.type]}
                {tab.label}
                {counts[tab.type] > 0 && (
                  <Badge variant="secondary" className="ml-0.5">{counts[tab.type]}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((tab) => (
            <TabsContent key={tab.type} value={tab.type} className="mt-3">
              <p className="mb-3 text-sm text-gray-500">{tab.description}</p>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <BookOpen className="mb-2 h-12 w-12" />
                  <p>暂无收藏</p>
                  <p className="mt-1 text-sm">在听力卡片页点击收藏添加</p>
                </div>
              ) : isAtLimit ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Crown className="mb-3 h-12 w-12 text-yellow-500" />
                  <p className="font-medium text-gray-700">难点本已达上限</p>
                  <p className="mt-1 text-sm text-gray-500">免费版最多保存 {PRO_LIMIT} 条收藏</p>
                  <p className="mt-2 text-xs text-gray-400">升级Pro可解锁无限收藏</p>
                </div>
              ) : (
                <div className="space-y-3 pb-6">
                  {items.map((item) => (
                    <Card key={item.notebookId} className="transition-shadow hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="default">{TABS.find(t => t.type === item.type)?.label}</Badge>
                            {item.fsrsNotebook.reps > 0 && (
                              <Badge variant="outline" className="text-xs">已复习 {item.fsrsNotebook.reps} 次</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {deletingId === item.notebookId ? (
                              <div className="flex items-center gap-1">
                                <Button variant="destructive" size="sm" className="h-7 text-xs"
                                  onClick={() => handleDelete(item.notebookId)}>确认</Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs"
                                  onClick={() => setDeletingId(null)}>取消</Button>
                              </div>
                            ) : (
                              <>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-8 w-8 text-gray-400 hover:text-red-500"
                                  onClick={() => setDeletingId(item.notebookId)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                {/* ✅ 修复问题5：跳转到具体卡片位置 */}
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-8 w-8 text-gray-400 hover:text-brand"
                                  onClick={() => handleJumpToSource(item)}
                                  title="跳转到原始卡片"
                                >
                                  ↗
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        <p className="text-base font-semibold text-gray-900">{item.content}</p>

                        {item.exampleSentence && (
                          <div className="mt-2 rounded-lg bg-gray-50 p-2">
                            <p className="text-sm text-gray-600 italic">{item.exampleSentence}</p>
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-gray-400">来源：{item.sourceTag}</p>
                          {/* 单条复习入口 */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-brand"
                            onClick={() => handleStartReview(item, items)}
                          >
                            从这里开始复习
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}