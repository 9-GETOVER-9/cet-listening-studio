import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { checkSelection, matchStorageKey, matchWaves, waveTiles } from '@/lib/readingMatch'

type Round = { wave: number; order: string[]; cleared: string[]; errors: number; seconds: number; score: number }
type Result = Pick<Round, 'score' | 'seconds' | 'errors'>
type Progress = { round: Round; results: Record<number, Result[]>; favorites: string[] }

function newRound(wave: number): Round {
  const order = waveTiles(wave).map(tile => tile.id)
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[order[index], order[other]] = [order[other], order[index]]
  }
  return { wave, order, cleared: [], errors: 0, seconds: 0, score: 0 }
}

function restore(storageKey: string, demo: boolean): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Progress | null
    if (saved && (!demo || saved.round.wave === 0) && matchWaves[saved.round.wave] && Array.isArray(saved.favorites) && saved.results) {
      const { order, cleared, wave } = saved.round
      const tiles = waveTiles(wave)
      const groups = matchWaves[wave]
      if (order.length === tiles.length && new Set(order).size === tiles.length
        && tiles.every(tile => order.includes(tile.id)) && new Set(cleared).size === cleared.length
        && cleared.every(id => groups.some(group => group.id === id))
        && [saved.round.score, saved.round.seconds, saved.round.errors].every(value => Number.isSafeInteger(value) && value >= 0)) return saved
    }
  } catch {
    // Start a fresh round if stored progress cannot be read.
  }
  return { round: newRound(0), results: {}, favorites: [] }
}

export default function IELTSReadingMatch() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const demo = params.get('play') === 'demo'
  if (demo) return <PublicReadingMatchDemo />
  const owner = user?.id ?? 'guest'
  const storageKey = matchStorageKey(owner)
  return <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
    <Link to="/ielts/reading-538" className="inline-flex min-h-11 items-center underline underline-offset-4">← 返回同义替换</Link>
    <h1 className="my-4 font-serif text-3xl sm:text-4xl">考点对应消消乐</h1>
    {loading ? <p role="status">正在读取账号…</p> : <MatchGame key={storageKey} storageKey={storageKey} demo={false} />}
  </div>
}

export function PublicReadingMatchDemo() {
  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
    <Link reloadDocument to="/ielts/reading-538" className="inline-flex min-h-11 items-center underline underline-offset-4">← 返回同义替换</Link>
    <h1 className="my-4 font-serif text-3xl sm:text-4xl">考点对应消消乐</h1>
    <MatchGame storageKey="ielts-reading-match-demo-v1" demo />
  </main>
}

