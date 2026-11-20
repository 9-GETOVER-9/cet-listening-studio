import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { loadReadingCorpus } from '@/lib/ieltsReadingLoader'
import { buildMatchLevels, matchStorageKey, type MatchPair } from '@/lib/readingMatch'

type Side = 'words' | 'answers'
type Selection = { side: Side; index: number }
type Round = {
  level: number; signature: string; words: number[]; answers: number[]
  matched: number[]; mistakes: number; seconds: number; done: boolean
}
type Progress = { round: Round; completed: string[] }

function shuffle(size: number) {
  const order = Array.from({ length: size }, (_, index) => index)
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

const signature = (pairs: MatchPair[]) => JSON.stringify(pairs.map(({ card, answer }) => [card.id, card.word, answer]))

function startRound(levels: MatchPair[][], level: number): Round {
  const pairs = levels[level]
  return { level, signature: signature(pairs), words: shuffle(pairs.length), answers: shuffle(pairs.length), matched: [], mistakes: 0, seconds: 0, done: false }
}

function restore(levels: MatchPair[][], owner: string) {
  const fallback: Progress = { round: startRound(levels, 0), completed: [] }
  try {
    const saved: Progress | null = JSON.parse(localStorage.getItem(matchStorageKey(owner)) ?? 'null')
    if (!saved) return { progress: fallback, message: '' }
    const round = saved.round
    const pairs = levels[round.level]
    const validIndices = (items: number[], count: number) => Array.isArray(items)
      && items.length === count && new Set(items).size === count
      && items.every(index => Number.isInteger(index) && index >= 0 && index < pairs.length)
    if (pairs && round.signature === signature(pairs)
      && validIndices(round.words, pairs.length) && validIndices(round.answers, pairs.length)
      && validIndices(round.matched, round.matched.length)
      && round.done === (round.matched.length === pairs.length)
      && Number.isSafeInteger(round.mistakes) && round.mistakes >= 0
      && Number.isSafeInteger(round.seconds) && round.seconds >= 0
      && Array.isArray(saved.completed)) return { progress: saved, message: '' }
    fallback.round = startRound(levels, pairs ? round.level : 0)
    if (Array.isArray(saved.completed)) fallback.completed = saved.completed.filter(key => levels.some(level => signature(level) === key))
  } catch {
    return { progress: fallback, message: '无法恢复上次牌局，已开始新一关。' }
  }
  return { progress: fallback, message: '词库已更新，已重新开始本关。' }
}

export default function IELTSReadingMatch() {
  const { user, loading } = useAuth()
  const [levels, setLevels] = useState<MatchPair[][]>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void loadReadingCorpus(controller.signal).then(corpus => {
      if (!controller.signal.aborted) setLevels(buildMatchLevels(corpus.cards))
    }).catch(() => {
      if (!controller.signal.aborted) setError('词库加载失败，请重试。')
    })
    return () => controller.abort()
  }, [attempt])

  const owner = user?.id ?? 'guest'
  return <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
    <Link to="/ielts/reading-538" className="inline-flex min-h-11 items-center underline underline-offset-4">← 返回同义替换</Link>
    <h1 className="my-4 font-serif text-3xl sm:text-4xl">阅读 538 消消乐</h1>
    {error ? <div role="alert">{error} <Button onClick={() => { setError(''); setAttempt(n => n + 1) }}>重新加载</Button></div>
      : loading || !levels ? <p role="status">正在准备牌组…</p>
        : !levels.length ? <p>当前词库没有可配对的词条。</p>
          : <MatchGame key={owner} owner={owner} levels={levels} />}
  </main>
}

