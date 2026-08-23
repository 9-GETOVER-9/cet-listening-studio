import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getOrCreateDeviceSessionId } from '@/lib/sessionPolicy'

const SESSION_CHECK_INTERVAL = 30_000 // 30秒轮询一次

/**
 * 单设备登录守卫
 * - 登录时把当前 sessionId 写入 profiles.active_session_id
 * - 定期轮询检查 active_session_id 是否和自己一致
 * - 不一致时调用 onKicked 回调（弹窗 + 强制登出）
 */
export function useSessionGuard(
  userId: string | null,
  onKicked: () => void,
) {
  const sessionIdRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const kickedRef = useRef(false)

  // 注册当前设备的 session
  const registerSession = useCallback(async (uid: string) => {
    const sessionId = getOrCreateDeviceSessionId()
    sessionIdRef.current = sessionId
    kickedRef.current = false

    await supabase
      .from('profiles')
      .update({ active_session_id: sessionId })
      .eq('id', uid)
  }, [])

  // 检查是否被踢
  const checkSession = useCallback(async (uid: string) => {
    if (kickedRef.current) return

    const { data, error } = await supabase
      .from('profiles')
      .select('active_session_id')
      .eq('id', uid)
      .single()

    if (error || !data) return

    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return

    // 如果服务端的 session ID 和自己的不一致，说明被新设备踢了
    if (data.active_session_id && data.active_session_id !== currentSessionId) {
      kickedRef.current = true
      onKicked()
    }
  }, [onKicked])

  useEffect(() => {
    if (!userId) {
      // 未登录，清理轮询
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      sessionIdRef.current = null
      return
    }

    // 登录后注册 session 并开始轮询
    void registerSession(userId)

    intervalRef.current = setInterval(() => {
      void checkSession(userId)
    }, SESSION_CHECK_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [userId, registerSession, checkSession])
}
