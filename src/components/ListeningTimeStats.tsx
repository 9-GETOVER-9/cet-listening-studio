import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLocalDay } from '@/hooks/useLocalDay'
import { formatListeningTime, LISTENING_CATEGORIES, readListeningSlices, summarizeListeningTime } from '@/lib/listeningTime'
import { getListeningStorageError, retryListeningWrites } from '@/lib/audioTimeTracker'
import { getLocalDateStr } from '@/lib/utils'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

export function ListeningTimeStats({ owner, ready, details = false }: { owner: string; ready: boolean; details?: boolean }) {
  const today = useLocalDay()
  const [period, setPeriod] = useState(0)
  const [writeError, setWriteError] = useState(getListeningStorageError)
  const data = useLiveQuery(async () => {
    if (!ready) return null
    try { return { records: await readListeningSlices(owner), error: false } }
    catch { return { records: [], error: true } }
  }, [owner, ready])
  useEffect(() => {
    const update = () => setWriteError(getListeningStorageError())
    window.addEventListener('listening-time-storage', update)
    return () => window.removeEventListener('listening-time-storage', update)
  }, [])
  const start = new Date(`${today}T00:00:00`)
  start.setDate(start.getDate() - Math.max(0, period - 1))
  const records = data?.records ?? []
  const summary = summarizeListeningTime(records, period ? getLocalDateStr(start) : '', today)
  const daily = summarizeListeningTime(records, today, today)

  return <Card>
    <CardHeader><CardTitle className="text-base">听力时长</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {writeError && <div role="alert" className="text-sm text-orange-700">听力时长暂未保存，请保持页面打开后重试。<Button variant="ghost" size="sm" onClick={retryListeningWrites}>重试保存</Button></div>}
      {!data ? <p role="status" className="text-sm text-gray-500">正在读取听力记录…</p>
        : data.error ? <p role="alert" className="text-sm text-red-600">无法读取听力记录，请刷新页面重试。</p>
        : <>
          {details ? <>
            <div className="flex flex-wrap gap-2" aria-label="听力统计时间范围">
              {[[1, '今日'], [7, '近 7 天'], [30, '近 30 天'], [0, '累计']] .map(([value, label]) =>
                <Button key={value} size="sm" variant={period === value ? 'default' : 'outline'} aria-pressed={period === value} onClick={() => setPeriod(Number(value))}>{label}</Button>)}
            </div>
            <div><p className="text-sm text-gray-500">所选范围总时长</p><p className="mt-1 text-2xl font-semibold" data-testid="listening-total">{formatListeningTime(summary.total)}</p></div>
            <div className="divide-y divide-gray-100" aria-label="分类听力时长">
              {LISTENING_CATEGORIES.map(category => <div key={category.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>{category.label}</span><span className="font-medium tabular-nums" data-category={category.id}>{formatListeningTime(summary.categories[category.id])}</span>
              </div>)}
            </div>
          </> : <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500">今日听力</p><p className="mt-2 text-xl font-semibold" data-testid="listening-today">{formatListeningTime(daily.total)}</p></div>
            <div><p className="text-xs text-gray-500">累计听力</p><p className="mt-2 text-xl font-semibold" data-testid="listening-total">{formatListeningTime(summary.total)}</p></div>
          </div>}
        </>}
      <p className="text-xs leading-5 text-gray-500">按实际播放时间累计，暂停和缓冲不计时。记录从此功能启用后开始，仅保存在当前浏览器，按账号区分。</p>
    </CardContent>
  </Card>
}
