import { createClient } from '@supabase/supabase-js'

const SUPABASE_REQUEST_TIMEOUT_MS = 15_000

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS)

  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort()
    } else {
      init.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Supabase 请求超时，请检查网络、代理或 Supabase 配置')
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithTimeout,
  },
})

/**
 * 激活邀请码（调用 Edge Function）
 */
export async function activateInviteCode(code: string, userId: string): Promise<{
  success: boolean
  days?: number
  message?: string
  error?: string
}> {
  const { data, error } = await supabase.functions.invoke('activate-code', {
    body: { code, userId },
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return data
}
