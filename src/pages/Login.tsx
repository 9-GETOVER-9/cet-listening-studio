import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Lock, Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'

type Mode = 'login' | 'register'

function isValidEmail(email: string): boolean {
  return Boolean(email && email.includes('@'))
}

function validatePassword(password: string): boolean {
  if (!password) {
    toast.error('请输入密码')
    return false
  }

  if (password.length < 6) {
    toast.error('密码至少 6 位')
    return false
  }

  return true
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signIn, sendRegistrationCode, verifyRegistrationCode } = useAuth()

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setVerificationCode('')
    setCodeSent(false)
  }

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    resetForm()
  }

  const validateEmail = (value: string): boolean => {
    if (!isValidEmail(value)) {
      toast.error('请输入有效的邮箱地址')
      return false
    }
    return true
  }

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!validateEmail(trimmedEmail) || !validatePassword(password)) return

    setSubmitting(true)
    try {
      const { user } = await signIn(trimmedEmail, password)

      if (!user?.email_confirmed_at) {
        toast.error('请先完成邮箱验证后再登录')
        return
      }

      toast.success('登录成功')
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败'
      if (message.includes('Invalid login credentials')) {
        toast.error('邮箱或密码错误')
      } else if (message.includes('Email not confirmed')) {
        toast.error('请先完成邮箱验证')
      } else {
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!validateEmail(trimmedEmail)) return

    setSubmitting(true)
    try {
      await sendRegistrationCode(trimmedEmail)
      setCodeSent(true)
      toast.success('验证码已发送，请查收邮箱', { duration: 5000 })
    } catch (err) {
      const message = err instanceof Error ? err.message : '验证码发送失败'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async () => {
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedCode = verificationCode.replace(/\s+/g, '')
    if (!validateEmail(trimmedEmail) || !validatePassword(password)) return

    if (!trimmedCode) {
      toast.error('请输入邮箱验证码')
      return
    }

    setSubmitting(true)
    try {
      const { user } = await verifyRegistrationCode(trimmedEmail, trimmedCode, password)

      if (user) {
        toast.success('注册成功，已自动登录')
        navigate('/')
        return
      }

      toast.success('注册成功，请登录')
      switchMode('login')
    } catch (err) {
      const message = err instanceof Error ? err.message : '注册失败'
      if (message.includes('Token has expired') || message.includes('invalid')) {
        toast.error('验证码无效或已过期，请重新获取')
      } else {
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') return
    if (mode === 'login') {
      void handleLogin()
      return
    }

    if (!codeSent) {
      void handleSendCode()
      return
    }

    void handleRegister()
  }

  return (
    <div className="grid min-h-dvh bg-[var(--app-paper)] lg:grid-cols-[minmax(0,1.2fr)_minmax(420px,.8fr)]">
      <section className="hidden flex-col justify-between bg-[var(--app-ink)] p-12 text-[var(--app-surface)] lg:flex xl:p-20">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full border border-white/50 font-serif text-xs font-bold">LS</span><div><strong className="block font-serif">Listening Studio</strong><small className="uppercase tracking-[.18em] text-white/50">Quiet Edition</small></div></div>
        <div className="max-w-2xl"><p className="quiet-kicker !text-[#c98070]">Listen · Notice · Remember</p><h1 className="quiet-display mt-5 text-7xl">听见那些，<br />曾经错过的细节。</h1><p className="mt-7 max-w-xl leading-8 text-white/55">把真题、新概念与 FSRS 记忆节奏放在一个安静的学习空间里。每次只专注一个声音片段。</p></div>
        <p className="font-serif text-sm text-white/45">CET Listening Studio · 2026</p>
      </section>
      <div className="flex flex-col items-center justify-center p-5 md:p-10">
      <Card className="w-full max-w-md border-0 bg-transparent shadow-none hover:shadow-none">
        <CardContent className="p-6">
          <div className="mb-4 flex flex-col items-center gap-2">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-[var(--app-ink)] font-serif text-2xl">
              LS
            </div>
            <h1 className="quiet-display text-3xl">欢迎回来</h1>
          </div>

          <div className="mb-4 text-center">
            <p className="text-base font-semibold text-gray-800">继续今天的听力编辑</p>
            <p className="mt-1 text-sm text-gray-500">算法安排节奏，你只需要认真听。</p>
          </div>

          <div className="mb-5 flex justify-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">复</span>
              <div className="text-center">
                <p className="text-xs font-medium text-gray-700">FSRS 算法</p>
                <p className="text-[10px] text-gray-400">只复习快忘的</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">析</span>
              <div className="text-center">
                <p className="text-xs font-medium text-gray-700">AI 解析</p>
                <p className="text-[10px] text-gray-400">发音语法一起看</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">题</span>
              <div className="text-center">
                <p className="text-xs font-medium text-gray-700">真题练习</p>
                <p className="text-[10px] text-gray-400">CET4/6 + NCE</p>
              </div>
            </div>
          </div>

          <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
            <button
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => switchMode('login')}
              type="button"
            >
              登录
            </button>
            <button
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => switchMode('register')}
              type="button"
            >
              注册
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">邮箱地址</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={handleSubmit}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            {mode === 'register' && codeSent && (
              <div>
                <label className="text-sm font-medium text-gray-700">邮箱验证码</label>
                <div className="relative mt-1">
                  <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    inputMode="numeric"
                    placeholder="输入 6 位验证码"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\s+/g, ''))}
                    onKeyDown={handleSubmit}
                    className="pl-10 tracking-widest"
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || codeSent) && (
              <div>
                <label className="text-sm font-medium text-gray-700">
                  {mode === 'register' ? '设置密码' : '密码'}
                </label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="password"
                    placeholder="至少 6 位"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={handleSubmit}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            {mode === 'login' ? (
              <Button
                className="w-full"
                onClick={() => void handleLogin()}
                disabled={submitting}
              >
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />登录中...</>
                ) : (
                  '登录'
                )}
              </Button>
            ) : !codeSent ? (
              <Button
                className="w-full"
                onClick={() => void handleSendCode()}
                disabled={submitting}
              >
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />发送中...</>
                ) : (
                  <><Mail className="mr-2 h-4 w-4" />发送验证码</>
                )}
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => void handleRegister()}
                  disabled={submitting}
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />注册中...</>
                  ) : (
                    <><UserPlus className="mr-2 h-4 w-4" />完成注册</>
                  )}
                </Button>
                <Button
                  className="w-full"
                  variant="ghost"
                  onClick={() => void handleSendCode()}
                  disabled={submitting}
                >
                  重新发送验证码
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 max-w-sm text-center text-xs text-gray-400">
        注册时用邮箱验证码确认身份；以后登录只需要邮箱和密码。
      </p>
      </div>
    </div>
  )
}