function MatchGame({ owner, levels }: { owner: string; levels: MatchPair[][] }) {
  const [initial] = useState(() => restore(levels, owner))
  const [progress, setProgress] = useState(initial.progress)
  const [message, setMessage] = useState(initial.message)
  const [selected, setSelected] = useState<Selection>()
  const [choosing, setChoosing] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const { round } = progress
  const pairs = levels[round.level]

  useEffect(() => {
    try {
      localStorage.setItem(matchStorageKey(owner), JSON.stringify(progress))
    } catch {
      const timer = window.setTimeout(() => setSaveError(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [owner, progress])

  useEffect(() => {
    if (round.done) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setProgress(previous => previous.round.done ? previous : {
        ...previous, round: { ...previous.round, seconds: previous.round.seconds + 1 },
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [round.done, round.level])

  function openLevel(level: number) {
    setProgress(previous => ({ ...previous, round: startRound(levels, level) }))
    setSelected(undefined)
    setMessage('')
    setChoosing(false)
  }

  function choose(side: Side, index: number) {
    if (!selected || selected.side === side) {
      setSelected(selected?.index === index ? undefined : { side, index })
      return
    }
    setSelected(undefined)
    if (selected.index !== index) {
      setProgress(previous => ({ ...previous, round: { ...previous.round, mistakes: previous.round.mistakes + 1 } }))
      setMessage('这组不匹配，请再试一次。')
      return
    }
    const { card, answer } = pairs[index]
    setProgress(previous => {
      const matched = [...previous.round.matched, index]
      const done = matched.length === pairs.length
      const completed = done ? [...new Set([...previous.completed, round.signature])] : previous.completed
      return { completed, round: { ...previous.round, matched, done } }
    })
    setMessage(`配对正确：${card.word} ↔ ${answer}，${card.meaning}。${card.relation === 'context' ? ' 此替换适用于阅读语境。' : ''}`)
  }

  function renderColumn(side: Side, title: string) {
    return <section aria-label={title} className="min-w-0 space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {round[side].map(index => {
        const matched = round.matched.includes(index)
        const pressed = selected?.side === side && selected.index === index
        return <Button key={index} variant={pressed ? 'default' : 'outline'}
          className="h-auto min-h-12 w-full whitespace-normal break-words px-2 py-3 [overflow-wrap:anywhere]"
          aria-pressed={pressed} aria-disabled={matched}
          onClick={() => { if (!matched) choose(side, index) }}>
          {matched ? '已消除' : side === 'words' ? pairs[index].card.word : pairs[index].answer}
        </Button>
      })}
    </section>
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p>第 {round.level + 1} / {levels.length} 关 · 已配对 {round.matched.length} / {pairs.length}</p>
      <Button variant="outline" aria-expanded={choosing} onClick={() => setChoosing(value => !value)}>选择关卡</Button>
    </div>
    {choosing && <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">
      {levels.map((level, index) => <Button key={signature(level)} variant={index === round.level ? 'default' : 'outline'}
        aria-current={index === round.level ? 'step' : undefined}
        onClick={() => { if (index === round.level) setChoosing(false); else openLevel(index) }}>
        第 {index + 1} 关{progress.completed.includes(signature(level)) ? ' ✓' : ''}
      </Button>)}
    </div>}
    {!round.done && <p className="text-sm text-[var(--app-muted)]">从两列各选一张牌，找出可以互相替换的表达。</p>}
    {saveError && <p role="alert">浏览器无法保存游戏进度。</p>}
    <p role="status" aria-atomic="true" className="min-h-6 text-sm">{message}</p>
    <div className="grid grid-cols-2 gap-3 sm:gap-6">{renderColumn('words', '考点词')}{renderColumn('answers', '替换表达')}</div>
    {round.done && <section aria-label="本关成绩" className="space-y-3 rounded-xl border border-[var(--app-line)] p-4">
      <h2 className="text-lg font-semibold">{round.level + 1 === levels.length ? '最后一关完成' : '本关完成'}</h2>
      <p>正确 {pairs.length} 组 · 错配 {round.mistakes} 次 · 用时 {round.seconds} 秒</p>
      <div className="flex flex-wrap gap-2">
        {round.level + 1 < levels.length && <Button onClick={() => openLevel(round.level + 1)}>下一关</Button>}
        <Button variant="outline" onClick={() => openLevel(round.level)}>重玩本关</Button>
      </div>
    </section>}
  </div>
}
