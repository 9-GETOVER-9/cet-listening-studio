import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Filter } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Skeleton } from '@/components/ui/skeleton'
import { getAllModules, getModuleStats } from '@/db/crud'
import type { Module } from '@/types'
import { cn } from '@/lib/utils'

/**
 * 内容选择页
 * 三级筛选：考试日期 → Section → 题型
 * 模块卡片网格展示
 */
export default function ContentSelector() {
  const navigate = useNavigate()

  // 加载状态
  const [loading, setLoading] = useState(true)

  // 筛选条件
  const [selectedLevel, setSelectedLevel] = useState<'CET4' | 'CET6' | 'all'>('all')
  const [selectedExamDate, setSelectedExamDate] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')

  // 模块数据
  const [modules, setModules] = useState<Module[]>([])
  const [moduleStats, setModuleStats] = useState<Record<string, { total: number; studied: number }>>({})

  // 加载模块
  useEffect(() => {
    const loadModules = async () => {
      try {
        const allModules = await getAllModules()
        setModules(allModules)

        // 加载每个模块的统计
        const stats: Record<string, { total: number; studied: number }> = {}
        for (const m of allModules) {
          const stat = await getModuleStats(m.moduleId)
          stats[m.moduleId] = { total: stat.total, studied: stat.studied }
        }
        setModuleStats(stats)
      } finally {
        setLoading(false)
      }
    }

    loadModules()
  }, [])

  // 获取所有可选的考试日期（去重）
  const examDates = useMemo(() => {
    const dates = modules
      .map((m) => m.examDate)
      .filter((d): d is string => d !== undefined)
    return [...new Set(dates)].sort().reverse()
  }, [modules])

  // 筛选后的模块
  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      if (selectedLevel !== 'all' && m.level !== selectedLevel) return false
      if (selectedExamDate !== 'all' && m.examDate !== selectedExamDate) return false
      if (selectedSection !== 'all' && m.section !== selectedSection) return false
      if (selectedType !== 'all' && m.type !== selectedType) return false
      return true
    })
  }, [modules, selectedLevel, selectedExamDate, selectedSection, selectedType])

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
  const getStatusBadge = (moduleId: string) => {
    const stat = moduleStats[moduleId]
    if (!stat) return null

    const rate = stat.total > 0 ? stat.studied / stat.total : 0
    if (stat.studied === 0) {
      return <Badge variant="not_started">未开始</Badge>
    } else if (rate < 1) {
      return <Badge variant="incomplete">进行中</Badge>
    } else {
      return <Badge variant="learned">已完成</Badge>
    }
  }

  const handleModuleClick = (module: Module) => {
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
    <div className="flex flex-col">
      {/* 标题 */}
      <div className="sticky top-0 z-10 bg-gray-50 p-4 pb-2">
        <h1 className="text-xl font-bold text-gray-900">选择学习内容</h1>
        <p className="mt-1 text-sm text-gray-500">
          {filteredModules.length} 个模块可用
        </p>
      </div>

      {/* 筛选器 */}
      <div className="space-y-3 bg-white p-4 shadow-sm">
        {/* 四六级选择 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">考试级别</p>
          <ToggleGroup
            type="single"
            value={selectedLevel}
            onValueChange={(v) => v && setSelectedLevel(v as 'CET4' | 'CET6' | 'all')}
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
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">考试日期</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedExamDate('all')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedExamDate === 'all'
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              全部
            </button>
            {examDates.slice(0, 6).map((date) => (
              <button
                key={date}
                onClick={() => setSelectedExamDate(date)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  selectedExamDate === date
                    ? 'bg-brand text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {date}
              </button>
            ))}
          </div>
        </div>

        {/* Section 选择 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">Section</p>
          <ToggleGroup
            type="single"
            value={selectedSection}
            onValueChange={(v) => v && setSelectedSection(v)}
            className="justify-start"
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
            value={selectedType}
            onValueChange={(v) => v && setSelectedType(v)}
            className="justify-start"
          >
            <ToggleGroupItem value="all">全部</ToggleGroupItem>
            <ToggleGroupItem value="news">新闻</ToggleGroupItem>
            <ToggleGroupItem value="conversation">对话</ToggleGroupItem>
            <ToggleGroupItem value="passage">短文</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* 模块卡片列表 */}
      <div className="flex-1 overflow-auto p-4">
        {filteredModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Filter className="mb-2 h-12 w-12" />
            <p>没有找到匹配的模块</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredModules.map((module) => {
              const stat = moduleStats[module.moduleId] || { total: 0, studied: 0 }
              const progress = stat.total > 0 ? Math.round((stat.studied / stat.total) * 100) : 0

              return (
                <Card
                  key={module.moduleId}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => handleModuleClick(module)}
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
                        {getStatusBadge(module.moduleId)}
                        <Badge variant={getDifficultyVariant(module.difficulty)}>
                          {module.difficulty}
                        </Badge>
                      </div>
                    </div>

                    {/* 进度条 */}
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>
                          {stat.studied}/{stat.total} 已学习
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
      </div>
    </div>
  )
}
