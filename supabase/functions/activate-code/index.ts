import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ActivateCodeRequest = {
  code?: string
  userId?: string
  checkOnly?: boolean
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

async function getAuthorizedUserId(
  supabase: ReturnType<typeof createClient>,
  authorizationHeader: string | null,
) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authorizationHeader.replace('Bearer ', '').trim()
  if (!token) {
    return null
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error) {
    console.error('Failed to resolve auth user from JWT:', error)
    return null
  }

  return data.user?.id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, userId, checkOnly }: ActivateCodeRequest = await req.json()
    const normalizedCode = code?.trim().toUpperCase()
    const isCheckOnly = checkOnly === true

    if (!normalizedCode) {
      return jsonResponse({ success: false, valid: false, error: '缺少邀请码' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ success: false, error: '服务端环境变量缺失' })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: codeData, error: codeError } = await supabase
      .from('activation_codes')
      .select('id, code, days, used, expires_at')
      .eq('code', normalizedCode)
      .maybeSingle()

    if (codeError) {
      console.error('Failed to query activation code:', codeError)
      return jsonResponse({ success: false, valid: false, error: '邀请码校验失败' })
    }

    if (!codeData) {
      return jsonResponse({ success: false, valid: false, error: '邀请码无效' })
    }

    if (codeData.used) {
      return jsonResponse({ success: false, valid: false, error: '邀请码已被使用' })
    }

    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return jsonResponse({ success: false, valid: false, error: '邀请码已过期' })
    }

    if (isCheckOnly) {
      return jsonResponse({
        success: true,
        valid: true,
        days: codeData.days,
        message: '邀请码有效',
      })
    }

    const authUserId = await getAuthorizedUserId(supabase, req.headers.get('Authorization'))
    const targetUserId = authUserId ?? userId ?? null

    if (!targetUserId) {
      return jsonResponse({ success: false, error: '请先登录后再兑换邀请码' })
    }

    if (authUserId && userId && userId !== authUserId) {
      return jsonResponse({ success: false, error: '用户信息不匹配' })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, pro_expires_at')
      .eq('id', targetUserId)
      .maybeSingle()

    if (profileError) {
      console.error('Failed to query profile:', profileError)
      return jsonResponse({ success: false, error: '读取用户信息失败' })
    }

    if (!profile) {
      return jsonResponse({ success: false, error: '未找到用户资料，请先完成登录' })
    }

    const redeemedAt = new Date().toISOString()
    const { data: reservedCode, error: reserveError } = await supabase
      .from('activation_codes')
      .update({
        used: true,
        used_by: targetUserId,
        used_at: redeemedAt,
      })
      .eq('id', codeData.id)
      .eq('used', false)
      .select('id')
      .maybeSingle()

    if (reserveError) {
      console.error('Failed to reserve activation code:', reserveError)
      return jsonResponse({ success: false, error: '邀请码兑换失败，请稍后重试' })
    }

    if (!reservedCode) {
      return jsonResponse({ success: false, error: '邀请码已被其他请求使用' })
    }

    const now = new Date()
    const currentExpiry = profile.pro_expires_at ? new Date(profile.pro_expires_at) : now
    const baseDate = currentExpiry > now ? currentExpiry : now
    const days = codeData.days || 30
    const newExpiry = new Date(baseDate.getTime() + days * 86_400_000)

    const { data: updatedProfile, error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        is_pro: true,
        pro_expires_at: newExpiry.toISOString(),
      })
      .eq('id', targetUserId)
      .select('id')
      .maybeSingle()

    if (updateProfileError || !updatedProfile) {
      console.error('Failed to update profile after redeeming code:', updateProfileError)

      const { error: rollbackError } = await supabase
        .from('activation_codes')
        .update({
          used: false,
          used_by: null,
          used_at: null,
        })
        .eq('id', codeData.id)
        .eq('used_by', targetUserId)

      if (rollbackError) {
        console.error('Failed to rollback activation code reservation:', rollbackError)
      }

      return jsonResponse({ success: false, error: '激活失败，请稍后重试' })
    }

    return jsonResponse({
      success: true,
      days,
      message: `成功激活 ${days} 天 Pro 会员`,
    })
  } catch (caughtError) {
    console.error('activate-code request failed:', caughtError)
    return jsonResponse({ success: false, error: '服务器错误' })
  }
})
