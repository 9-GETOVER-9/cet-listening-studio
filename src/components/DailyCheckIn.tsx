import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarCheck } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { useLocalDay } from '@/hooks/useLocalDay'
import { getDailyEncouragement } from '@/lib/dailyEncouragement'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'

export function DailyCheckIn({ userId, ready }: { userId?: string; ready: boolean }) {
  const navigate = useNavigate()
  const today = useLocalDay()
  const lastDate = useSettingsStore(s => s.lastCheckinDate)
  const streak = useSettingsStore(s => s.consecutiveDays)
  const currentUserId = useSettingsStore(s => s.currentUserId)
  const signIn = useSettingsStore(s => s.signIn)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [celebration, setCelebration] = useState<{ quote: string; message: string; streak: number } | null>(null)
  const accountReady = Boolean(userId && currentUserId === userId)
  const signed = accountReady && lastDate === today

  async function checkIn() {
    if (!userId) { navigate('/login?mode=login'); return }
    if (!accountReady || signed || pending.current) return
    pending.current = true; setBusy(true)
    try {
      const result = await signIn()
      if (useSettingsStore.getState().currentUserId !== userId) return
      if (result.success) setCelebration({ quote: getDailyEncouragement(), message: result.message, streak: useSettingsStore.getState().consecutiveDays })
      else toast.info(result.message)
    } catch { toast.error('签到失败，请检查网络后重试') }
    finally { pending.current = false; setBusy(false) }
  }

  return <>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4" />每日签到</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">{accountReady ? `连续签到 ${streak} 天 · 今天也为自己留一点学习时间。` : '每天签到，收获一句鼓励。登录后保留签到记录。'}</p>
        <Button className="w-full" variant={signed ? 'outline' : 'default'} disabled={!ready || busy || signed || Boolean(userId && !accountReady)} onClick={() => void checkIn()}>
          {busy ? '签到中…' : signed ? '今天已签到' : userId ? '今日签到' : '登录后签到'}
        </Button>
        {accountReady && <p className="text-xs text-gray-500">保留原有签到 AI 奖励；签到与完成每日复习分别记录。</p>}
      </CardContent>
    </Card>
    <Dialog open={Boolean(celebration)} onOpenChange={open => { if (!open) setCelebration(null) }}>
      <DialogContent className="max-w-md"><DialogHeader>
        <DialogTitle>签到成功，今天也向前一步。</DialogTitle>
        <DialogDescription>连续签到 {celebration?.streak ?? 0} 天</DialogDescription>
      </DialogHeader>
        <p className="py-5 text-xl font-medium leading-9">{celebration?.quote}</p>
        <p className="text-sm text-gray-500">{celebration?.message}</p>
        <DialogFooter><Button onClick={() => setCelebration(null)}>继续加油</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
