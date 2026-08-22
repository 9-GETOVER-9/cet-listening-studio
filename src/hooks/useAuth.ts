import { useState, useEffect, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useSettingsStore } from '@/store/settingsStore'

const AUTH_TIMEOUT_MS = 15_000
const PROFILE_SYNC_TIMEOUT_MS = 8_000
const REGISTRATION_OTP_TYPES = ['email', 'signup', 'magiclink'] as const

function normalizeAuthError(error: unknown, message: string): unknown {
  if (!(error instanceof Error)) return error

  const lowerMessage = error.message.toLowerCase()
  const isNetworkError =
    error.name === 'AbortError' ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('networkerror') ||
    lowerMessage.includes('network request failed') ||
    lowerMessage.includes('supabase 请求超时')

  if (isNetworkError) {
    return new Error(`${message}失败：无法连接 Supabase，请检查网络、代理或 Supabase 配置`)
  }

  return error
}

function withAuthTimeout<T>(
  operation: PromiseLike<T>,
  message: string,
  timeoutMs = AUTH_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${message}超时，请检查网络或 Supabase 配置`))
    }, timeoutMs)

    operation.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(normalizeAuthError(error, message))
      },
    )
  })
}

async function syncUserStateAfterAuth(
  user: User,
  email: string,
  loadUserState: (userId: string, emailConfirmed?: boolean) => Promise<void>,
  checkDeveloperPro: (email: string) => void,
): Promise<void> {
  try {
    await withAuthTimeout(
      loadUserState(user.id, Boolean(user.email_confirmed_at)),
      '同步账号状态',
      PROFILE_SYNC_TIMEOUT_MS,
    )
  } catch (error) {
    console.warn('User state sync after auth failed; continuing with auth session:', error)
  } finally {
    checkDeveloperPro(email)
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const checkDeveloperPro = useSettingsStore((s) => s.checkDeveloperPro)
  const loadUserState = useSettingsStore((s) => s.loadUserState)

  useEffect(() => {
    withAuthTimeout(supabase.auth.getSession(), '读取登录状态').then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)

      if (s?.user) {
        void syncUserStateAfterAuth(s.user, s.user.email ?? '', loadUserState, checkDeveloperPro)
      }
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s)
        setUser(s?.user ?? null)

        if (s?.user) {
          void syncUserStateAfterAuth(s.user, s.user.email ?? '', loadUserState, checkDeveloperPro)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [checkDeveloperPro, loadUserState])

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await withAuthTimeout(supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    }), '注册')
    if (error) throw error

    if (data.session?.user) {
      void syncUserStateAfterAuth(data.session.user, email, loadUserState, checkDeveloperPro)
    }

    return data
  }, [checkDeveloperPro, loadUserState])

  const sendRegistrationCode = useCallback(async (email: string) => {
    const { data, error } = await withAuthTimeout(supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
      },
    }), '发送验证码')
    if (error) throw error
    return data
  }, [])

  const verifyRegistrationCode = useCallback(async (
    email: string,
    token: string,
    password: string,
  ) => {
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedToken = token.replace(/\s+/g, '')
    let verifyResult: Awaited<ReturnType<typeof supabase.auth.verifyOtp>> | null = null

    for (const type of REGISTRATION_OTP_TYPES) {
      verifyResult = await withAuthTimeout(supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type,
      }), '验证邮箱验证码')

      if (!verifyResult.error) break
    }

    if (!verifyResult) {
      throw new Error('验证码验证失败')
    }

    const { data, error } = verifyResult
    if (error) throw error

    const { error: updateError } = await withAuthTimeout(
      supabase.auth.updateUser({ password }),
      '设置密码',
    )
    if (updateError) throw updateError

    if (data.user) {
      void syncUserStateAfterAuth(data.user, email, loadUserState, checkDeveloperPro)
    }

    return data
  }, [checkDeveloperPro, loadUserState])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await withAuthTimeout(supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    }), '登录')
    if (error) throw error

    if (data.user) {
      void syncUserStateAfterAuth(data.user, email, loadUserState, checkDeveloperPro)
    }

    return data
  }, [checkDeveloperPro, loadUserState])

  const signOut = useCallback(async () => {
    const { error } = await withAuthTimeout(supabase.auth.signOut(), '退出登录')
    if (error) throw error
  }, [])

  return {
    user,
    session,
    loading,
    signUp,
    sendRegistrationCode,
    verifyRegistrationCode,
    signIn,
    signOut,
  }
}