function MatchGame({ storageKey, demo }: { storageKey: string; demo: boolean }) {
  const [progress, setProgress] = useState(() => restore(storageKey, demo))
  const [selected, setSelected] = useState<string[]>([])
  const [hint, setHint] = useState('')
  const [message, setMessage] = useState('')
  const [panel, setPanel] = useState<'waves' | 'favorites'>()
  const [saveError, setSaveError] = useState(false)
  const { round } = progress
  const groups = matchWaves[round.wave]
  const tiles = waveTiles(round.wave)
  const done = round.cleared.length === groups.length

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress))
    } catch {
      const timer = window.setTimeout(() => setSaveError(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [storageKey, progress])

  useEffect(() => {
    if (done || panel) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setProgress(previous => ({ ...previous, round: { ...previous.round, seconds: previous.round.seconds + 1 } }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [done, panel, round.wave])

  function openWave(wave: number) {
    setProgress(previous => ({ ...previous, round: newRound(wave) }))
    setSelected([])
    setHint('')
    setMessage('')
    setPanel(undefined)
  }

  function choose(id: string) {
    setHint('')
    if (selected.includes(id)) {
      setSelected(selected.filter(tile => tile !== id))
      return
    }
    const tile = tiles.find(item => item.id === id)!
    const next = [...selected, id]
    const outcome = checkSelection(tiles, next)
    if (outcome === 'wrong') {
      setProgress(previous => ({ ...previous, round: { ...previous.round, errors: previous.round.errors + 1 } }))
      setMessage('这些词不属于同一组，请重新尝试。')
      return
    }
    if (outcome === 'partial') {
      setSelected(next)
      setMessage(`已选 ${next.length} 张，继续找齐同组词条。`)
      return
    }

    const group = groups.find(item => item.id === tile.group)!
    setSelected([])
    setMessage(`配对正确，+100 分。 ${group.words.join(' · ')}。 ${group.meaning}`)
    setProgress(previous => {
      const cleared = [...previous.round.cleared, group.id]
      const updated = { ...previous.round, cleared, score: previous.round.score + 100 }
      if (cleared.length !== groups.length) return { ...previous, round: updated }
      const { score, seconds, errors } = updated
      return { ...previous, round: updated, results: {
        ...previous.results, [round.wave]: [...(previous.results[round.wave] ?? []), { score, seconds, errors }],
      } }
    })
  }

  function showHint() {
    const anchor = tiles.find(tile => tile.id === selected[0])
    const candidate = tiles.find(tile => !round.cleared.includes(tile.group) && !selected.includes(tile.id)
      && (!anchor || tile.group === anchor.group))
    if (!candidate) return
    setHint(candidate.id)
    setMessage(`提示：试试「${candidate.text}」。`)
  }

  function toggleFavorite(id: string) {
    setProgress(previous => ({ ...previous, favorites: previous.favorites.includes(id)
      ? previous.favorites.filter(item => item !== id) : [...previous.favorites, id] }))
  }

  const renderGroup = (group: typeof groups[number]) => <li key={group.id} className="rounded-lg border p-3">
    <p className="font-semibold">{group.words.join(' · ')}</p>
    <p className="my-1 text-sm">{group.meaning}</p>
    {!demo && <Button size="sm" variant="outline" aria-pressed={progress.favorites.includes(group.id)}
      onClick={() => toggleFavorite(group.id)}>{progress.favorites.includes(group.id) ? '取消收藏' : '收藏词组'}</Button>}
  </li>

  return <div className="space-y-4">
    <p className="text-sm text-[var(--app-muted)]">选齐属于同一组的全部词条。部分表达只在阅读语境中对应。进度保存在当前浏览器。</p>
    <p>{demo ? '免登录试玩 · 示例第 1 波' : `第 ${round.wave + 1} / ${matchWaves.length} 波 · ${round.wave < 5 ? '示例' : '阅读 538'}`} · 已消除 {round.cleared.length} / {groups.length} 组</p>
    <p>{round.score} 分 · 错选 {round.errors} 次 · {round.seconds} 秒</p>
    <div className="flex flex-wrap gap-2">
      {!demo && <Button variant="outline" aria-expanded={panel === 'waves'} onClick={() => setPanel(panel === 'waves' ? undefined : 'waves')}>选择波次</Button>}
      {!demo && <Button variant="outline" aria-expanded={panel === 'favorites'} onClick={() => setPanel(panel === 'favorites' ? undefined : 'favorites')}>收藏词组（{progress.favorites.length}）</Button>}
      <Button variant="outline" disabled={done || Boolean(panel)} onClick={showHint}>提示</Button>
      <Button variant="outline" disabled={!selected.length} onClick={() => { setSelected([]); setHint(''); setMessage('已取消选择。') }}>取消选择</Button>
    </div>
    {panel === 'waves' && <div aria-label="选择波次" className="grid max-h-64 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">
      {matchWaves.map((_, index) => <Button key={index} variant={round.wave === index ? 'default' : 'outline'}
        aria-current={round.wave === index ? 'step' : undefined}
        onClick={() => index === round.wave ? setPanel(undefined) : openWave(index)}>
        第 {index + 1} 波{progress.results[index]?.length ? ' ✓' : ''}
      </Button>)}
    </div>}
    {panel === 'favorites' && <section aria-label="收藏词组">
      {progress.favorites.length ? <ul className="space-y-2">{matchWaves.flat().filter(group => progress.favorites.includes(group.id)).map(renderGroup)}</ul> : <p>还没有收藏。完成一波后可以收藏词组。</p>}
    </section>}
    {saveError && <p role="alert">浏览器无法保存游戏进度。</p>}
    <p role="status" aria-atomic="true" className="min-h-6 text-sm">{message}</p>
    {!panel && !done && <div aria-label="混排词牌" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {round.order.map(id => {
        const tile = tiles.find(item => item.id === id)!
        if (round.cleared.includes(tile.group)) return null
        const pressed = selected.includes(id)
        return <Button key={id} variant={pressed || tile.core ? 'default' : 'outline'}
          aria-pressed={pressed}
          className={`h-auto min-h-12 whitespace-normal px-2 py-2 [overflow-wrap:anywhere] ${pressed || hint === id ? 'ring-2 ring-offset-2 ring-[var(--app-accent)]' : ''} ${tile.core && !pressed ? 'opacity-90' : ''}`}
          onClick={() => choose(id)}>{tile.text}</Button>
      })}
    </div>}
    {!panel && done && <section aria-label="本波回顾" className="space-y-3">
      <h2 className="text-xl font-semibold">{round.wave === matchWaves.length - 1 ? '最后一波完成' : '本波完成'} · 词组回顾</h2>
      <div className="flex flex-wrap gap-2">
        {demo ? <Button asChild><Link reloadDocument to="/ielts/reading-538/match">继续完整练习</Link></Button>
          : round.wave + 1 < matchWaves.length && <Button onClick={() => openWave(round.wave + 1)}>下一波</Button>}
        <Button asChild variant="outline"><Link reloadDocument={demo} to="/ielts/reading-538">去阅读 538 复习</Link></Button>
        <Button variant="outline" onClick={() => openWave(round.wave)}>重玩本波</Button>
      </div>
      <ul className="space-y-2">{groups.map(renderGroup)}</ul>
    </section>}
  </div>
}
