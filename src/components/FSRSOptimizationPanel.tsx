import { useEffect, useMemo, useRef, useState } from 'react'
import { default_w } from 'ts-fsrs'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { loadTrainingDataset } from '@/lib/fsrsHistory'
import { trainingIssue, validateWeights, type Dataset, type OptimizationResult, type OptimizationScope } from '@/lib/fsrsOptimization'
import { getFSRSOwner, getPersonalParameters, resetPersonalParameters, savePersonalParameters } from '@/lib/fsrsPreferences'
import { runOptimization } from '@/lib/fsrsOptimizerClient'

const scopes: Record<OptimizationScope, string> = { main: '听力卡片', notebook: '难点本', reading: '雅思阅读 538' }
export function FSRSOptimizationPanel({ owner }: { owner: string }) {
  const [scope, setScope] = useState<OptimizationScope>('main')
  const [includeLegacy, setIncludeLegacy] = useState(false)
  const [data, setData] = useState<Dataset | null>(null)
  const [result, setResult] = useState<OptimizationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const task = useRef<ReturnType<typeof runOptimization> | null>(null)
  const generation = useRef(0)
  const profile = getPersonalParameters(owner, scope)

  useEffect(() => {
    const id = ++generation.current
    let active = true
    loadTrainingDataset(owner, scope, includeLegacy).then(value => {
      if (active && id === generation.current) setData(value)
    }).catch(() => { if (active) setMessage('学习记录读取失败，请重试。') })
    // This ref is a monotonic request counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { active = false; generation.current++; task.current?.cancel(); task.current = null }
  }, [owner, scope, includeLegacy, refresh])

  useEffect(() => {
    const handleStorage = () => {
      generation.current++; task.current?.cancel(); task.current = null
      setBusy(false); setResult(null); setData(null); setRefresh(n => n + 1)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  function resetView() {
    generation.current++; task.current?.cancel(); task.current = null
    setData(null); setResult(null); setMessage(''); setBusy(false)
  }
  const issue = useMemo(() => data ? trainingIssue(data.cards) : '正在读取记录…', [data])
  async function start() {
    if (!data || issue || busy || task.current) return
    if (getFSRSOwner() !== owner) { setMessage('账号状态正在更新，请刷新页面后重试。'); return }
    const id = generation.current
    setBusy(true); setResult(null); setMessage(''); setProgress(0)
    try {
      const running = runOptimization(data.cards, profile?.weights ?? [...default_w], value => {
        if (id === generation.current) setProgress(value)
      })
      task.current = running
      const next = await running.promise
      if (id !== generation.current || getFSRSOwner() !== owner) return
      setResult(next)
      setMessage(next.acceptable ? '验证记录上的预测误差下降，可以应用。' : '本次未发现同时优于当前和默认参数的结果，继续使用现有参数。')
    } catch (error) {
      if (id === generation.current) setMessage(error instanceof Error ? error.message : '优化失败')
    } finally {
      if (id === generation.current) { setBusy(false); task.current = null }
    }
  }
  function apply() {
    if (!result?.acceptable || !validateWeights(result.weights) || getFSRSOwner() !== owner) return
    const current = getPersonalParameters(owner, scope)?.weights ?? [...default_w]
    if (JSON.stringify(current) !== JSON.stringify(result.baselineWeights)) {
      setResult(null); setMessage('参数已在另一页面更新，请重新优化。'); return
    }
    try {
      savePersonalParameters(owner, scope, result.weights)
      setResult(null); setMessage('个人参数已保存，将用于后续评分。已有复习日期保持不变。')
    } catch { setMessage('参数保存失败，仍使用原参数。请检查浏览器存储空间后重试。') }
  }
  function restore() {
    if (getFSRSOwner() !== owner) return
    try {
      resetPersonalParameters(owner, scope)
      setResult(null); setMessage('已恢复默认参数，已有复习日期保持不变。')
    } catch { setMessage('恢复失败，请重试。') }
  }
  return <Card className="mb-6" data-testid="fsrs-optimization">
    <CardHeader><CardTitle className="text-base">个人复习参数</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">根据你的回忆记录调整复习节奏。计算和参数仅保存在当前浏览器，同账号换设备需分别优化。</p>
      <label className="flex flex-wrap items-center gap-2 text-sm">训练内容
        <select aria-label="参数训练内容" className="max-w-full rounded border bg-background p-2" value={scope} disabled={busy} onChange={e => { resetView(); setIncludeLegacy(false); setScope(e.target.value as OptimizationScope) }}>
          {Object.entries(scopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p className="text-sm">当前：{profile ? '个人参数' : '默认参数'} · FSRS-6 · 目标保留率 90%</p>
      {profile && <p className="text-xs text-muted-foreground">上次应用：{new Date(profile.savedAt).toLocaleString()}</p>}
      {scope === 'main' && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={includeLegacy} disabled={busy} onChange={e => { resetView(); setIncludeLegacy(e.target.checked) }} />
        <span>本机旧听力评分均由我完成，允许纳入无账号标记的旧记录。</span>
      </label>}
      {data && <p className="text-sm">可用 {data.cards.length} 张卡片、{data.reviews} 条评分，其中 {data.interdayReviews} 次跨日复习；排除 {data.excludedCards} 张记录不完整、归属不明或不符合条件的卡片。{data.limited && '本次按完整卡片选取，最多使用 5000 条评分。'}</p>}
      {issue && <p className="text-sm text-muted-foreground">{issue}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !!issue} onClick={() => void start()}>优化我的参数</Button>
        {busy && <Button variant="outline" onClick={() => task.current?.cancel()}>取消优化</Button>}
        {!busy && <Button variant="outline" onClick={() => { resetView(); setRefresh(n => n + 1) }}>刷新记录</Button>}
        <Button variant="outline" disabled={busy || !profile} onClick={restore}>恢复默认参数</Button>
      </div>
      {busy && <p role="status" className="text-sm">正在计算 {progress}%… 可继续留在此页或取消。</p>}
      {result && <div className="rounded border p-3 text-sm space-y-2">
        <p>验证误差（越低越好）：当前 {result.before.logLoss.toFixed(4)} → 候选 {result.after.logLoss.toFixed(4)}；默认 {result.defaults.logLoss.toFixed(4)}</p>
        <p className="text-muted-foreground">使用 {result.trainingCards} 张卡片训练，另用 {result.validationCards} 张卡片验证。这是历史记录上的比较，不保证未来效果。</p>
        {result.acceptable && <Button onClick={apply}>应用个人参数</Button>}
      </div>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <p className="text-xs text-muted-foreground">“模糊”表示费力但独立想起；看答案后才明白请选“忘记”。新增难点会逐步积累可训练记录。</p>
    </CardContent>
  </Card>
}
