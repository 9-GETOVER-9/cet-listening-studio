import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

/**
 * 认证守卫组件
 * 未登录用户重定向到 /login
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand">
            <span className="text-xl">🎧</span>
          </div>
          <p className="text-sm text-gray-400">加载中...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
