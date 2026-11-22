import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { checkSelection, matchRelationNote, matchStorageKey, matchWaves, migrateMatchRound, waveTiles } from '@/lib/readingMatch'
import { getDueMatchGroups, isRetiredMatchGroup, saveMatchReview } from '@/lib/readingMatchReview'

type Round = { wave: number; order: string[]; cleared: string[]; errors: number; seconds: number; score: number; missed?: string[] }
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
      saved.round = migrateMatchRound(saved.round)
      saved.favorites = saved.favorites.filter(id => !isRetiredMatchGroup(id))
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
  if (params.get('play') === 'review') return loading ? <p role="status" className="p-6">正在读取账号…</p>
    : <MatchRecall key={owner} owner={owner} ids={getDueMatchGroups(owner)} />
  return <div className="mx-auto max-w-4xl px-4 py-4 sm:px-8 sm:py-6">
    <Link to="/ielts/reading-538" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">← 返回同义替换</Link>
    <h1 className="mb-3 font-serif text-2xl leading-tight sm:text-4xl">考点对应消消乐</h1>
    {loading ? <p role="status">正在读取账号…</p> : <MatchGame key={storageKey} storageKey={storageKey} owner={owner} demo={false} />}
  </div>
}

export function PublicReadingMatchDemo() {
  return <main className="mx-auto max-w-4xl px-4 py-4 sm:px-8 sm:py-6">
    <Link reloadDocument to="/ielts/reading-538" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">← 返回同义替换</Link>
    <h1 className="mb-3 font-serif text-2xl leading-tight sm:text-4xl">考点对应消消乐</h1>
    <MatchGame storageKey="ielts-reading-match-demo-v1" demo />
  </main>
}

function MatchGame({ storageKey, demo, owner }: { storageKey: string; demo: boolean; owner?: string }) {
  const [progress, setProgress] = useState(() => restore(storageKey, demo))
  const [selected, setSelected] = useState<string[]>([])
  const [hint, setHint] = useState('')
  const [message, setMessage] = useState('')
  const [panel, setPanel] = useState<'waves' | 'favorites'>()
  const [saveError, setSaveError] = useState(false)
  const [wrong, setWrong] = useState<{ id: string }>()
  const [retrying, setRetrying] = useState(false)
  const { round } = progress
  const groups = matchWaves[round.wave]
  const tiles = waveTiles(round.wave)
  const done = round.cleared.length === groups.length
  const missed = groups.filter(group => round.missed?.includes(group.id)).map(group => group.id)

  useEffect(() => {
    if (!wrong) return
    const timer = window.setTimeout(() => setWrong(undefined), 400)
    return () => window.clearTimeout(timer)
  }, [wrong])

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

  function choose(id: string, button: HTMLButtonElement) {
    setHint('')
    if (selected.includes(id)) {
      setSelected(selected.filter(tile => tile !== id))
      return
    }
    const tile = tiles.find(item => item.id === id)!
    const next = [...selected, id]
    const outcome = checkSelection(tiles, next)
    if (outcome === 'wrong') {
      setWrong({ id })
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        button.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 180 })
      }
      const anchor = tiles.find(item => item.id === selected[0])
      const ids = anchor ? [anchor.group, tile.group] : [tile.group]
      setProgress(previous => ({ ...previous, round: {
        ...previous.round, errors: previous.round.errors + 1, missed: [...new Set([...(previous.round.missed ?? []), ...ids])],
      } }))
      if (owner) {
        try { saveMatchReview(owner, ids) } catch { setSaveError(true) }
      }
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
    {matchRelationNote(group.coreWord) && <p className="my-1 text-sm text-[var(--app-muted)]">{matchRelationNote(group.coreWord)}</p>}
    {!demo && <Button size="sm" variant="outline" aria-pressed={progress.favorites.includes(group.id)}
      onClick={() => toggleFavorite(group.id)}>{progress.favorites.includes(group.id) ? '取消收藏' : '收藏词组'}</Button>}
  </li>

  if (retrying) return <MatchRecall owner={owner} ids={missed} onBack={() => setRetrying(false)} />

  return <div className="space-y-3">
    <section className="quiet-surface space-y-2 p-3 sm:p-4" aria-label="本波进度与操作">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <p className="font-semibold">{demo ? '试玩 · 示例第 1 波' : `第 ${round.wave + 1} / ${matchWaves.length} 波`} · 已消除 {round.cleared.length} / {groups.length} 组</p>
        <p className="text-[var(--app-muted)]">{round.score} 分 · 错选 {round.errors} 次 · {round.seconds} 秒</p>
      </div>
    <div className="flex flex-wrap gap-2">
      {!demo && <Button variant="outline" aria-expanded={panel === 'waves'} onClick={() => setPanel(panel === 'waves' ? undefined : 'waves')}>选择波次</Button>}
      {!demo && <Button variant="outline" aria-expanded={panel === 'favorites'} onClick={() => setPanel(panel === 'favorites' ? undefined : 'favorites')}>收藏词组（{progress.favorites.length}）</Button>}
      <Button variant="outline" disabled={done || Boolean(panel)} onClick={showHint}>提示</Button>
      {selected.length > 0 && <Button variant="outline" onClick={() => { setSelected([]); setHint(''); setMessage('已取消选择。') }}>取消选择</Button>}
    </div>
    </section>
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
    {!panel && !done && <section className="rounded-xl border border-[#426071] bg-[#102b3c] p-3 text-[#f7fbfa] sm:p-4">
      <h2 className="mb-2 text-sm font-semibold">选齐同组的全部词条</h2>
      <div aria-label="混排词牌" className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3 lg:grid-cols-4">
      {round.order.map(id => {
        const tile = tiles.find(item => item.id === id)!
        if (round.cleared.includes(tile.group)) return null
        const pressed = selected.includes(id)
        return <button type="button" key={id}
          aria-pressed={pressed}
          className={`min-h-12 rounded-lg border border-[#527282] px-2 py-2 text-sm font-semibold [overflow-wrap:anywhere] focus-visible:outline-[#bcece2] ${tile.text.split(' ').some(word => word.length > 10) ? 'min-[380px]:col-span-2 sm:col-span-1' : ''} ${wrong?.id === id ? 'ring-2 ring-red-400 bg-[#ffe9e2] text-red-950' : pressed || hint === id ? 'bg-[#bcece2] text-[#102b3c]' : tile.core ? 'bg-[#31586b]' : 'bg-[#19384a]'}`}
          onClick={event => choose(id, event.currentTarget)}>{tile.text}</button>
      })}
      </div>
      <p role="status" aria-atomic="true" className="mt-2 break-words text-sm text-[#d7e6e9]">{message || '部分表达只在特定阅读语境中对应。'}</p>
    </section>}
    {!panel && done && <section aria-label="本波回顾" className="quiet-surface space-y-3 p-4">
      <h2 className="text-xl font-semibold">{round.wave === matchWaves.length - 1 ? '最后一波完成' : '本波完成'} · 词组回顾</h2>
      <div className="flex flex-wrap gap-2">
        {missed.length > 0 && <Button onClick={() => setRetrying(true)}>重练这 {missed.length} 组错题</Button>}
        {demo ? <Button asChild variant={missed.length ? 'outline' : 'default'}><Link reloadDocument to="/ielts/reading-538/match">继续完整练习</Link></Button>
          : round.wave + 1 < matchWaves.length && <Button variant={missed.length ? 'outline' : 'default'} onClick={() => openWave(round.wave + 1)}>下一波</Button>}
        <Button asChild variant="outline"><Link reloadDocument={demo} to="/ielts/reading-538">去阅读 538 复习</Link></Button>
        <Button variant="outline" onClick={() => openWave(round.wave)}>重玩本波</Button>
      </div>
      <ul className="space-y-2">{groups.map(renderGroup)}</ul>
    </section>}
  </div>
}

