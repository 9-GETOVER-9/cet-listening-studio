import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

type Category = 'suggestion' | 'bug' | 'other'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'suggestion', label: '建议' },
  { value: 'bug', label: 'Bug' },
  { value: 'other', label: '其他' },
]

export default function Feedback() {
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<Category>('suggestion')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('请输入反馈内容')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.from('feedback').insert({
        content: content.trim(),
        category,
        email: (await supabase.auth.getUser()).data.user?.email,
      })
      if (error) throw error
      toast.success('感谢你的反馈！')
      navigate(-1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <h1 className="text-lg font-semibold text-gray-900">意见反馈</h1>
      </div>

      <div className="flex-1 p-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* 分类选择 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">反馈类型</p>
              <div className="flex gap-2">
                {CATEGORIES.map(({ value, label }) => (
                  <Badge
                    key={value}
                    variant={category === value ? 'default' : 'outline'}
                    className="cursor-pointer px-3 py-1.5 text-sm"
                    onClick={() => setCategory(value)}
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* 内容输入 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">反馈内容</p>
              <textarea
                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                rows={6}
                placeholder="请描述你的建议或遇到的问题..."
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 500))}
                maxLength={500}
              />
              <p className="text-xs text-gray-400 text-right">{content.length}/500</p>
            </div>

            {/* 提交按钮 */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || !content.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  提交反馈
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
