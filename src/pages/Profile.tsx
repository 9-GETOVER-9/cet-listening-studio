import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { Cloud, Gift, LogOut, MessageSquare, Settings, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getAllModules,
  getCurrentStreak,
  getNotebookCount,
  getRecentLogs,
  getStudyDatesInRange,
  getTodayTaskStats,
  getTodayStudiedCount,
} from '@/db/crud'
import { useAuth } from '@/hooks/useAuth'
import { usePro } from '@/hooks/usePro'
import { AchievementGrid, type Achievement } from '@/components/AchievementBadge'
import { clearAllData } from '@/lib/dataLoader'
import { activateInviteCode } from '@/lib/supabase'
import { getLocalDateStr } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'
import type { StudyLogItem } from '@/types'

interface Stats {
  totalCards: number
  studiedCards: number
  todayReview: number
  notebookCount: number
  streak: number
  todayStudied: number
}

function computeAchievements(stats: Stats): Achievement[] {
  return [
    {
      id: 'first_card',
      name: '初次学习',
      description: '完成第一张卡片',
      icon: 'target',
      unlocked: stats.studiedCards >= 1,
      progress: Math.min(stats.studiedCards, 1),
      target: 1,
    },
    {
      id: 'streak_7',
      name: '一周坚持',
      description: '连续学习 7 天',
      icon: 'flame',
      unlocked: stats.streak >= 7,
      progress: Math.min(stats.streak, 7),
      target: 7,
    },
    {
      id: 'cards_100',
      name: '百卡达成',
      description: '累计学习 100 张卡片',
      icon: 'trophy',
      unlocked: stats.studiedCards >= 100,
      progress: Math.min(stats.studiedCards, 100),
      target: 100,
    },
    {
      id: 'daily_done',
      name: '今日任务',
      description: '完成今日所有复习',
      icon: 'zap',
      unlocked: stats.todayStudied > 0 && stats.todayReview === 0,
      progress: stats.todayStudied > 0 && stats.todayReview === 0 ? 1 : 0,
      target: 1,
    },
  ]
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { nickname, playSpeed, logEnabled, setLogEnabled, setNickname, setPlaySpeed } = useSettingsStore()
  const { handleSignIn, isGuestTrial, isPro, isLifetimePro, proDaysLeft, todaySignedIn } = usePro()
  const isGuest = !user

  const [statsLoading, setStatsLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    totalCards: 0,
    studiedCards: 0,
    todayReview: 0,
    notebookCount: 0,
    streak: 0,
    todayStudied: 0,
  })
  const [recentLogs, setRecentLogs] = useState<StudyLogItem[]>([])
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map())
  const [editingNickname, setEditingNickname] = useState(false)
  const [tempNickname, setTempNickname] = useState(nickname)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [allModules, todayTask, notebookCount, streak, todayStudied] =
          await Promise.all([
            getAllModules(),
            getTodayTaskStats(),
            getNotebookCount(),
            getCurrentStreak(),
            getTodayStudiedCount(),
          ])

        const totalCards = allModules.reduce((sum, module) => sum + module.totalCards, 0)
        const studiedCards = allModules.reduce((sum, module) => sum + module.studiedCards, 0)

        setStats({
          totalCards,
          studiedCards,
          todayReview: todayTask.remaining,
          notebookCount,
          streak,
          todayStudied,
        })
      } finally {
        setStatsLoading(false)
      }
    }

    const loadActivity = async () => {
      try {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - 83)

        const [logs, heatmap] = await Promise.all([
          getRecentLogs(7),
          getStudyDatesInRange(start, end),
        ])

        setRecentLogs(logs)
        setHeatmapData(heatmap)
      } finally {
        setActivityLoading(false)
      }
    }

    void loadStats()
    void loadActivity()
  }, [])

  const handleSaveNickname = () => {
    setNickname(tempNickname)
    setEditingNickname(false)
    toast.success('昵称已保存')
  }

  const handleClearData = async () => {
    try {
      await clearAllData()
      toast.success('数据已清除')
      window.location.reload()
    } catch {
      toast.error('清除失败')
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('已退出登录')
      navigate('/login')
    } catch {
      toast.error('退出登录失败')
    }
  }

  const handleActivateCode = async () => {
    const code = activationCode.trim().toUpperCase()
    if (!code) {
      toast.error('请输入激活码')
      return
    }

    if (!user?.id) {
      toast.error('请先登录')
      return
    }

    setActivating(true)
    try {
      const result = await activateInviteCode(code, user.id)
      if (!result.success) {
        toast.error(result.error || '激活失败')
        return
      }

      await useSettingsStore.getState().loadUserState(user.id, Boolean(user.email_confirmed_at))
      setActivationCode('')
      toast.success(result.message || `已获得 ${result.days} 天 Pro 会员`, { duration: 4000 })
    } catch {
      toast.error('网络错误，请稍后重试')
    } finally {
      setActivating(false)
    }
  }

  const handleDailySignIn = async () => {
    const result = await handleSignIn()
    if (result.success) toast.success(result.message)
    else toast.info(result.message)
  }

  const handleComingSoon = () => {
    toast.info('即将上线', { description: '这个功能正在开发中' })
  }

  const formatTime = (timestamp: number) => {
    const date = dayjs(timestamp)
    const now = dayjs()
    if (date.isSame(now, 'day')) return date.format('HH:mm')
    if (date.isSame(now.subtract(1, 'day'), 'day')) return `昨天 ${date.format('HH:mm')}`
    return date.format('MM/DD HH:mm')
  }

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'review':
        return '复习'
      case 'bookmark':
        return '收藏'
      case 'merge':
        return '拼接'
      default:
        return action
    }
  }

  const getRatingLabel = (rating?: number) => {
    if (!rating) return null
    const labels: Record<number, { label: string; color: string }> = {
      1: { label: '重来', color: 'bg-red-100 text-red-800' },
      2: { label: '困难', color: 'bg-yellow-100 text-yellow-800' },
      3: { label: '掌握', color: 'bg-blue-100 text-blue-800' },
      4: { label: '简单', color: 'bg-green-100 text-green-800' },
    }
    return labels[rating]
  }

  if (statsLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const studyRate = stats.totalCards > 0 ? Math.round((stats.studiedCards / stats.totalCards) * 100) : 0

  return (
    <ScrollArea className="h-dvh">
      <div className="quiet-page space-y-4">
        <div className="mb-8"><p className="quiet-kicker mb-2">Identity & Rhythm</p><h1 className="quiet-display text-4xl md:text-6xl">我的学习设置。</h1></div>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl">{nickname ? nickname.charAt(0).toUpperCase() : 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              {editingNickname ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    className="max-w-[200px]"
                    placeholder="输入昵称"
                    value={tempNickname}
                    onChange={(event) => setTempNickname(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleSaveNickname()
                      if (event.key === 'Escape') setEditingNickname(false)
                    }}
                  />
                  <Button size="sm" onClick={handleSaveNickname}>保存</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNickname(false)}>取消</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{nickname || '设置昵称'}</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTempNickname(nickname)
                      setEditingNickname(true)
                    }}
                  >
                    编辑
                  </Button>
                </div>
              )}
              <p className="mt-1 text-sm text-gray-500">{user?.email ?? '访客体验中'}</p>
            </div>
            {user ? (
              <Button size="sm" variant="ghost" onClick={() => void handleSignOut()}>
                <LogOut className="mr-1 h-4 w-4" />退出
              </Button>
            ) : (
              <Button size="sm" onClick={() => navigate('/login?mode=register')}>
                注册
              </Button>
            )}
          </CardContent>
        </Card>

        {isGuest && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">注册账号，领取 2 个月 Pro</p>
                  <p className="mt-1 text-sm leading-6 text-gray-600">
                    当前是 1 天 Pro 体验。注册后可保存学习记录，并继续使用 AI 解析、句子拼接和完整内容。
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={() => navigate('/login?mode=register')}>
                注册领取 2 个月 Pro
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-4 p-4">
            {isPro ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 text-lg">P</div>
                  <div>
                    <p className="font-semibold text-gray-900">Pro 会员</p>
                    <p className="text-sm text-gray-500">
                      {isGuestTrial ? '今日 Pro 体验中' : isLifetimePro ? '永久 Pro' : `剩余 ${proDaysLeft} 天`}
                    </p>
                  </div>
                </div>
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white">Pro</Badge>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg">P</div>
                  <div>
                    <p className="font-semibold text-gray-900">升级 Pro</p>
                    <p className="text-sm text-gray-500">解锁无限 AI 解析和句子拼接</p>
                  </div>
                </div>
                <Button className="w-full" variant="outline" onClick={handleComingSoon}>查看免费版权益</Button>
              </div>
            )}

            {!isGuest && (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">续期邀请码</p>
                  <div className="flex gap-2">
                    <Input
                      className="font-mono text-sm uppercase"
                      placeholder="输入邀请码（如 CET-XXXX-XXXX）"
                      value={activationCode}
                      onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
                      onKeyDown={(event) => event.key === 'Enter' && void handleActivateCode()}
                    />
                    <Button className="shrink-0" disabled={activating} onClick={() => void handleActivateCode()}>
                      {activating ? '续期中...' : '续期'}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">邀请码只用于 Pro 续期，一次延长 30 天。</p>
                </div>

                <Separator />

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">每日签到</p>
                  <Button className="w-full" disabled={todaySignedIn} variant={todaySignedIn ? 'outline' : 'default'} onClick={() => void handleDailySignIn()}>
                    {todaySignedIn ? '今天已签到' : '签到解锁 5 次 AI 解析'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">学习统计</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 divide-x divide-gray-200 rounded-lg border border-gray-200">
              <div className="flex flex-col items-center px-2 py-3"><span className="text-2xl font-bold text-gray-900">{stats.todayReview}</span><span className="mt-1 text-xs text-gray-500">今日待复习</span></div>
              <div className="flex flex-col items-center px-2 py-3"><span className="text-2xl font-bold text-orange-500">{stats.streak}</span><span className="mt-1 text-xs text-gray-500">连续打卡</span></div>
              <div className="flex flex-col items-center px-2 py-3"><span className="text-2xl font-bold text-gray-900">{stats.studiedCards}</span><span className="mt-1 text-xs text-gray-500">累计学习</span></div>
            </div>

            <div>
              <p className="mb-2 text-xs text-gray-500">近 12 周复习热力图</p>
              {activityLoading ? (
                <Skeleton className="h-28 w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <div className="flex gap-1" style={{ minWidth: 'max-content' }}>
                    {Array.from({ length: 12 }, (_, weekIndex) => {
                      const weekStart = new Date()
                      weekStart.setDate(weekStart.getDate() - (11 - weekIndex) * 7 - weekStart.getDay() - 6)
                      return (
                        <div key={weekIndex} className="flex flex-col gap-[2px]">
                          {Array.from({ length: 7 }, (_, dayIndex) => {
                            const date = new Date(weekStart)
                            date.setDate(date.getDate() + dayIndex)
                            const dateStr = getLocalDateStr(date)
                            const todayStr = getLocalDateStr()
                            const isFuture = dateStr > todayStr
                            const count = isFuture ? 0 : (heatmapData.get(dateStr) || 0)
                            const color = count === 0 ? '#1e293b' : count <= 2 ? '#166534' : count <= 4 ? '#16a34a' : '#4ade80'
                            return (
                              <div
                                key={dayIndex}
                                title={isFuture ? '' : `${dateStr}: ${count}次`}
                                style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isFuture ? '#0f172a' : color, opacity: isFuture ? 0.3 : 1, cursor: isFuture ? 'default' : 'pointer' }}
                              />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                <span>少</span>
                <div className="flex gap-[2px]">{['#1e293b', '#166534', '#16a34a', '#4ade80'].map((color) => <div key={color} style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />)}</div>
                <span>多</span>
                <span className="ml-auto text-[10px]">未来日期留空</span>
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-2 flex items-center justify-between text-sm"><span className="text-gray-500">总体进度</span><span className="font-medium">{studyRate}%</span></div>
              <Progress className="h-2" value={studyRate} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm"><span className="text-gray-500">复习完成率</span><span className="font-medium">{studyRate}%</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-gray-500">难点收藏</span><span className="font-medium">{stats.notebookCount} 条</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">🏆 学习成就</CardTitle></CardHeader>
          <CardContent>
            <AchievementGrid achievements={computeAchievements(stats)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Settings className="h-4 w-4" />设置</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between py-3">
              <div><p className="font-medium text-gray-900">默认播放速度</p><p className="text-sm text-gray-500">听力卡片的默认播放速度</p></div>
              <div className="flex items-center gap-1">
                {[0.75, 1, 1.25, 1.5].map((speedOption) => (
                  <Button key={speedOption} className="min-w-14" size="sm" variant={playSpeed === speedOption ? 'default' : 'outline'} onClick={() => { setPlaySpeed(speedOption); toast.success(`播放速度已设置为 ${speedOption}x`) }}>
                    {speedOption}x
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between py-3">
              <div><p className="font-medium text-gray-900">学习日志</p><p className="text-sm text-gray-500">记录每日学习情况</p></div>
              <Button size="sm" variant={logEnabled ? 'default' : 'outline'} onClick={() => { const next = !logEnabled; setLogEnabled(next); toast.success(`学习日志已${next ? '开启' : '关闭'}`) }}>
                {logEnabled ? '开启' : '关闭'}
              </Button>
            </div>

            <Separator />

            <AlertDialog>
              <div className="flex items-center justify-between py-3">
                <div><p className="font-medium text-red-600">清除本地数据</p><p className="text-sm text-gray-500">重置所有学习进度和收藏</p></div>
                <AlertDialogTrigger asChild>
                  <Button className="text-red-500" size="sm" variant="outline"><Trash2 className="mr-1 h-4 w-4" />清除</Button>
                </AlertDialogTrigger>
              </div>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认清除数据</AlertDialogTitle>
                  <AlertDialogDescription>这会清除所有学习进度、收藏和本地设置，且无法恢复。</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3">
                  <p>请输入 <strong className="text-red-600">清除数据</strong> 以确认：</p>
                  <Input className="mt-2" placeholder="请输入“清除数据”" value={clearConfirmText} onChange={(event) => setClearConfirmText(event.target.value)} />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setClearConfirmText('')}>取消</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-500 hover:bg-red-600" disabled={clearConfirmText !== '清除数据'} onClick={() => { setClearConfirmText(''); void handleClearData() }}>
                    确认清除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 p-4">
            <button
              type="button"
              className="-mx-4 flex w-[calc(100%+2rem)] cursor-pointer rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50"
              onClick={() => navigate('/feedback')}
            >
              <div className="flex items-center gap-3"><MessageSquare className="h-5 w-5 text-gray-600" /><div><p className="font-medium text-gray-900">意见反馈</p><p className="text-sm text-gray-500">告诉我们你的建议或问题</p></div></div>
            </button>
            <Separator />
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between py-3 text-left text-gray-400"
              onClick={handleComingSoon}
            >
              <div className="flex items-center gap-3"><Cloud className="h-5 w-5" /><div><p className="font-medium">云端同步</p><p className="text-sm">多设备同步学习进度</p></div></div>
              <Badge variant="secondary">即将上线</Badge>
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">近期学习记录</CardTitle></CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-12 w-full" />
                ))}
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="py-8 text-center text-gray-400"><p>暂无学习记录</p><p className="mt-1 text-sm">开始学习后，这里会显示你的最近操作</p></div>
            ) : (
              <div className="space-y-3">
                {recentLogs.slice(0, 10).map((log) => {
                  const rating = getRatingLabel(log.rating)
                  return (
                    <div key={log.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100"><User className="h-4 w-4 text-gray-500" /></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className="text-xs" variant="outline">{getActionLabel(log.action)}</Badge>
                            {rating && <Badge className={`text-xs ${rating.color}`}>{rating.label}</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">{log.cardId.substring(0, 20)}...</p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{formatTime(log.timestamp)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="py-4 text-center text-xs text-gray-400"><p>CET Listening Studio v1.0.0</p><p className="mt-1">Powered by FSRS · Built with React</p></div>
      </div>
    </ScrollArea>
  )
}
