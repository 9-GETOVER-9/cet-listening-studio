import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export function AuthGuard({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !session.user.email_confirmed_at) {
        toast.error('请先完成邮箱确认后再进入 App')
        void supabase.auth.signOut()
      }

      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white">
            CET
          </div>
          <p className="text-sm text-gray-400">加载中...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
