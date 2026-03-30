import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Trash2, RotateCcw, ArrowLeft } from 'lucide-react'
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
import { getTodayDueNotebookItems, rateNotebookItem } from '@/lib/fsrs'
import type { NotebookItem, NotebookType } from '@/types'

const TABS: { type: NotebookType; label: string; description: string }[] = [
  { type: 'phrase', label: '短语', description: '高频固定搭配' },
  { type: 'vocabulary', label: '词汇', description: '单词、专业术语' },
  { type: 'pronunciation', label: '发音', description: '连读、弱读、失爆等' },
  { type: 'terminology', label: '术语', description: '专业词汇解析' },
]

export default function Notebook() {
  const navigate = useNavigate()
  const params = useParams()

  const reviewType = params.type as NotebookType | undefined
  const isReviewMode = !!reviewType

  const [items, setItems] = useState<NotebookItem[]>([])
  const [counts, setCounts] = useState<Record<NotebookType, number>>({
    phrase: 0,
    vocabulary: 0,
    pronunciation: 0,
    terminology: 0,
  })
  const [loading, setLoading] = useState(true)

  // 复习模式状态
  const [reviewItems, setReviewItems] = useState<NotebookItem[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)

  const [activeTab, setActiveTab] = useState<NotebookType>(reviewType || 'phrase')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (isReviewMode && reviewType) {
        const dueItems = await getTodayDueNotebookItems(reviewType)
        setReviewItems(dueItems)
        if (dueItems.length === 0) toast.info('今日没有需要复习的内容')
      } else {
        const tabItems = await getNotebookByType(activeTab)
        setItems(tabItems)
      }

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
  }, [activeTab, isReviewMode, reviewType])

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

  const handleJumpToSource = async (item: NotebookItem) => {
    const card = await getCard(item.sourceCardId)
    if (card) {
      navigate(`/card/${encodeURIComponent(card.moduleId)}`)
    } else {
      toast.error('找不到原句')
    }
  }

  // 复习模式
  if (isReviewMode) {
    const currentReviewItem = reviewItems[reviewIndex]

    if (loading) {
      return (
        <div className="flex min-h-dvh flex-col p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
      )
    }

    if (!currentReviewItem) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center p-4">
          <BookOpen className="mb-4 h-16 w-16 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">今日没有需要复习的内容</p>
          <Button variant="outline" onClick={() => navigate('/notebook')} className="mt-4">返回难点本</Button>
        </div>
      )
    }

    return (
      <div className="flex min-h-dvh flex-col">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/notebook')}>
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </Button>
          <Badge variant="outline">{reviewIndex + 1} / {reviewItems.length}</Badge>
          <div />
        </div>

        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Card className="cursor-pointer" onClick={() => setIsFlipped(f => !f)}>
              <CardContent className="flex flex-col items-center justify-center p-8 min-h-[200px]">
                {!isFlipped ? (
                  <>
                    <Badge className="mb-4">
                      {TABS.find(t => t.type === currentReviewItem.type)?.label}
                    </Badge>
                    <p className="text-2xl font-bold text-gray-900">{currentReviewItem.content}</p>
                    <p className="mt-4 text-sm text-gray-500">点击查看详情</p>
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-lg font-semibold text-gray-900">{currentReviewItem.content}</p>
                    <div className="w-full rounded-lg bg-gray-50 p-4">
                      <p className="text-sm text-gray-600 italic">{currentReviewItem.exampleSentence}</p>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">来源：{currentReviewItem.sourceTag}</p>
                  </>
                )}
              </CardContent>
            </Card>

            {isFlipped && (
              <div className="mt-4">
                <p className="mb-2 text-center text-sm text-gray-500">请选择记忆难度：</p>
                <div className="flex gap-2">
                  <Button onClick={() => rateNotebookItem(currentReviewItem.notebookId, 1).then(() => {
                    if (reviewIndex < reviewItems.length - 1) { setReviewIndex(i => i + 1); setIsFlipped(false) }
                    else { toast.success('复习完成！'); navigate('/notebook') }
                  })} className="flex-1 bg-red-500 hover:bg-red-600">重来</Button>
                  <Button onClick={() => rateNotebookItem(currentReviewItem.notebookId, 2).then(() => {
                    if (reviewIndex < reviewItems.length - 1) { setReviewIndex(i => i + 1); setIsFlipped(false) }
                    else { toast.success('复习完成！'); navigate('/notebook') }
                  })} className="flex-1 bg-yellow-500 hover:bg-yellow-600">困难</Button>
                  <Button onClick={() => rateNotebookItem(currentReviewItem.notebookId, 3).then(() => {
                    if (reviewIndex < reviewItems.length - 1) { setReviewIndex(i => i + 1); setIsFlipped(false) }
                    else { toast.success('复习完成！'); navigate('/notebook') }
                  })} className="flex-1 bg-blue-500 hover:bg-blue-600">掌握</Button>
                  <Button onClick={() => rateNotebookItem(currentReviewItem.notebookId, 4).then(() => {
                    if (reviewIndex < reviewItems.length - 1) { setReviewIndex(i => i + 1); setIsFlipped(false) }
                    else { toast.success('复习完成！'); navigate('/notebook') }
                  })} className="flex-1 bg-green-500 hover:bg-green-600">简单</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 普通模式
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-10 bg-gray-50 p-4 pb-0">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">难点收集本</h1>
            <p className="mt-1 text-sm text-gray-500">共 {totalCount} 条收藏</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/notebook/review/${activeTab}`)}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            专项复习
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NotebookType)}>
          <TabsList className="w-full">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.type} value={tab.type} className="flex-1">
                {tab.label}
                {counts[tab.type] > 0 && (
                  <Badge variant="secondary" className="ml-1">{counts[tab.type]}</Badge>
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
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <Card key={item.notebookId} className="transition-shadow hover:shadow-md">
                      <CardContent className="p-4">
                        {/* 头部 */}
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
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleDelete(item.notebookId)}
                                >
                                  确认
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setDeletingId(null)}
                                >
                                  取消
                                </Button>
                              </div>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-400 hover:text-red-500"
                                  onClick={() => setDeletingId(item.notebookId)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-400 hover:text-brand"
                                  onClick={() => handleJumpToSource(item)}
                                >
                                  ↗
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 内容 */}
                        <p className="text-base font-semibold text-gray-900">{item.content}</p>

                        {/* 例句 */}
                        {item.exampleSentence && (
                          <div className="mt-2 rounded-lg bg-gray-50 p-2">
                            <p className="text-sm text-gray-600 italic">{item.exampleSentence}</p>
                          </div>
                        )}

                        {/* 来源 */}
                        <p className="mt-2 text-xs text-gray-400">来源：{item.sourceTag}</p>
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
