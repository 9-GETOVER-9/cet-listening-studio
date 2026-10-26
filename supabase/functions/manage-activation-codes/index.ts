import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAILS = new Set(['2118645938@qq.com'])
type ActionRequest = {
  action?: 'list' | 'generate' | 'delete_used'
  quantity?: number
  type?: 'monthly' | 'yearly' | 'lifetime'
}

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const body = Array.from(bytes, (byte) => (byte % 32).toString(32)).join('').toUpperCase()
  return `CET-${body.slice(0, 8)}-${body.slice(8, 15)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return respond({ success: false, error: '请求方式不支持' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return respond({ success: false, error: '管理服务暂不可用' }, 503)

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    if (!token) return respond({ success: false, error: '请先登录' }, 401)

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    const email = authData.user?.email?.toLowerCase()
    if (authError || !email || !ADMIN_EMAILS.has(email)) {
      return respond({ success: false, error: '无权限访问' }, 403)
    }

    const input: ActionRequest = await req.json()
    if (input.action === 'list') {
      const { data, error } = await supabase.from('activation_codes').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return respond({ success: true, codes: data })
    }

    if (input.action === 'delete_used') {
      const { error } = await supabase.from('activation_codes').delete().eq('used', true)
      if (error) throw error
      return respond({ success: true })
    }

    if (input.action === 'generate') {
      const quantity = Math.max(1, Math.min(10, Math.floor(Number(input.quantity) || 1)))
      const type = input.type
      if (!type || !['monthly', 'yearly', 'lifetime'].includes(type)) {
        return respond({ success: false, error: '请选择有效的会员类型' }, 400)
      }
      const rows = Array.from({ length: quantity }, () => ({
        code: makeCode(),
        type: type === 'lifetime' ? 'lifetime' : type,
        days: type === 'yearly' ? 365 : type === 'lifetime' ? 0 : 30,
        is_lifetime: type === 'lifetime',
      }))
      const { data, error } = await supabase.from('activation_codes').insert(rows).select('id, code, type, days, is_lifetime, used, used_by, used_at, created_at')
      if (error) throw error
      return respond({ success: true, codes: data })
    }

    return respond({ success: false, error: '不支持的管理操作' }, 400)
  } catch (error) {
    console.error('manage-activation-codes failed:', error)
    return respond({ success: false, error: '操作失败，请稍后重试' }, 500)
  }
})
