import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { isChunkLoadError, reloadForFreshChunks } from '@/lib/chunkRecovery'

function getErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown route error'
}

export function RouteErrorFallback() {
  const error = useRouteError()
  const chunkError = isChunkLoadError(error)

  const handleRefresh = () => {
    if (chunkError) {
      void reloadForFreshChunks()
      return
    }

    window.location.reload()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900">
          {chunkError ? '页面资源需要更新' : '页面暂时无法打开'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          {chunkError
            ? '应用刚刚更新过，请刷新后继续学习。'
            : '请刷新页面重试，或返回首页重新进入。'}
        </p>

        <div className="mt-6 grid gap-3">
          <Button type="button" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            刷新页面
          </Button>
          <Button type="button" variant="outline" onClick={() => { window.location.href = '/' }}>
            <Home className="h-4 w-4" aria-hidden="true" />
            返回首页
          </Button>
        </div>

        {!chunkError && (
          <p className="mt-4 break-words rounded-lg bg-gray-50 px-3 py-2 text-left text-xs leading-5 text-gray-400">
            {getErrorMessage(error)}
          </p>
        )}
      </div>
    </div>
  )
}

export function RouteLoadingFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <p className="text-sm">页面加载中...</p>
      </div>
    </div>
  )
}
