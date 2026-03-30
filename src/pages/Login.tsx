import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Mail, ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

type Step = 'email' | 'otp'

export default function Login() {
  const navigate = useNavigate()
  const { signInWithEmail, verifyOtp } = useAuth()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSendOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast.error('请输入有效的邮箱地址')
      return
    }
    setSubmitting(true)
    try {
      await signInWithEmail(email.trim())
      setStep('otp')
      toast.success('验证码已发送，请查收邮件')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发送失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerify = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      toast.error('请输入 6 位验证码')
      return
    }
    setSubmitting(true)
    try {
      await verifyOtp(email.trim(), otp.trim())
      toast.success('登录成功')
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '验证失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand">
              <span className="text-3xl">🎧</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">CET Listening Studio</h1>
            <p className="text-sm text-gray-500">登录以开始学习</p>
          </div>

          {step === 'email' ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">邮箱地址</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSendOtp}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      发送中...
                    </>
                  ) : (
                    '发送验证码'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    输入验证码
                  </label>
                  <p className="text-xs text-gray-500">
                    已发送到 <span className="font-medium text-gray-700">{email}</span>
                  </p>
                  <Input
                    type="text"
                    placeholder="6 位验证码"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    maxLength={6}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleVerify}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      验证中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setStep('email'); setOtp('') }}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  返回修改邮箱
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-gray-400 text-center">
        登录即表示同意使用条款<br />
        首次登录将自动创建账号
      </p>
    </div>
  )
}
