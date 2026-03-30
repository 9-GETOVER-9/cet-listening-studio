import { useEffect, useState } from 'react'
import { BookOpen, Lock } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { getNCEModulesByBook, isNCEBookAccessible, getModuleStats } from '@/db/crud'
import { ModuleCard } from '@/components/ModuleCard'
import type { Module, NCEBook } from '@/types'
import { useSettingsStore } from '@/store/settingsStore'

const BOOKS: { value: NCEBook; label: string }[] = [
  { value: 'Book1', label: 'Book 1' },
  { value: 'Book2', label: 'Book 2' },
  { value: 'Book3', label: 'Book 3' },
  { value: 'Book4', label: 'Book 4' },
]

export default function NCESelector() {
  const { isPro } = useSettingsStore()

  const [selectedBook, setSelectedBook] = useState<NCEBook>('Book1')
  const [modules, setModules] = useState<Module[]>([])
  const [moduleStats, setModuleStats] = useState<Record<string, { total: number; studied: number }>>({})
  const [loading, setLoading] = useState(true)
  const [showLockSheet, setShowLockSheet] = useState(false)
  const [lockedBook, setLockedBook] = useState<NCEBook>('Book3')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const mods = await getNCEModulesByBook(selectedBook)
        setModules(mods)
        const stats: Record<string, { total: number; studied: number }> = {}
        for (const m of mods) {
          const s = await getModuleStats(m.moduleId)
          stats[m.moduleId] = { total: s.total, studied: s.studied }
        }
        setModuleStats(stats)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedBook])

  const handleLockedClick = (book: NCEBook) => {
    setLockedBook(book)
    setShowLockSheet(true)
  }

  // 汇总统计
  const totalCards = Object.values(moduleStats).reduce((s, v) => s + v.total, 0)
  const studiedCards = Object.values(moduleStats).reduce((s, v) => s + v.studied, 0)
  const totalModules = modules.length
  const completedModules = Object.values(moduleStats).filter(
    (v) => v.total > 0 && v.studied === v.total
  ).length

  return (
    <div className="flex flex-col min-h-dvh">
      {/* 顶部标题 */}
      <div className="sticky top-0 z-10 bg-gray-50 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="h-5 w-5 text-purple-600" />
          <h1 className="text-xl font-bold text-gray-900">新概念英语</h1>
        </div>
        <p className="text-sm text-gray-500">
          {totalModules > 0
            ? `${completedModules}/${totalModules} 课已完成 · ${studiedCards}/${totalCards} 句已学`
            : '加载中...'}
        </p>
      </div>

      {/* 册数选择器 */}
      <div className="bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-medium text-gray-500 mb-2">选择册数</p>
        <ToggleGroup
          type="single"
          value={selectedBook}
          onValueChange={(v) => v && setSelectedBook(v as NCEBook)}
          className="justify-start"
        >
          {BOOKS.map(({ value, label }) => {
            const locked = !isNCEBookAccessible(value, isPro)
            return (
              <ToggleGroupItem
                key={value}
                value={value}
                className="flex-1 sm:flex-initial"
                disabled={locked}
              >
                {locked && <Lock className="h-3 w-3 mr-1" />}
                {label}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>

      {/* 课程列表 */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : modules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <BookOpen className="h-12 w-12 mb-3" />
            <p className="text-sm">暂无课程数据</p>
            <p className="text-xs mt-1">请检查数据是否正确导入</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modules.map((mod) => (
              <ModuleCard
                key={mod.moduleId}
                module={{
                  ...mod,
                  studiedCards: moduleStats[mod.moduleId]?.studied ?? 0,
                }}
                isLocked={!isNCEBookAccessible(mod.book!, isPro)}
                isPro={isPro}
                onLockedClick={handleLockedClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* PRO 锁定提示 Sheet */}
      <Sheet open={showLockSheet} onOpenChange={setShowLockSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-purple-600" />
              {lockedBook} 为 PRO 内容
            </SheetTitle>
            <SheetDescription>
              解锁新概念英语 Book 3 & Book 4 全部课程，获得更系统、更深入的英语学习体验。
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            <div className="rounded-lg bg-purple-50 p-4 text-sm text-purple-900">
              <p className="font-medium mb-2">PRO 会员权益</p>
              <ul className="space-y-1 text-xs">
                <li>✓ 新概念 Book 3 & Book 4 全量内容</li>
                <li>✓ 云端同步（多设备学习）</li>
                <li>✓ 难点本无上限</li>
                <li>✓ 长句合并训练</li>
                <li>✓ 导出难点本</li>
              </ul>
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700">
              开通 PRO
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setShowLockSheet(false)}>
              先学习免费内容
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
