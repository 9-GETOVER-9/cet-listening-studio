import { useEffect, useState } from 'react'
import { initializeData } from '@/lib/dataLoader'
import { Progress } from '@/components/ui/progress'
import { Card } from '@/components/ui/card'

interface InitLoaderProps {
  onComplete: () => void
}

/**
 * 数据初始化组件
 * 首次启动时从 cards.json 加载数据到 IndexedDB
 */
export function InitLoader({ onComplete }: InitLoaderProps) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'loading' | 'error' | 'done'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        setStatus('loading')
        setProgress(0)

        await initializeData((loaded, total) => {
          setProgress(Math.round((loaded / total) * 100))
        })

        setProgress(100)
        setStatus('done')

        // 短暂显示完成状态
        setTimeout(() => {
          onComplete()
        }, 500)
      } catch (err) {
        console.error('Failed to initialize data:', err)
        setError(err instanceof Error ? err.message : '初始化失败')
        setStatus('error')
      }
    }

    init()
  }, [onComplete])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand">
              <span className="text-3xl">🎧</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">CET Listening Studio</h1>
          </div>

          {/* 进度显示 */}
          <div className="w-full space-y-2">
            {status === 'loading' && (
              <>
                <p className="text-center text-sm text-gray-500">
                  正在加载听力材料...
                </p>
                <Progress value={progress} className="h-2 w-full" />
                <p className="text-center text-xs text-gray-400">
                  {progress}%
                </p>
              </>
            )}

            {status === 'done' && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-sm font-medium text-green-600">
                  加载完成！
                </p>
                <div className="flex items-center gap-1 text-2xl">
                  <span>🎉</span>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-sm text-red-500">
                  加载失败
                </p>
                <p className="text-center text-xs text-gray-400">
                  {error}
                </p>
                <button
                  className="text-sm text-brand hover:underline"
                  onClick={() => window.location.reload()}
                >
                  点击重试
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 底部提示 */}
      {status !== 'error' && (
        <p className="mt-4 text-xs text-gray-400">
          首次加载需要下载听力材料，请保持网络连接
        </p>
      )}
    </div>
  )
}
