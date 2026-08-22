import { useState, useEffect, useCallback } from 'react'
import { Copy, Check, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const DEVELOPER_EMAILS = ['2118645938@qq.com']

interface ActivationCode {
  id: string
  code: string
  type: string
  days: number
  used: boolean
  used_by: string | null
  used_at: string | null
  created_at: string
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `CET-${seg(4)}-${seg(4)}`
}

export default function Admin() {
  const [type, setType] = useState<'monthly' | 'yearly'>('monthly')
  const [quantity, setQuantity] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [codes, setCodes] = useState<ActivationCode[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()

  const loadCodes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('activation_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (!error && data) setCodes(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadCodes)
  }, [loadCodes])

  const handleGenerate = async () => {
    setGenerating(true)
    const days = 30
    const rows = Array.from({ length: quantity }, () => ({
      code: generateCode(),
      type: 'renewal',
      days,
    }))

    const { error } = await supabase.from('activation_codes').insert(rows)

    if (error) {
      toast.error('生成失败：' + error.message)
    } else {
      toast.success(`✅ 成功生成 ${quantity} 个激活码`)
      await loadCodes()
    }
    setGenerating(false)
  }

  const handleCopy = async (code: ActivationCode) => {
    await navigator.clipboard.writeText(code.code)
    setCopiedId(code.id)
    toast.success('已复制：' + code.code)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCopyAll = async () => {
    const unused = codes.filter(c => !c.used).map(c => c.code).join('\n')
    if (!unused) { toast.info('没有未使用的激活码'); return }
    await navigator.clipboard.writeText(unused)
    toast.success(`已复制 ${codes.filter(c => !c.used).length} 个未使用激活码`)
  }

  const handleDeleteUsed = async () => {
    const { error } = await supabase
      .from('activation_codes')
      .delete()
      .eq('used', true)
    if (!error) {
      toast.success('已清理已使用的激活码')
      await loadCodes()
    }
  }

  const unusedCount = codes.filter(c => !c.used).length
  const usedCount = codes.filter(c => c.used).length

  if (authLoading) {
    return <div className="min-h-screen bg-gray-950 p-6 text-white">加载中...</div>
  }

  if (!user?.email || !DEVELOPER_EMAILS.includes(user.email.toLowerCase())) {
    return <div className="min-h-screen bg-gray-950 p-6 text-white">无权限访问</div>
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold">🔑 激活码管理</h1>
          <p className="text-gray-400 text-sm mt-1">
            未使用 {unusedCount} 个 · 已使用 {usedCount} 个
          </p>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">生成激活码</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-2">类型</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setType('monthly')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    type === 'monthly'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  月付 · 30天 · ¥6.9
                </button>
                <button
                  onClick={() => setType('yearly')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    type === 'yearly'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  年付 · 365天 · ¥49.9
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2">数量</p>
              <div className="flex gap-2">
                {[1, 3, 5, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setQuantity(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      quantity === n
                        ? 'bg-gray-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {n}个
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? '生成中...' : `生成 ${quantity} 个${type === 'monthly' ? '月付' : '年付'}激活码`}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">激活码列表</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={loadCodes} className="text-gray-400">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCopyAll} className="text-blue-400">
                  复制全部未用
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDeleteUsed} className="text-red-400">
                  <Trash2 className="h-4 w-4 mr-1" />
                  清理已用
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-400 text-sm text-center py-8">加载中...</p>
            ) : codes.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">暂无激活码，点上方生成</p>
            ) : (
              <div className="space-y-2">
                {codes.map(code => (
                  <div
                    key={code.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      code.used ? 'bg-gray-800/50' : 'bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-sm ${code.used ? 'text-gray-500 line-through' : 'text-white'}`}>
                        {code.code}
                      </span>
                      <Badge
                        className={`text-xs ${
                          code.type === 'yearly'
                            ? 'bg-purple-900 text-purple-300'
                            : 'bg-blue-900 text-blue-300'
                        }`}
                      >
                        {code.type === 'yearly' ? '年付' : '月付'}
                      </Badge>
                      {code.used && (
                        <Badge className="text-xs bg-gray-700 text-gray-400">已用</Badge>
                      )}
                    </div>
                    {!code.used && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopy(code)}
                        className="text-gray-400 hover:text-white"
                      >
                        {copiedId === code.id
                          ? <Check className="h-4 w-4 text-green-400" />
                          : <Copy className="h-4 w-4" />
                        }
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
