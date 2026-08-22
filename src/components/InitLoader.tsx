import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { initializeData, setRetryProgressCallback } from '@/lib/dataLoader'

interface InitLoaderProps {
  onComplete: () => void
  overlay?: boolean
  progress?: number
  autoStart?: boolean
  error?: string | null
}

const FUN_FACTS = [
  '\u{1F4A1} \u82F1\u8BED\u542C\u529B\u4E2D\uFF0C\u7EA6 80% \u7684\u65E5\u5E38\u5BF9\u8BDD\u53EA\u7528\u5230 2000 \u4E2A\u6838\u5FC3\u8BCD\u6C47',
  '\u{1F3AF} \u8FDE\u8BFB\u548C\u5F31\u8BFB\u662F\u542C\u529B\u7406\u89E3\u7684\u6700\u5927\u969C\u788D\uFF0C\u4E5F\u662F\u63D0\u5206\u7684\u5173\u952E',
  '\u{1F4CA} \u7814\u7A76\u8868\u660E\uFF0C\u6BCF\u5929 15 \u5206\u949F\u7CBE\u542C\u6BD4 1 \u5C0F\u65F6\u6CDB\u542C\u66F4\u6709\u6548',
  '\u{1F9E0} \u7761\u524D\u542C\u529B\u7EC3\u4E60\u7684\u8BB0\u5FC6\u7559\u5B58\u7387\u6BD4\u767D\u5929\u9AD8 20%',
  '\u{1F3A7} \u5148\u542C 3 \u904D\u518D\u770B\u539F\u6587\uFF0C\u6BD4\u8FB9\u542C\u8FB9\u770B\u6548\u679C\u597D 3 \u500D',
  '\u2728 \u56DB\u516D\u7EA7\u542C\u529B\u5360\u603B\u5206 35%\uFF0C\u662F\u6027\u4EF7\u6BD4\u6700\u9AD8\u7684\u63D0\u5206\u9879',
  '\u{1F524} \u82F1\u8BED\u4E2D\u6700\u5E38\u89C1\u7684\u5355\u8BCD\u662F "the"\uFF0C\u5360\u6240\u6709\u6587\u672C\u7684 7%',
  '\u{1F4DD} \u505A\u542C\u529B\u65F6\u5148\u770B\u9009\u9879\uFF0C\u80FD\u63D0\u9AD8\u6B63\u786E\u7387 15-20%',
  '\u{1F30D} \u5168\u7403\u6709 15 \u4EBF\u4EBA\u5728\u5B66\u82F1\u8BED\uFF0C\u4F60\u4E0D\u662F\u4E00\u4E2A\u4EBA\u5728\u6218\u6597',
  '\u26A1 \u7CBE\u542C\u4E00\u7BC7\u6587\u7AE0 5 \u904D\uFF0C\u80DC\u8FC7\u6CDB\u542C 50 \u7BC7',
]

function getStatusText(progress: number, retryInfo: string, stalled: boolean): string {
  if (retryInfo) return retryInfo
  if (stalled) return '\u52A0\u8F7D\u4F3C\u4E4E\u5361\u4F4F\u4E86\uFF0C\u8BF7\u5C1D\u8BD5\u5237\u65B0\u9875\u9762'
  if (progress === 0) return '\u51C6\u5907\u4E2D...'
  if (progress < 15) return '\u6B63\u5728\u51C6\u5907\u8BFE\u7A0B\u7D22\u5F15...'
  if (progress < 90) return '\u6B63\u5728\u5199\u5165\u672C\u5730\u6570\u636E\u5E93...'
  if (progress < 100) return '\u6B63\u5728\u6574\u7406\u6A21\u5757\u7D22\u5F15...'
  return '\u5373\u5C06\u5B8C\u6210...'
}

function easeProgress(raw: number): number {
  if (raw <= 50) return Math.round((raw / 50) * 30)
  return Math.round(30 + ((raw - 50) / 50) * 70)
}

