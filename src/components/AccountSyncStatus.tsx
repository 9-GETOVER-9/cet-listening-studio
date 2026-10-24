import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { syncAccountNow, useAccountSyncStatus } from '@/lib/accountSync'

export function AccountSyncStatus({ compact = false }: { compact?: boolean }) {
  const { phase, pending, lastSynced, message } = useAccountSyncStatus()
  const remoteRevision = useAccountSyncStatus(s => s.remoteRevision)
  const [seenRemoteRevision] = useState(remoteRevision)
  const location = useLocation()
  const sessionChanged = remoteRevision > seenRemoteRevision && /^\/(word-practice|nce\/shadowing|ielts\/listening)/.test(location.pathname)
  const Icon = phase === 'offline' ? CloudOff : phase === 'error' ? AlertCircle : phase === 'syncing' ? RefreshCw : Cloud
  const label = { guest: '访客 · 仅保存在本机', pending: '已保存 · 等待同步', syncing: '正在同步学习进度', synced: '学习进度已同步', offline: '离线 · 联网后自动同步', error: '同步失败 · 已保存在本机' }[phase]
  return <div className={compact ? 'text-xs' : 'space-y-2 text-sm'} aria-live="polite">
    <div className="flex flex-wrap items-center gap-2">
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${phase === 'syncing' ? 'animate-spin' : ''} ${phase === 'error' ? 'text-red-600' : phase === 'synced' ? 'text-emerald-700' : ''}`} />
      <span>{label}{pending > 0 ? ` · ${pending} 条待传` : ''}</span>
      {phase !== 'guest' && <button type="button" onClick={() => void syncAccountNow()} disabled={phase === 'syncing'} className="min-h-8 rounded border border-[var(--app-line)] px-2 disabled:opacity-50" aria-label={phase === 'error' ? '重试云同步' : '立即同步学习进度'}>{phase === 'error' ? '重试' : '同步'}</button>}
    </div>
    {!compact && message && <p role="alert" className="text-red-700">{message}</p>}
    {!compact && lastSynced > 0 && <p className="text-xs text-[var(--app-muted)]">最近同步：{new Date(lastSynced).toLocaleString()}</p>}
    {sessionChanged && <p className="mt-2">另一设备更新了练习位置。<button type="button" className="min-h-9 underline" onClick={() => window.location.reload()}>继续最新进度</button></p>}
  </div>
}

export function AccountSyncPanel() {
  const owner = useAccountSyncStatus(s => s.owner)
  const resume = useLiveQuery(async () => (await db.settings.get(`cloud-resume:${owner}`))?.value as { path: string; label: string } | undefined, [owner])
  const path = resume?.path
  const safePath = path && /^\/(card|nce\/shadowing|word-practice|ielts\/reading-538|ielts\/listening)(\/|\?|$)/.test(path) ? path : null
  return <section className="space-y-3 py-4" aria-label="账号云同步">
    <h3 className="font-semibold">账号云同步</h3>
    <AccountSyncStatus />
    <p className="text-sm text-[var(--app-muted)]">同一账号在手机和电脑接着学，离线记录联网后自动补传。</p>
    {safePath && <Link to={safePath} className="inline-block rounded border border-[var(--app-line)] px-3 py-2 text-[var(--app-accent)]">继续上次学习 →</Link>}
    <p className="text-xs text-[var(--app-muted)]">个人录音仅保存在录音设备的浏览器，不上传云端。</p>
  </section>
}