function MatchRecall({ owner, ids, onBack }: { owner?: string; ids: string[]; onBack?: () => void }) {
  const [groups] = useState(() => ids.flatMap(id => {
    const group = matchWaves.flat().find(item => item.id === id)
    return group ? [group] : []
  }))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState(false)
  const group = groups[index]

  function rate(recalled: boolean) {
    if (owner && !onBack) {
      try { saveMatchReview(owner, [group.id], recalled) }
      catch { setError(true); return }
    }
    setError(false)
    setRevealed(false)
    setIndex(index + 1)
  }

  return <section className="mx-auto max-w-xl space-y-4 px-4 py-6" aria-label="主动回忆">
    <h2 className="font-serif text-2xl">消消乐错题 · 主动回忆</h2>
    {group ? <>
      <p className="text-sm">第 {index + 1} / {groups.length} 组</p>
      <p className="text-xl font-semibold break-words">{group.coreWord ?? group.words[0]}</p>
      <p>先想想它的中文意思，以及有哪些对应表达。</p>
      {revealed ? <>
        <p role="status">{group.meaning} · {group.words.join(' · ')}</p>
        {matchRelationNote(group.coreWord) && <p className="text-sm text-[var(--app-muted)]">{matchRelationNote(group.coreWord)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => rate(true)}>{onBack ? '想起来了' : '已记住'}</Button>
          <Button variant="outline" onClick={() => rate(false)}>{onBack ? '没想起来' : '明天再复习'}</Button>
        </div>
      </> : <Button onClick={() => setRevealed(true)}>查看答案</Button>}
    </> : <p role="status">{groups.length ? '本轮错题已复习完。' : '今天没有到期的消消乐错题。'}</p>}
    {error && <p role="alert">复习进度未保存，请重试。</p>}
    {onBack ? <Button variant="outline" onClick={onBack}>返回本波回顾</Button>
      : <Button asChild variant="outline"><Link to="/">返回首页</Link></Button>}
  </section>
}
