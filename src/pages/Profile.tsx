import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Settings, Trash2, Cloud, LogOut, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settingsStore'
import { useAuth } from '@/hooks/useAuth'
import {
  getTotalStudiedCount,
  getTotalCardCount,
  getTodayReviewCount,
  getNotebookCount,
  getRecentLogs,
} from '@/db/crud'
import { clearAllData } from '@/lib/dataLoader'
import type { StudyLogItem } from '@/types'
import dayjs from 'dayjs'

interface Stats {
  totalCards: number
  studiedCards: number
  todayReview: number
  notebookCount: number
}

/**
 * 个人中心页面
 * - 用户信息
 * - 学习统计
 * - 设置项
 * - 学习记录
 */
export default function Profile() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { nickname, playSpeed, logEnabled, setNickname, setPlaySpeed, setLogEnabled } = useSettingsStore()

  // 加载状态
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    totalCards: 0,
    studiedCards: 0,
    todayReview: 0,
    notebookCount: 0,
  })
  const [recentLogs, setRecentLogs] = useState<StudyLogItem[]>([])
  const [editingNickname, setEditingNickname] = useState(false)
  const [tempNickname, setTempNickname] = useState(nickname)
  const [clearConfirmText, setClearConfirmText] = useState('')

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const [totalCards, studiedCards, todayReview, notebookCount, logs] =
          await Promise.all([
            getTotalCardCount(),
            getTotalStudiedCount(),
            getTodayReviewCount(),
            getNotebookCount(),
            getRecentLogs(7),
          ])

        setStats({
          totalCards,
          studiedCards,
          todayReview,
          notebookCount,
        })
        setRecentLogs(logs)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // 保存昵称
  const handleSaveNickname = () => {
    setNickname(tempNickname)
    setEditingNickname(false)
    toast.success('昵称已保存')
  }

  // 清除本地数据
  const handleClearData = async () => {
    try {
      await clearAllData()
      toast.success('数据已清除')
      window.location.reload()
    } catch {
      toast.error('清除失败')
    }
  }

  // 登出
  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('已登出')
      navigate('/login')
    } catch {
      toast.error('登出失败')
    }
  }

  // 即将上线功能
  const handleComingSoon = () => {
    toast.info('即将上线', {
      description: '此功能正在开发中',
    })
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = dayjs(timestamp)
    const now = dayjs()

    if (date.isSame(now, 'day')) {
      return date.format('HH:mm')
    } else if (date.isSame(now.subtract(1, 'day'), 'day')) {
      return '昨天 ' + date.format('HH:mm')
    } else {
      return date.format('MM/DD HH:mm')
    }
  }

  // 学习动作标签
  const getActionLabel = (action: string) => {
    switch (action) {
      case 'review':
        return '复习'
      case 'bookmark':
        return '收藏'
      case 'merge':
        return '合并'
      default:
        return action
    }
  }

  // 评分标签
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

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const studyRate = stats.totalCards > 0
    ? Math.round((stats.studiedCards / stats.totalCards) * 100)
    : 0

  return (
    <ScrollArea className="h-[calc(100dvh-4rem)]">
      <div className="space-y-4 p-4">
        {/* 用户信息 */}
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl">
                {nickname ? nickname.charAt(0).toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              {editingNickname ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={tempNickname}
                    onChange={(e) => setTempNickname(e.target.value)}
                    placeholder="输入昵称"
                    className="max-w-[200px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNickname()
                      if (e.key === 'Escape') setEditingNickname(false)
                    }}
                  />
                  <Button size="sm" onClick={handleSaveNickname}>保存</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNickname(false)}>取消</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {nickname || '设置昵称'}
                  </h2>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setTempNickname(nickname)
                    setEditingNickname(true)
                  }}>
                    编辑
                  </Button>
                </div>
              )}
              <p className="mt-1 text-sm text-gray-500">
                {user?.email || '未登录'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1 h-4 w-4" />
              登出
            </Button>
          </CardContent>
        </Card>

        {/* 学习统计 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">学习统计</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">总学习量</span>
                <span className="font-medium">{stats.studiedCards} 句</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">复习完成率</span>
                <span className="font-medium">{studyRate}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">难点收藏</span>
                <span className="font-medium">{stats.notebookCount} 条</span>
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-gray-500">总进度</span>
                <span className="font-medium">{studyRate}%</span>
              </div>
              <Progress value={studyRate} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* 设置项 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {/* 播放速度 */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900">默认播放速度</p>
                <p className="text-sm text-gray-500">听力卡片的默认播放速度</p>
              </div>
              <div className="flex items-center gap-1">
                {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                  <Button
                    key={speed}
                    size="sm"
                    variant={playSpeed === speed ? 'default' : 'outline'}
                    onClick={() => {
                      setPlaySpeed(speed)
                      toast.success(`播放速度已设置为 ${speed}x`)
                    }}
                    className="min-w-14"
                  >
                    {speed}x
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* 学习日志 */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900">学习日志</p>
                <p className="text-sm text-gray-500">记录每日学习情况</p>
              </div>
              <Button
                size="sm"
                variant={logEnabled ? 'default' : 'outline'}
                onClick={() => {
                  setLogEnabled(!logEnabled)
                  toast.success(`学习日志已${!logEnabled ? '开启' : '关闭'}`)
                }}
              >
                {logEnabled ? '开启' : '关闭'}
              </Button>
            </div>

            <Separator />

            {/* 清除数据 */}
            <AlertDialog>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-red-600">清除本地数据</p>
                  <p className="text-sm text-gray-500">重置所有学习进度和收藏</p>
                </div>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-500">
                    <Trash2 className="mr-1 h-4 w-4" />
                    清除
                  </Button>
                </AlertDialogTrigger>
              </div>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认清除数据</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>此操作将清除所有学习进度、收藏和设置，数据无法恢复。</p>
                      <p>请输入 <strong className="text-red-600">清除数据</strong> 以确认：</p>
                      <Input
                        value={clearConfirmText}
                        onChange={(e) => setClearConfirmText(e.target.value)}
                        placeholder='请输入"清除数据"'
                        className="mt-2"
                      />
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setClearConfirmText('')}>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { setClearConfirmText(''); handleClearData() }}
                    className="bg-red-500 hover:bg-red-600"
                    disabled={clearConfirmText !== '清除数据'}
                  >
                    确认清除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* 即将上线功能 */}
        <Card>
          <CardContent className="space-y-1 p-4">
            {/* 反馈入口 */}
            <div
              className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 -mx-4 px-4 rounded-lg transition-colors"
              onClick={() => navigate('/feedback')}
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">意见反馈</p>
                  <p className="text-sm text-gray-500">告诉我们你的建议</p>
                </div>
              </div>
            </div>

            <Separator />

            <div
              className="flex items-center justify-between py-3 text-gray-400"
              onClick={handleComingSoon}
            >
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5" />
                <div>
                  <p className="font-medium">云端同步</p>
                  <p className="text-sm">多设备同步学习进度</p>
                </div>
              </div>
              <Badge variant="secondary">即将上线</Badge>
            </div>
          </CardContent>
        </Card>

        {/* 近期学习记录 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">近期学习记录</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <p>暂无学习记录</p>
                <p className="mt-1 text-sm">开始学习后这里会显示记录</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentLogs.slice(0, 10).map((log) => {
                  const rating = getRatingLabel(log.rating)
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {getActionLabel(log.action)}
                            </Badge>
                            {rating && (
                              <Badge className={`text-xs ${rating.color}`}>
                                {rating.label}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {log.cardId.substring(0, 20)}...
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 版本信息 */}
        <div className="py-4 text-center text-xs text-gray-400">
          <p>CET Listening Studio v1.0.0</p>
          <p className="mt-1">Powered by FSRS · Built with React</p>
        </div>
      </div>
    </ScrollArea>
  )
}
