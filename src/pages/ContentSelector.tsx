import { useEffect, useState, useMemo, useReducer } from 'react'
import { liveQuery } from 'dexie'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { getCETModules } from '@/db/crud'
import type { Module } from '@/types'
import { usePro } from '@/hooks/usePro'
import { CET_CATALOG_BATCH_SIZE, cetCatalogReducer, filterCETCatalog, initialCETCatalog } from '@/lib/cetCatalog'

/**
 * 内容选择页
 * 三级筛选：考试日期 → Section → 题型
 * 模块卡片网格展示
 */
export default function ContentSelector() {
  const navigate = useNavigate()
  const { isPro: isProActive } = usePro()
  const [showProSheet, setShowProSheet] = useState(false)

  // 加载状态
  const [loading, setLoading] = useState(true)

  // 筛选条件
  const [catalog, updateCatalog] = useReducer(cetCatalogReducer, initialCETCatalog)
  const { filters } = catalog

  // 模块数据
  const [modules, setModules] = useState<Module[]>([])

  // 加载模块
  useEffect(() => {
    const subscription = liveQuery(() => getCETModules()).subscribe({
      next: (allModules) => {
        setModules(allModules)
        setLoading(false)
      },
      error: (error) => {
        console.error('Failed to load CET modules:', error)
        setLoading(false)
      },
    })

    return () => subscription.unsubscribe()
  }, [])

  // 获取所有可选的考试日期（去重）
  const examDates = useMemo(() => {
    const dates = modules
      .map((m) => m.examDate)
      .filter((d): d is string => Boolean(d))
    return [...new Set(dates)].sort().reverse()
  }, [modules])

  // 筛选后的模块
  const filteredModules = useMemo(() => filterCETCatalog(modules, filters), [modules, filters])
  const visibleModules = filteredModules.slice(0, catalog.visibleCount)
  const remainingCount = filteredModules.length - visibleModules.length
  const hasFilters = Object.values(filters).some(value => value !== 'all')

  // 难度 badge variant
  const getDifficultyVariant = (difficulty: string) => {
    switch (difficulty) {
      case 'basic': return 'basic' as const
      case 'medium': return 'medium' as const
      case 'hard': return 'hard' as const
      case 'advanced': return 'advanced' as const
      default: return 'secondary' as const
    }
  }

  // 状态标签
  const getStatusBadge = (module: Module) => {
    const rate = module.totalCards > 0 ? module.studiedCards / module.totalCards : 0

    if (module.studiedCards === 0) {
      return <Badge variant="not_started">未开始</Badge>
    } else if (rate < 1) {
      return <Badge variant="incomplete">进行中</Badge>
    } else {
      return <Badge variant="learned">已完成</Badge>
    }
  }

  const handleModuleClick = (module: Module) => {
    if (module.level === 'CET6' && !isProActive) {
      setShowProSheet(true)
      return
    }
    navigate(`/card/${encodeURIComponent(module.moduleId)}`)
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="quiet-page flex flex-col">
      {/* 标题 */}
      <div className="mb-6 border-b border-[var(--app-line)] pb-6">
        <p className="quiet-kicker mb-2">Exam Archive</p>
        <h1 className="quiet-display text-4xl md:text-5xl">四六级听力档案。</h1>
        <p className="mt-3 text-sm text-[var(--app-muted)]">
          按考试、年份或题型，找到今天要练的内容。
        </p>
      </div>

      {/* 筛选器 */}
      <div className="quiet-surface grid gap-5 p-4 md:grid-cols-2 md:p-6" aria-label="筛选听力课程">
        {/* 四六级选择 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">考试级别</p>
          <ToggleGroup
            type="single"
            value={filters.level}
            onValueChange={(value) => { if (value) updateCatalog({ type: 'filter', key: 'level', value }) }}
            aria-label="考试级别"
            className="justify-start"
          >
            <ToggleGroupItem value="all" className="flex-1 sm:flex-initial">
              全部
            </ToggleGroupItem>
            <ToggleGroupItem value="CET4" className="flex-1 sm:flex-initial">
              CET-4
            </ToggleGroupItem>
            <ToggleGroupItem value="CET6" className="flex-1 sm:flex-initial">
              CET-6
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* 考试日期 */}
        <label className="block space-y-2 text-xs font-medium text-[var(--app-muted)]">
          <span>考试日期</span>
          <select value={filters.examDate}
            onChange={event => updateCatalog({ type: 'filter', key: 'examDate', value: event.target.value })}
            className="min-h-11 w-full rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <option value="all">全部日期</option>
            {examDates.map(date => <option key={date} value={date}>{date}</option>)}
          </select>
        </label>

        {/* Section 选择 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">Section</p>
          <ToggleGroup
            type="single"
            value={filters.section}
            onValueChange={(value) => { if (value) updateCatalog({ type: 'filter', key: 'section', value }) }}
            aria-label="听力部分"
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value="all">全部</ToggleGroupItem>
            <ToggleGroupItem value="A">Section A</ToggleGroupItem>
            <ToggleGroupItem value="B">Section B</ToggleGroupItem>
            <ToggleGroupItem value="C">Section C</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* 题型选择 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">题型</p>
          <ToggleGroup
            type="single"
            value={filters.type}
            onValueChange={(value) => { if (value) updateCatalog({ type: 'filter', key: 'type', value }) }}
            aria-label="题型"
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value="all">全部</ToggleGroupItem>
            <ToggleGroupItem value="news">新闻</ToggleGroupItem>
            <ToggleGroupItem value="conversation">对话</ToggleGroupItem>
            <ToggleGroupItem value="passage">短文</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* 模块卡片列表 */}
      <div className="flex-1 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-[var(--app-muted)]">已显示 <strong className="font-semibold text-[var(--app-ink)]">{visibleModules.length}</strong> / {filteredModules.length} 个模块</p>
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => updateCatalog({ type: 'reset' })}>清除筛选</Button>}
        </div>
        {filteredModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Lock className="mb-2 h-12 w-12" />
            <p>没有找到匹配的模块</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleModules.map((module) => {
              const progress = module.totalCards > 0
                ? Math.round((module.studiedCards / module.totalCards) * 100)
                : 0

              return (
                <Card
                  key={module.moduleId}
                  className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  onClick={() => handleModuleClick(module)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${module.title || module.moduleId} · ${module.examDate ?? ''} · ${module.level}${module.level === 'CET6' && !isProActive ? ' · 解锁课程' : ''}`}
                  onKeyDown={event => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      if (!event.repeat) handleModuleClick(module)
                    }
                  }}
                >
                  <CardContent className="p-4">
                    {/* 标题行 */}
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">
                          {module.title || module.moduleId}
                        </h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {module.examDate ?? ''} · {module.level}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {module.level === 'CET6' && !isProActive && (
                          <Lock className="h-4 w-4 text-gray-400" />
                        )}
                        {getStatusBadge(module)}
                        <Badge variant={getDifficultyVariant(module.difficulty)}>
                          {module.difficulty}
                        </Badge>
                      </div>
                    </div>

                    {/* 进度条 */}
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>
                          {module.studiedCards}/{module.totalCards} 已学习
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    {/* 标签 */}
                    <div className="mt-3 flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        Section {module.section}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {module.type === 'news' ? '新闻' :
                         module.type === 'conversation' ? '对话' : '短文'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
        {remainingCount > 0 && <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => updateCatalog({ type: 'more', total: filteredModules.length })}>
            加载更多 · {Math.min(CET_CATALOG_BATCH_SIZE, remainingCount)} 个模块
          </Button>
        </div>}
      </div>

      <Sheet open={showProSheet} onOpenChange={setShowProSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-yellow-500" />
              CET-6 为 PRO 内容
            </SheetTitle>
            <SheetDescription>
              解锁四六级全部真题，系统提升听力水平。
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-900">
              <p className="font-medium mb-2">PRO 会员权益</p>
              <ul className="space-y-1 text-xs">
                <li>✓ CET-6 全部真题模块</li>
                <li>✓ 新概念 Book 3 & Book 4</li>
                <li>✓ 难点本无上限</li>
                <li>✓ 句子拼接无限次</li>
                <li>✓ AI 解析无限次</li>
              </ul>
            </div>
            <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white">
              开通 PRO
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setShowProSheet(false)}>
              先学习免费内容
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
