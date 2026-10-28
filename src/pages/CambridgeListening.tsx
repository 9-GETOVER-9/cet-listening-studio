import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '@/hooks/useAuth'

import { supabase } from '@/lib/supabase'
import { Rating } from '@/types'
import { listIELTSReviewProgress, previewIELTSReview, readIELTSReviewSession, recordIELTSReview, saveIELTSReviewSession, summarizeIELTSReviews, type IELTSReviewProgress } from '@/lib/ieltsReview'
import { createInitialFSRSState } from '@/lib/fsrsScheduler'
import { saveLearningResume } from '@/lib/accountSync'



type Track = { id: string; book: number; test: number; part: number; filename: string; bytes: number }

type Book = { book: number; label: string; tests: number[]; availableTests: number[]; trackCount: number; bytes: number; missingParts: Array<{ test: number; part: number }> }

type Catalog = { status: 'ready'; books: Book[]; tracks: Track[]; cardTranscriptStatus: string }



const button = 'min-h-11 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-ink)] transition-colors hover:bg-[var(--app-paper-2)] disabled:cursor-not-allowed disabled:opacity-45'

const card = 'rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-4 sm:p-5'



async function request(path: 'claim' | 'catalog' | 'ticket', body: Record<string, unknown> = {}) {

  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) throw new Error('请先登录 Listening Studio')

  const response = await fetch(`/api/cambridge/${path}`, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },

    body: JSON.stringify(body),

    cache: 'no-store',

  })

  const result = await response.json() as Record<string, unknown>

  if (!response.ok) {

    const error = new Error(typeof result.error === 'string' ? result.error : '剑桥听力库请求失败') as Error & { status?: number }

    error.status = response.status

    throw error

  }

  return result

}



export default function CambridgeListening() {

  const { user, session, loading } = useAuth()

  const location = useLocation()

  if (loading) return <div className="quiet-page" role="status">正在读取登录状态…</div>

  if (!user || !session || !user.email_confirmed_at) return <div className="quiet-page mx-auto max-w-xl space-y-4"><h1 className="font-serif text-3xl">剑桥雅思听力</h1><p className="text-sm text-[var(--app-muted)]">登录后打开你的私人音频库。</p><Link className={button} to={'/login?next=' + encodeURIComponent(location.pathname)}>登录</Link></div>

  return <PrivateCambridgeLibrary key={user.id} owner={user.id} />

}



