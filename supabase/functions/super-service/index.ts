import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    },
  })
}

function checkRateLimit(userId: string) {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 })
    return true
  }

  if (entry.count >= 200) {
    return false
  }

  entry.count += 1
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: '未登录' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return json({ error: '登录已过期，请重新登录' }, 401)
    }

    if (!checkRateLimit(user.id)) {
      return json({ error: '请求过于频繁，请稍后再试' }, 429)
    }

    const { audioFile } = await req.json() as { audioFile?: string }
    if (!audioFile || typeof audioFile !== 'string') {
      return json({ error: '缺少 audioFile 参数' }, 400)
    }

    if (!/^[\w-]+\.mp3$/i.test(audioFile)) {
      return json({ error: '非法文件名' }, 400)
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const filePath = `audio/${audioFile}`
    const { data, error } = await adminClient.storage
      .from('audio2')
      .createSignedUrl(filePath, 300)

    if (error || !data?.signedUrl) {
      console.error('Failed to create signed URL:', error)
      return json({ error: '音频加载失败' }, 500)
    }

    return json({ signedUrl: data.signedUrl })
  } catch (error) {
    console.error('super-service failed:', error)
    return json({ error: '服务器错误' }, 500)
  }
})
