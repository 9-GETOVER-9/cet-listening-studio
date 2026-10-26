import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ActivateCodeRequest = { code?: string }

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: '请求方式不支持' }, 405)

  try {
    const { code }: ActivateCodeRequest = await req.json()
    const normalizedCode = code?.trim().toUpperCase()
    if (!normalizedCode || normalizedCode.length > 64) {
      return jsonResponse({ success: false, error: '请输入有效的邀请码' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('activate-code service configuration is missing')
      return jsonResponse({ success: false, error: '兑换服务暂不可用' }, 503)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const authorization = req.headers.get('Authorization')
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    if (!token) return jsonResponse({ success: false, error: '请先登录后再兑换邀请码' }, 401)

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return jsonResponse({ success: false, error: '登录状态已失效，请重新登录' }, 401)
    }

    const { data, error } = await supabase.rpc('redeem_activation_code', {
      p_code: normalizedCode,
      p_user_id: authData.user.id,
    })

    if (error) {
      console.error('Atomic invitation redemption failed:', error)
      return jsonResponse({ success: false, error: '邀请码兑换失败，请稍后重试' }, 503)
    }

    if (!data || typeof data !== 'object' || !('success' in data)) {
      console.error('Unexpected redeem_activation_code response')
      return jsonResponse({ success: false, error: '邀请码兑换失败，请稍后重试' }, 503)
    }

    return jsonResponse(data as Record<string, unknown>)
  } catch (error) {
    console.error('activate-code request failed:', error)
    return jsonResponse({ success: false, error: '服务器错误，请稍后重试' }, 500)
  }
})