export function InitLoader({
  onComplete,
  overlay,
  progress: externalProgress,
  autoStart = false,
  error: externalError,
}: InitLoaderProps) {
  const [internalProgress, setInternalProgress] = useState(0)
  const [internalStatus, setInternalStatus] = useState<'loading' | 'error' | 'done'>('loading')
  const [internalError, setInternalError] = useState<string | null>(null)
  const [retryInfo, setRetryInfo] = useState('')
  const [stalled, setStalled] = useState(false)
  const [factIndex, setFactIndex] = useState(0)
  const [factFading, setFactFading] = useState(false)
  const lastProgressRef = useRef(0)
  const lastChangeRef = useRef(0)
  const completionScheduledRef = useRef(false)

  const rawProgress = externalProgress ?? internalProgress
  const error = externalError ?? internalError
  const status: 'loading' | 'error' | 'done' = error
    ? 'error'
    : autoStart
      ? internalStatus
      : externalProgress !== undefined && externalProgress >= 100
        ? 'done'
        : 'loading'
  useEffect(() => {
    if (status !== 'loading') return

    const timer = window.setInterval(() => {
      setFactFading(true)
      window.setTimeout(() => {
        setFactIndex((prev) => (prev + 1) % FUN_FACTS.length)
        setFactFading(false)
      }, 300)
    }, 6000)

    return () => window.clearInterval(timer)
  }, [status])

  useEffect(() => {
    if (status !== 'done') {
      completionScheduledRef.current = false
      return
    }

    if (completionScheduledRef.current) return

    completionScheduledRef.current = true
    const timer = window.setTimeout(() => onComplete(), 800)
    return () => window.clearTimeout(timer)
  }, [onComplete, status])

  useEffect(() => {
    if (rawProgress !== lastProgressRef.current) {
      lastProgressRef.current = rawProgress
      lastChangeRef.current = Date.now()
      const frame = window.requestAnimationFrame(() => setStalled(false))
      return () => window.cancelAnimationFrame(frame)
    }
  }, [rawProgress])

  useEffect(() => {
    if (status !== 'loading') return

    const timer = window.setInterval(() => {
      const isStalled = rawProgress > 0
        && rawProgress < 100
        && Date.now() - lastChangeRef.current > 45_000
      setStalled(isStalled)
    }, 5000)

    return () => window.clearInterval(timer)
  }, [rawProgress, status])

  useEffect(() => {
    if (!autoStart) return

    setRetryProgressCallback((attempt, total) => {
      if (attempt > 0 && total > 0) {
        setRetryInfo(`\u7F51\u7EDC\u4E0D\u7A33\u5B9A\uFF0C\u6B63\u5728\u91CD\u8BD5 (${attempt}/${total})...`)
      }
    })

    const init = async () => {
      try {
        await initializeData((loaded, total) => {
          setInternalProgress(Math.round((loaded / total) * 100))
        })

        setInternalProgress(100)
        setInternalStatus('done')
      } catch (err) {
        console.error('Failed to initialize data:', err)
        setInternalError(err instanceof Error ? err.message : '\u521D\u59CB\u5316\u5931\u8D25')
        setInternalStatus('error')
      }
    }

    void init()
  }, [autoStart])

  const displayProgress = status === 'done' ? 100 : easeProgress(rawProgress)

  if (overlay) {
    const overlayText = rawProgress < 15
      ? '\u6B63\u5728\u51C6\u5907\u8BFE\u7A0B\u7D22\u5F15\uFF08\u9996\u6B21\u52A0\u8F7D\uFF0C\u8BF7\u7A0D\u5019\uFF09'
      : rawProgress < 90
        ? `\u6B63\u5728\u5199\u5165\u672C\u5730\u6570\u636E\u5E93... ${displayProgress}%`
        : `\u5373\u5C06\u5B8C\u6210... ${displayProgress}%`

    return (
      <div className="fixed left-0 right-0 top-0 z-50">
        <div className="bg-blue-600/90 px-4 py-2 text-white">
          <div className="flex items-center justify-between text-xs">
            <span>{overlayText}</span>
            <span>{displayProgress}%</span>
          </div>
          <Progress
            className="mt-1 h-1.5 bg-white/20 [&>div]:bg-white [&>div]:transition-all [&>div]:duration-700 [&>div]:ease-out"
            value={displayProgress}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-brand transition-transform duration-700 ${
                status === 'loading' ? 'animate-pulse' : ''
              } ${status === 'done' ? 'scale-110' : ''}`}
            >
              <span className="text-3xl">{status === 'done' ? '\u{1F389}' : '\u{1F3A7}'}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">CET Listening Studio</h1>
          </div>

          <div className="w-full space-y-3">
            {status === 'loading' && (
              <>
                <p className="text-center text-sm leading-relaxed text-gray-600">
                  {getStatusText(rawProgress, retryInfo, stalled)}
                </p>
                <Progress
                  className="h-2.5 w-full [&>div]:transition-all [&>div]:duration-700 [&>div]:ease-out"
                  value={displayProgress}
                />
                <p className="text-center text-xs text-gray-400">{displayProgress}%</p>

                {retryInfo && (
                  <p className="text-center text-xs text-orange-500">{retryInfo}</p>
                )}
                {stalled && (
                  <button
                    className="mx-auto block text-sm text-brand hover:underline"
                    onClick={() => window.location.reload()}
                    type="button"
                  >
                    {'\u70B9\u51FB\u5237\u65B0\u9875\u9762'}
                  </button>
                )}

                <div className="mt-2 min-h-[3rem] rounded-lg bg-blue-50 px-3 py-2">
                  <p
                    className={`text-center text-xs leading-relaxed text-blue-700 transition-opacity duration-300 ${
                      factFading ? 'opacity-0' : 'opacity-100'
                    }`}
                  >
                    {FUN_FACTS[factIndex]}
                  </p>
                </div>
              </>
            )}

            {status === 'done' && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-sm font-medium text-green-600">
                  {'\u52A0\u8F7D\u5B8C\u6210\uFF0C\u51C6\u5907\u5F00\u59CB\u5B66\u4E60\uFF01'}
                </p>
                <p className="text-center text-xs text-gray-400">
                  {'课程索引已就绪'}
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-sm text-red-500">{'\u52A0\u8F7D\u5931\u8D25'}</p>
                <p className="text-center text-xs text-gray-500">
                  {'\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u540E\u5237\u65B0\u9875\u9762\u91CD\u8BD5'}
                </p>
                <p className="text-center text-xs text-gray-400">{error}</p>
                <button
                  className="text-sm text-brand hover:underline"
                  onClick={() => window.location.reload()}
                  type="button"
                >
                  {'\u70B9\u51FB\u5237\u65B0\u9875\u9762'}
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {status === 'loading' && rawProgress < 15 && (
        <p className="mt-4 max-w-xs text-center text-xs leading-relaxed text-gray-400">
          {'首次打开会先加载课程索引，完整练习数据将在后台继续同步。'}
          <br />
          {'\u5B8C\u6210\u540E\u4E0B\u6B21\u6253\u5F00\u65E0\u9700\u7B49\u5F85\u3002'}
        </p>
      )}

      {status === 'loading' && rawProgress >= 15 && rawProgress < 90 && (
        <p className="mt-4 max-w-xs text-center text-xs leading-relaxed text-gray-400">
          {'\u6B63\u5728\u5C06\u6570\u636E\u5B58\u5165\u672C\u5730\uFF0C\u4E0B\u6B21\u6253\u5F00\u79D2\u8FDB \u26A1'}
        </p>
      )}
    </div>
  )
}