function PrivateCambridgeLibrary({ owner }: { owner: string }) {

  const audio = useRef<HTMLAudioElement>(null)

  const alive = useRef(true)

  const requestGeneration = useRef(0)

  const queue = useRef<string[]>([])

  const queueIndex = useRef(-1)

  const [catalog, setCatalog] = useState<Catalog | null>(null)

  const [loading, setLoading] = useState(true)

  const [claimRequired, setClaimRequired] = useState(false)

  const [claimCode, setClaimCode] = useState('')

  const [claimBusy, setClaimBusy] = useState(false)

  const [claimError, setClaimError] = useState('')

  const [error, setError] = useState('')

  const [bookNumber, setBookNumber] = useState<number | null>(null)

  const [testNumber, setTestNumber] = useState<number | null>(null)

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)

  const [playing, setPlaying] = useState(false)

  const [speed, setSpeed] = useState(1)

  const [loop, setLoop] = useState(false)

  const [sequenceActive, setSequenceActive] = useState(false)
  const [reviewMode, setReviewMode] = useState<'all' | 'due' | 'new'>('all')
  const [reviewProgress, setReviewProgress] = useState<IELTSReviewProgress[]>([])
  const [reviewLoaded, setReviewLoaded] = useState(false)
  const [playedTracks, setPlayedTracks] = useState<Set<string>>(() => new Set())
  const [ratedLabel, setRatedLabel] = useState<Record<string, string>>({})



  const loadCatalog = useCallback(async () => {

    setLoading(true)

    setError('')

    try {

      const result = await request('catalog') as Catalog

      if (!alive.current) return

      setCatalog(result)

      setClaimRequired(false)

      setBookNumber(current => result.books.some(item => item.book === current && item.trackCount) ? current : result.books.find(item => item.trackCount)?.book ?? null)

    } catch (reason) {

      if (!alive.current) return

      const status = (reason as Error & { status?: number }).status

      if (status === 403) setClaimRequired(true)

      else setError(reason instanceof Error ? reason.message : '音频库暂时无法打开')

    } finally {

      if (alive.current) setLoading(false)

    }

  }, [])



  useEffect(() => {

    alive.current = true

    void loadCatalog()

    return () => {

      alive.current = false

      requestGeneration.current += 1

      queue.current = []

      queueIndex.current = -1

      if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load() }

    }

  }, [loadCatalog])

  useEffect(() => {
    let active = true
    void Promise.all([listIELTSReviewProgress(owner, 'cambridge'), readIELTSReviewSession(owner, 'cambridge')]).then(([rows, saved]) => {
      if (!active) return
      setReviewProgress(rows)
      if (saved && typeof saved === 'object') {
        const state = saved as Record<string, unknown>
        if (typeof state.book === 'number') setBookNumber(state.book)
        if (typeof state.test === 'number') setTestNumber(state.test)
        if (typeof state.trackId === 'string') setActiveTrackId(state.trackId)
        if (state.mode === 'due' || state.mode === 'new' || state.mode === 'all') setReviewMode(state.mode)
      }
      setReviewLoaded(true)
    }).catch(() => { if (active) { setError('剑桥复习进度读取失败，刷新后可重试。'); setReviewLoaded(true) } })
    return () => { active = false }
  }, [owner])



  const book = catalog?.books.find(item => item.book === bookNumber)

  const tests = book?.availableTests ?? []

  useEffect(() => {

    if (book && !tests.includes(testNumber ?? -1)) setTestNumber(tests[0] ?? null)

  }, [book, testNumber, tests])

  const currentTracks = useMemo(() => catalog?.tracks.filter(track => track.book === bookNumber && track.test === testNumber).sort((a, b) => a.part - b.part) ?? [], [catalog, bookNumber, testNumber])
  const progressById = useMemo(() => new Map(reviewProgress.map(row => [row.itemId, row])), [reviewProgress])
  const trackMatches = (track: Track) => {
    const saved = progressById.get(track.id)
    return reviewMode === 'all' || (reviewMode === 'due'
      ? !!saved && saved.fsrs.reps > 0 && saved.fsrs.due.getTime() <= Date.now()
      : !saved || saved.fsrs.reps === 0)
  }
  const visibleTracks = useMemo(() => currentTracks.filter(track => {
    const saved = progressById.get(track.id)
    return reviewMode === 'all' || (reviewMode === 'due'
      ? !!saved && saved.fsrs.reps > 0 && saved.fsrs.due.getTime() <= Date.now()
      : !saved || saved.fsrs.reps === 0)
  }), [currentTracks, progressById, reviewMode])
  const reviewSummary = summarizeIELTSReviews(reviewProgress, catalog?.tracks.length ?? 0)
  const currentTrack = catalog?.tracks.find(track => track.id === activeTrackId)
  const ratingRows = currentTrack ? progressById.get(currentTrack.id) : undefined
  const ratingPreviews = currentTrack ? previewIELTSReview(ratingRows ?? {
    owner, module: 'cambridge', itemId: currentTrack.id, fsrs: createInitialFSRSState(), lastRating: Rating.Good, updatedAt: 0,
  }) : null

  useEffect(() => {
    if (!reviewLoaded) return
    void saveIELTSReviewSession(owner, 'cambridge', { book: bookNumber, test: testNumber, trackId: activeTrackId, mode: reviewMode })
      .catch(() => setError('剑桥续学位置暂未保存，联网后会自动重试。'))
    void saveLearningResume(owner, '/cambridge/listening')
  }, [owner, bookNumber, testNumber, activeTrackId, reviewMode, reviewLoaded])

  async function rateTrack(trackId: string, rating: Rating) {
    if (!playedTracks.has(trackId)) return
    try {
      const updated = await recordIELTSReview(owner, 'cambridge', trackId, rating)
      setReviewProgress(await listIELTSReviewProgress(owner, 'cambridge'))
      const label = ({ [Rating.Again]: '重来', [Rating.Hard]: '困难', [Rating.Good]: '良好', [Rating.Easy]: '简单' } as Record<Rating, string>)[rating]
      setRatedLabel(current => ({ ...current, [trackId]: `${label} · 下次 ${updated.fsrs.due.toLocaleDateString()}` }))
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '评分保存失败，请重试。') }
  }



  async function submitClaim(event: FormEvent<HTMLFormElement>) {

    event.preventDefault()

    setClaimBusy(true)

    setClaimError('')

    try {

      await request('claim', { code: claimCode.trim() })

      setClaimCode('')

      setClaimRequired(false)

      await loadCatalog()

    } catch (reason) {

      setClaimError(reason instanceof Error ? reason.message : '绑定码无效')

    } finally {

      setClaimBusy(false)

    }

  }



  function stopPlayback() {

    requestGeneration.current += 1

    queue.current = []

    queueIndex.current = -1

    setSequenceActive(false)

    setActiveTrackId(null)

    setPlaying(false)

    setError('')

    const player = audio.current

    if (player) {

      player.pause()

      player.removeAttribute('src')

      player.load()

    }

  }



  async function playTrack(trackId: string, sequence?: string[]) {

    const player = audio.current

    if (!player) return

    if (sequence) { queue.current = sequence; queueIndex.current = sequence.indexOf(trackId) }

    else { queue.current = []; queueIndex.current = -1 }

    setSequenceActive(Boolean(sequence?.length))

    const generation = ++requestGeneration.current

    setError('')

    setPlaying(false)

    player.pause()

    player.removeAttribute('src')

    player.load()

    setActiveTrackId(null)

    try {

      const result = await request('ticket', { trackId }) as { state: string; url?: string }

      if (!alive.current || generation !== requestGeneration.current) return

      if (result.state !== 'ready' || !result.url) throw new Error('本段音频暂时缺失')

      setActiveTrackId(trackId)

      player.src = result.url

      player.playbackRate = speed

      player.loop = !sequence?.length && loop

      player.load()

      await player.play()

    } catch (reason) {

      if (alive.current && generation === requestGeneration.current) {

        setPlaying(false)

        setSequenceActive(false)

        queue.current = []

        queueIndex.current = -1

        setError(reason instanceof Error ? reason.message : '音频加载失败，请稍后重试')

      }

    }

  }



  function playTest() {

    const sequence = visibleTracks.map(track => track.id)

    if (sequence.length) void playTrack(sequence[0], sequence)

  }



  const missingParts = book?.missingParts.filter(item => item.test === testNumber).map(item => item.part) ?? []

  const totalBytes = catalog?.tracks.reduce((sum, track) => sum + track.bytes, 0) ?? 0



  return <div className="quiet-page mx-auto max-w-6xl space-y-5 pb-32 sm:pb-10">

    <header className="flex flex-wrap items-end justify-between gap-3">

      <div><Link to="/ielts" className="inline-flex min-h-11 items-center px-2 text-sm text-[var(--app-muted)]">← 雅思学习</Link><p className="mt-4 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--app-muted)]">CAMBRIDGE IELTS · LISTENING</p><h1 className="mt-1 font-serif text-3xl sm:text-4xl">剑桥听力库</h1><p className="mt-2 text-sm text-[var(--app-muted)]">按书册、Test 和 Part 播放本地原音频。</p></div>

      {catalog && <span className="rounded-full bg-[var(--app-accent-soft)] px-3 py-1.5 text-xs text-[var(--app-accent)]">{catalog.tracks.length} 段 · {(totalBytes / 1_000_000_000).toFixed(2)} GB</span>}

    </header>

    {catalog && <section className={`${card} flex flex-wrap items-center justify-between gap-3`} aria-label="剑桥复习进度">
      <p className="text-sm">已学 {reviewSummary.learned} / {catalog.tracks.length} 段 · 到期 {reviewSummary.due} 段 · 新音轨 {reviewSummary.fresh} 段</p>
      <div className="flex flex-wrap gap-2">{([['all', '全部音轨'], ['due', `到期复习 · ${reviewSummary.due}`], ['new', `新音轨 · ${reviewSummary.fresh}`]] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={reviewMode === mode} onClick={() => { setReviewMode(mode); setPlayedTracks(new Set()); setRatedLabel({}) }} className={`${button} ${reviewMode === mode ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white' : ''}`}>{label}</button>)}</div>
    </section>}



    {claimRequired && <section className={`${card} mx-auto w-full max-w-2xl`}><h2 className="font-medium">连接你的私人音频库</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">输入桌面准备的单次绑定码。绑定后，这套音频只对当前登录账号开放。</p><form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={event => void submitClaim(event)}><input aria-label="私人音频库绑定码" autoComplete="off" value={claimCode} onChange={event => setClaimCode(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[var(--app-line)] bg-transparent px-4 py-3" placeholder="输入绑定码"/><button className={button} disabled={claimBusy || claimCode.trim().length < 12}>{claimBusy ? '正在绑定…' : '绑定到当前账号'}</button></form>{claimError && <p role="alert" className="mt-3 text-sm text-red-700">{claimError}</p>}</section>}

    {loading && <p role="status" className="py-10 text-center text-sm text-[var(--app-muted)]">正在读取私人音频库…</p>}

    {error && !claimRequired && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button className="ml-2 underline" onClick={() => void loadCatalog()}>重试</button></p>}



    {catalog && <div className="space-y-4">
      <section className={`${card} px-4 py-4 sm:px-6`}>
        <div className="flex items-center justify-between gap-3"><h2 className="font-medium">选择剑桥书册</h2><span className="text-xs text-[var(--app-muted)]">{catalog.books.filter(item => item.trackCount).length} 册可播放</span></div>
        <div className="mt-3 flex flex-wrap gap-2">{catalog.books.filter(item => item.trackCount).map(item => <button key={item.book} type="button" aria-pressed={bookNumber === item.book} onClick={() => { setBookNumber(item.book); setTestNumber(null); stopPlayback() }} className={`min-h-11 rounded-xl border px-4 text-sm ${bookNumber === item.book ? 'border-[var(--app-accent)] bg-[var(--app-accent)] font-semibold text-white' : 'border-[var(--app-line)] text-[var(--app-muted)]'}`}><span>剑桥 {item.book}</span><span className="ml-2 opacity-75">{item.trackCount} 段</span></button>)}</div>
      </section>

      <section className={`${card} px-4 py-4 sm:px-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-[var(--app-muted)]">{book?.label ?? '剑桥雅思'} · {currentTracks.length ? `Test ${testNumber}` : '选择 Test'}</p><h2 className="mt-1 font-serif text-2xl">选择 Test</h2></div><button type="button" className={button + ' min-h-11 bg-[var(--app-accent)] px-4 font-semibold text-white'} disabled={!currentTracks.length} onClick={playTest}>▶ 连播本 Test</button></div>
        <div className="mt-4 flex flex-wrap gap-2">{tests.map(test => <button key={test} type="button" aria-pressed={testNumber === test} className={`min-h-11 rounded-xl border px-4 text-sm ${testNumber === test ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] font-semibold text-[var(--app-accent)]' : 'border-[var(--app-line)] text-[var(--app-muted)]'}`} onClick={() => { setTestNumber(test); stopPlayback() }}>Test {test}</button>)}</div>
      </section>

      {!visibleTracks.length && <p role="status" className={`${card} text-sm text-[var(--app-muted)]`}>{reviewMode === 'due' ? '当前 Test 暂无到期音轨。' : reviewMode === 'new' ? '当前 Test 的新音轨已学完。' : '当前 Test 暂无可播放音轨。'}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map(part => {
        const track = currentTracks.find(item => item.part === part)
        if (!track || !trackMatches(track)) return null
        const isActive = track?.id === activeTrackId
        const saved = progressById.get(track.id)
        const hasPlayed = playedTracks.has(track.id)
        return <article key={part} className={`${card} flex min-h-36 flex-col justify-between p-5 ${!track ? 'opacity-65' : ''}`}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--app-accent)]">{book?.label ?? `剑桥 ${bookNumber}`} · Test {testNumber}</p><h3 className="mt-2 font-serif text-2xl">Part {part}</h3></div><span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--app-accent-soft)] text-xs font-semibold text-[var(--app-accent)]">{String(part).padStart(2, '0')}</span></div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--app-line)] pt-3"><small className="min-w-0 truncate text-xs text-[var(--app-muted)]">{`${(track.bytes / 1_000_000).toFixed(1)} MB · ${saved?.fsrs.reps ? (saved.fsrs.due.getTime() <= Date.now() ? '到期' : `下次 ${saved.fsrs.due.toLocaleDateString()}`) : '新音轨'}`}</small><button type="button" aria-pressed={isActive && playing} className={button + ' min-h-11 px-4'} onClick={() => { if (isActive && playing) audio.current?.pause(); else void playTrack(track.id) }}>{isActive && playing ? 'Ⅱ 暂停' : '▶ 播放原音'}</button></div>
          {hasPlayed && !ratedLabel[track.id] && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`为剑桥 Test ${track.test} Part ${track.part} 评分`}>{([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Rating[]).map((rating, index) => <button key={rating} type="button" className={button} onClick={() => void rateTrack(track.id, rating)}><span>{['重来', '困难', '良好', '简单'][index]}</span><small className="block text-xs text-[var(--app-muted)]">{ratingPreviews && isActive ? `${Math.max(1, Math.ceil((ratingPreviews[rating].due.getTime() - Date.now()) / 86_400_000))} 天后` : '复习'}</small></button>)}</div>}
          {ratedLabel[track.id] && <p role="status" className="mt-2 text-xs text-emerald-700">已保存：{ratedLabel[track.id]}</p>}
        </article>
      })}</div>

      <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-paper-2)] p-4 text-sm leading-6 text-[var(--app-muted)]"><strong className="text-[var(--app-ink)]">当前提供整段 Part 原音</strong><p className="mt-1">这套本地资料还没有完整对齐的原文、中文翻译和逐句时间点，因此保留整段音频卡片，不拆出未经核对的句子。{missingParts.length > 0 && ` 本 Test 暂缺 Part ${missingParts.join('、')}。`}</p></div>
    </div>}



    <section className={`${card} sticky bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] z-40 grid gap-3 shadow-sm sm:static sm:grid-cols-[1fr_2fr_auto] sm:items-center`}>

      <div className="min-w-0"><strong className="block truncate text-sm">{currentTrack ? `剑桥 ${currentTrack.book} · Test ${currentTrack.test} · Part ${currentTrack.part}` : '选择一个 Part 开始播放'}</strong><small className="text-xs text-[var(--app-muted)]">{error || (playing ? '正在播放原音频' : '原始 MP3 · 登录账号私有流媒体')}</small></div>

      <audio ref={audio} controls preload="none" className="w-full" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { const finishedId = activeTrackId; if (finishedId) setPlayedTracks(current => new Set(current).add(finishedId)); const next = queueIndex.current + 1; if (queue.current.length && next < queue.current.length) { const sequence = queue.current; queueIndex.current = next; void playTrack(sequence[next], sequence) } else { setPlaying(false); setSequenceActive(false); queue.current = []; queueIndex.current = -1 } }} />

      <div className="flex items-center justify-between gap-3 text-xs text-[var(--app-muted)] sm:justify-end"><label className="flex min-h-11 items-center gap-1.5">倍速<select aria-label="播放速度" className="min-h-11 min-w-20 rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] px-2 text-[var(--app-ink)]" value={speed} onChange={event => { const next = Number(event.target.value); setSpeed(next); if (audio.current) audio.current.playbackRate = next }}>{[0.8, 1, 1.25, 1.5].map(value => <option value={value} key={value}>{value}×</option>)}</select></label><label className="flex min-h-11 items-center gap-2 rounded-lg px-2"><input className="h-4 w-4" type="checkbox" checked={loop} disabled={sequenceActive} onChange={event => { setLoop(event.target.checked); if (audio.current && !sequenceActive) audio.current.loop = event.target.checked }} />单段循环</label></div>

    </section>

  </div>

}
