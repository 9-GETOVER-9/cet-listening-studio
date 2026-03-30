import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { getTodayReviewCount, getTodayStudiedCount } from '@/db/crud'

interface DailyTaskCardProps {
  className?: string
}

/**
 * 今日任务卡片
 * 显示今日待复习数量和进度
 * 全部完成时显示庆祝动画
 */
export function DailyTaskCard({ className = '' }: DailyTaskCardProps) {
  const [total, setTotal] = useState(0)
  const [studied, setStudied] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [t, s] = await Promise.all([
          getTodayReviewCount(),
          getTodayStudiedCount(),
        ])
        setTotal(t)
        setStudied(s)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const remaining = Math.max(0, total - studied)
  const progress = total > 0 ? Math.min(100, (studied / total) * 100) : 0
  const isComplete = remaining === 0 && total > 0

  const getMessage = () => {
    if (loading) return '加载中...'
    if (total === 0) return '今日没有待复习的卡片'
    if (isComplete) return '太棒了！今日任务全部完成 🎉'
    if (studied === 0) return `今日待复习 ${remaining} 张`
    return `再复习 ${remaining} 张就完成了`
  }

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardContent className="p-4">
        {/* 标题 */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">今日任务</h3>
          {total > 0 && (
            <span className="text-sm text-gray-500">
              {studied} / {total}
            </span>
          )}
        </div>

        {/* 进度条 */}
        {total > 0 && (
          <>
            <Progress value={progress} className="h-2.5" />

            {/* 鼓励文案 */}
            <p
              className={`mt-2 text-sm ${
                isComplete ? 'font-medium text-green-600' : 'text-gray-500'
              }`}
            >
              {getMessage()}
            </p>
          </>
        )}

        {total === 0 && !loading && (
          <p className="text-sm text-gray-400">{getMessage()}</p>
        )}

        {/* 庆祝动画 */}
        <AnimatePresence>
          {isComplete && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="mt-4 flex flex-col items-center"
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, -5, 5, 0],
                }}
                transition={{
                  duration: 0.5,
                  repeat: 2,
                  repeatDelay: 1,
                }}
              >
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-2 text-lg font-bold text-green-600"
              >
                今日学习完成！
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 刷新按钮 */}
        {!isComplete && total > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => window.location.reload()}
          >
            刷新进度
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
