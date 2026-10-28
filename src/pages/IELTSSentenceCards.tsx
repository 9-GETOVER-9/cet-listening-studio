import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, Play, Square, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { Rating } from '@/types'
import { createInitialFSRSState } from '@/lib/fsrsScheduler'
import { isIELTSReviewDue, isIELTSReviewNew, listIELTSReviewProgress, previewIELTSReview, readIELTSReviewSession, recordIELTSReview, saveIELTSReviewSession, summarizeIELTSReviews, type IELTSReviewProgress } from '@/lib/ieltsReview'
import { saveLearningResume } from '@/lib/accountSync'

type Sentence = { id: string; sourceIndex: number; english: string; chinese: string; start: number; end: number }
type Article = { id: string; part: number; number: number; title: string; sentences: Sentence[] }
type Catalog = { status: 'ready'; parts: Array<{ part: number; articles: Article[] }> }

const panel = 'rounded-3xl border border-[var(--app-line)] bg-[var(--app-surface)]'
const control = 'min-h-11 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-ink)] disabled:opacity-50'
const speeds = [0.75, 1, 1.25, 1.5]
const ratings: Array<{ rating: Rating; label: string }> = [
  { rating: Rating.Again, label: '重来' }, { rating: Rating.Hard, label: '困难' },
  { rating: Rating.Good, label: '良好' }, { rating: Rating.Easy, label: '简单' },
]

async function request<T>(route: 'catalog' | 'ticket', sessionToken: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/api/ielts/cards/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await response.text()
  let result: (T & { error?: string }) | null = null
  try { result = text ? JSON.parse(text) as T & { error?: string } : null } catch {
    throw new Error(`雅思卡片接口返回了无法识别的数据（HTTP ${response.status}）。请检查服务连接后重试。`)
  }
  if (!response.ok) throw new Error(result?.error || `雅思逐句卡片暂时无法读取（HTTP ${response.status}）。`)
  if (!result) throw new Error('雅思卡片服务没有返回内容，请检查连接后重试。')
  return result
}

function formatTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toFixed(2).padStart(5, '0')}`
}

function formatInterval(due: Date) {
  const minutes = Math.max(1, Math.ceil((due.getTime() - Date.now()) / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.ceil(minutes / 60)
  return hours < 24 ? `${hours} 小时` : `${Math.ceil(hours / 24)} 天`
}

export default function IELTSSentenceCards() {
  const { user, session, loading } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const articleId = searchParams.get('article') ?? ''
  const reviewMode = searchParams.get('mode') === 'due' ? 'due' : searchParams.get('mode') === 'new' ? 'new' : 'all'
  const player = useRef<HTMLAudioElement | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [part, setPart] = useState(1)
  const [position, setPosition] = useState(0)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showChinese, setShowChinese] = useState(false)
  const [ticketUrl, setTicketUrl] = useState('')
  const [audioStatus, setAudioStatus] = useState('')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [error, setError] = useState('')
  const [reviewProgress, setReviewProgress] = useState<IELTSReviewProgress[]>([])
  const [gradedSentenceId, setGradedSentenceId] = useState('')
  const [gradedLabel, setGradedLabel] = useState('')
  const [savingReview, setSavingReview] = useState(false)
  const [playedCurrent, setPlayedCurrent] = useState(false)

  useEffect(() => {
    if (!user || !session) return
    let active = true
    setLoadingCatalog(true)
    void request<Catalog>('catalog', session.access_token).then(value => {
      if (!active) return
      setCatalog(value)
      const requested = value.parts.flatMap(row => row.articles).find(row => row.id === articleId)
      setPart(requested?.part ?? value.parts[0]?.part ?? 1)
      setError('')
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : '雅思逐句卡片读取失败。')
    }).finally(() => { if (active) setLoadingCatalog(false) })
    return () => { active = false }
  }, [user, session, catalogRevision])

  useEffect(() => {
    if (!user?.id) return
    let active = true
    void Promise.all([listIELTSReviewProgress(user.id, 'sentence'), readIELTSReviewSession(user.id, 'sentence')]).then(([rows, saved]) => {
      if (!active) return
      setReviewProgress(rows)
      if (!articleId && saved && typeof saved.articleId === 'string') {
        const next = new URLSearchParams(searchParams)
        next.set('article', saved.articleId)
        if (saved.mode === 'due' || saved.mode === 'new') next.set('mode', saved.mode)
        setSearchParams(next, { replace: true })
      }
    }).catch(() => { if (active) setError('复习进度读取失败，刷新后可重试。') })
    return () => { active = false }
  }, [user?.id, articleId, searchParams, setSearchParams])

  const articles = catalog?.parts.find(row => row.part === part)?.articles ?? []
  const article = catalog?.parts.flatMap(row => row.articles).find(row => row.id === articleId)
  const progressById = useMemo(() => new Map(reviewProgress.map(row => [row.itemId, row])), [reviewProgress])
  const totalSentences = catalog?.parts.flatMap(row => row.articles).reduce((total, row) => total + row.sentences.length, 0) ?? 0
  const reviewSummary = summarizeIELTSReviews(reviewProgress, totalSentences)
  const visibleSentences = article?.sentences.filter(row => {
    const progress = progressById.get(row.id)
    return reviewMode === 'all' || (reviewMode === 'due'
      ? !!progress && !isIELTSReviewNew(progress) && isIELTSReviewDue(progress)
      : !progress || isIELTSReviewNew(progress))
  }) ?? []
  const sentence = visibleSentences[position]
  const sentenceProgress = sentence ? progressById.get(sentence.id) : undefined
  const ratingPreviews = sentence && user ? previewIELTSReview(sentenceProgress ?? {
    owner: user.id, module: 'sentence', itemId: sentence.id, fsrs: createInitialFSRSState(), lastRating: Rating.Good, updatedAt: 0,
  }) : null
  const timeLabel = useMemo(() => sentence ? `${formatTime(sentence.start)}–${formatTime(sentence.end)}` : '', [sentence])

  useEffect(() => {
    const current = player.current
    current?.pause()
    current?.removeAttribute('src')
    current?.load()
    player.current = null
    setPlaying(false)
    setPosition(0)
    setShowOriginal(false)
    setShowChinese(false)
    setTicketUrl('')
    setAudioStatus('')
    setPlayedCurrent(false)
    setGradedSentenceId('')
    setGradedLabel('')
    return () => {
      const audio = player.current
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
      player.current = null
    }
  }, [articleId])

  useEffect(() => {
    if (!user?.id || !article || !sentence) return
    void saveIELTSReviewSession(user.id, 'sentence', { articleId: article.id, sourceIndex: sentence.sourceIndex, mode: reviewMode })
      .catch(() => setError('续学位置暂未保存，联网后会自动重试。'))
    void saveLearningResume(user.id, `/ielts/listening-cards?article=${article.id}&mode=${reviewMode}`)
  }, [user?.id, article?.id, sentence?.id, reviewMode])

  useEffect(() => {
    setPlayedCurrent(false)
    setGradedSentenceId('')
    setGradedLabel('')
  }, [sentence?.id])

  async function prepareAudio() {
    if (!session || !article) return
    setAudioStatus('正在准备这篇文章的音频…')
    setError('')
    try {
      for (let attempt = 0; attempt < 80; attempt++) {
        const result = await request<{ state: string; url?: string; errorCode?: string }>('ticket', session.access_token, { articleId: article.id })
        if (result.state === 'ready' && result.url) {
          setTicketUrl(result.url)
          setAudioStatus('音频已就绪，再点播放即可听这一句。')
          return
        }
        if (result.state === 'failed' || result.state === 'missing') {
          throw new Error(result.errorCode === 'source_unavailable' ? '原音暂不可用，请稍后再试。' : '这篇文章的原音暂不可用。')
        }
        setAudioStatus(result.state === 'downloading' ? '正在缓存原音，请稍候…' : '正在排队准备原音…')
        await new Promise(resolve => window.setTimeout(resolve, 1500))
      }
      throw new Error('准备音频超时，请点重试。')
    } catch (reason) {
      setAudioStatus('')
      setError(reason instanceof Error ? reason.message : '音频准备失败，请重试。')
    }
  }

  async function playSentence() {
    if (!sentence) return
    if (!ticketUrl) { await prepareAudio(); return }
    try {
      let audio = player.current
      if (!audio) {
        audio = new Audio(ticketUrl)
        audio.preload = 'metadata'
        audio.addEventListener('timeupdate', () => {
          const current = player.current
          if (current && sentence && current.currentTime >= sentence.end) {
            current.pause()
            setPlaying(false)
            setPlayedCurrent(true)
          }
        })
        audio.addEventListener('ended', () => setPlaying(false))
        audio.addEventListener('error', () => { setPlaying(false); setError('原音播放失败，可以重新准备后再试。') })
        player.current = audio
      }
      if (!audio.paused) {
        audio.pause()
        setPlaying(false)
        return
      }
      audio.currentTime = sentence.start
      audio.playbackRate = speed
      await audio.play()
      setPlaying(true)
      setError('')
    } catch {
      setPlaying(false)
      setError('浏览器没有开始播放，请再点一次播放。')
    }
  }

  function move(delta: number) {
    if (!article) return
    const current = player.current
    current?.pause()
    current?.removeAttribute('src')
    current?.load()
    player.current = null
    setPlaying(false)
    setPosition(value => Math.max(0, Math.min(visibleSentences.length - 1, value + delta)))
    setShowOriginal(false)
    setShowChinese(false)
    setPlayedCurrent(false)
    setGradedSentenceId('')
    setGradedLabel('')
  }

  function enterArticle(row: Article) {
    setPart(row.part)
    setPosition(0)
    setShowOriginal(false)
    setShowChinese(false)
    setGradedSentenceId('')
    setGradedLabel('')
    setPlayedCurrent(false)
    setSearchParams({ article: row.id })
  }

  function leaveArticle() {
    const current = player.current
    current?.pause()
    current?.removeAttribute('src')
    current?.load()
    player.current = null
    setPlaying(false)
    setSearchParams({})
  }

  async function rateSentence(rating: Rating) {
    if (!user || !sentence || !playedCurrent || !showOriginal || savingReview || gradedSentenceId === sentence.id) return
    setSavingReview(true)
    try {
      const updated = await recordIELTSReview(user.id, 'sentence', sentence.id, rating)
      setReviewProgress(await listIELTSReviewProgress(user.id, 'sentence'))
      setGradedSentenceId(sentence.id)
      setGradedLabel(`${ratings.find(item => item.rating === rating)?.label} · 下次 ${updated.fsrs.due.toLocaleDateString()}`)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '评分保存失败，请重试。')
    } finally { setSavingReview(false) }
  }

  function enterFilteredArticle(row: Article, mode: 'due' | 'new') {
    setPart(row.part)
    setPosition(0)
    setGradedSentenceId('')
    setGradedLabel('')
    setSearchParams({ article: row.id, mode })
  }

  if (loading) return <div className="quiet-page" role="status">正在读取登录状态…</div>
  if (!user || !session || !user.email_confirmed_at) return <div className="quiet-page mx-auto max-w-xl space-y-4">
    <h1 className="font-serif text-3xl">雅思逐句听力卡片</h1>
    <p className="text-sm text-[var(--app-muted)]">登录并完成邮箱确认后，可打开这 40 篇文章及其原音。</p>
    <Link className={control} to={'/login?next=' + encodeURIComponent(location.pathname)}>登录</Link>
  </div>

  if (articleId && loadingCatalog && !catalog) return <div className="quiet-page" role="status">正在读取文章与逐句译文…</div>

  if (!articleId) return <div className="quiet-page mx-auto flex min-h-dvh w-full max-w-6xl flex-col pb-8">
    <Link to="/ielts" className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--app-muted)]"><ArrowLeft className="h-4 w-4" />返回雅思专区</Link>
    <header className="mb-6 border-b border-[var(--app-line)] pb-6">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--app-accent)]">IELTS · SENTENCE LISTENING</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="quiet-display text-3xl md:text-4xl">雅思逐句精听。</h1><p className="mt-2 text-sm text-[var(--app-muted)]">每个 Part 前 10 篇 · 一句一张卡 · 英文逗号保留在原句中</p></div>
        <p className="text-sm text-[var(--app-muted)]">{catalog ? `${reviewSummary.learned} / ${totalSentences} 句已学 · ${reviewSummary.due} 句到期` : loadingCatalog ? '正在读取文章…' : '文章暂不可用'}</p>
      </div>
    </header>

    <section className={`${panel} px-4 py-4 md:px-6`} aria-label="选择雅思听力 Part">
      <p className="mb-2 text-xs font-medium text-[var(--app-muted)]">选择 Part</p>
      <div className="inline-flex w-full flex-wrap gap-1 rounded-2xl bg-[var(--app-paper-2)] p-1 sm:w-auto">
        {[1, 2, 3, 4].map(number => <button key={number} type="button" aria-pressed={part === number} onClick={() => setPart(number)} className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-medium transition-colors sm:flex-initial ${part === number ? 'bg-[var(--app-surface)] text-[var(--app-ink)] shadow-sm' : 'text-[var(--app-muted)] hover:text-[var(--app-ink)]'}`}>
          Part {number}<span className="ml-2 text-xs opacity-70">{catalog?.parts.find(row => row.part === number)?.articles.length ?? 10} 篇</span>
        </button>)}
      </div>
    </section>

    {error && <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error} <button className="ml-2 underline" onClick={() => { setError(''); setCatalogRevision(value => value + 1) }}>重试</button></p>}
    <div className="mt-4 quiet-surface px-4 py-4 md:px-6">
      <p className="text-xs font-medium text-[var(--app-muted)]">文章列表</p>
      <p className="mt-1 text-sm text-[var(--app-muted)]">Part {part} · {articles.length} 篇文章 · 逐句播放原音并对照原文和译文</p>
    </div>

    <section className="flex-1 py-6" aria-label={`Part ${part} 文章列表`}>
      {loadingCatalog ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map(index => <div key={index} className={`${panel} h-36 animate-pulse`} />)}</div> : articles.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {articles.map(row => {
          const learned = row.sentences.filter(item => { const p = progressById.get(item.id); return !!p && !isIELTSReviewNew(p) }).length
          const due = row.sentences.filter(item => { const p = progressById.get(item.id); return !!p && !isIELTSReviewNew(p) && isIELTSReviewDue(p) }).length
          const fresh = row.sentences.length - learned
          return <article key={row.id} className={`${panel} flex min-h-44 flex-col p-5 sm:p-6`}>
          <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--app-accent)]">PART {row.part} · ARTICLE {String(row.number).padStart(2, '0')}</span><span className="rounded-full bg-[var(--app-paper-2)] px-3 py-1 text-xs text-[var(--app-muted)]">{row.sentences.length} 句</span></div>
          <h2 className="mt-4 font-serif text-xl leading-snug">{row.title}</h2>
          <p className="mt-2 text-sm text-[var(--app-muted)]">已学 {learned} · 到期 {due} · 新句 {fresh}</p>
          <button type="button" onClick={() => enterArticle(row)} className="mt-3 flex min-h-11 items-end justify-between gap-3 border-t border-[var(--app-line)] pt-4 text-sm font-semibold text-[var(--app-accent)] hover:underline">
            进入精听 <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={!due} onClick={() => enterFilteredArticle(row, 'due')} className="min-h-10 flex-1 rounded-xl border border-[var(--app-line)] px-2 text-xs disabled:opacity-50">到期复习 · {due}</button>
            <button type="button" disabled={!fresh} onClick={() => enterFilteredArticle(row, 'new')} className="min-h-10 flex-1 rounded-xl border border-[var(--app-line)] px-2 text-xs disabled:opacity-50">学习新句 · {fresh}</button>
          </div>
        </article>})}
      </div> : <div className={`${panel} p-6 text-sm text-[var(--app-muted)]`}>当前 Part 的文章暂不可用。</div>}
    </section>
  </div>

  if (!article || !sentence) return <div className="quiet-page mx-auto max-w-xl space-y-4"><p role="status" className="text-sm text-[var(--app-muted)]">{article && reviewMode !== 'all' ? (reviewMode === 'due' ? '本篇现在没有到期句子。' : '本篇的新句已经学完。') : '当前句子暂不可用，请返回文章列表重新选择。'}</p><Button onClick={leaveArticle}>返回文章列表</Button></div>

  const progress = (position + 1) / visibleSentences.length * 100
  return <div className="quiet-page mx-auto w-full max-w-6xl space-y-5 pb-8">
    <header className="flex items-center justify-between gap-2 border-b border-[var(--app-line)] pb-4">
      <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-2" onClick={leaveArticle}><ArrowLeft className="mr-1 h-4 w-4" />返回文章</Button>
      <div className="min-w-0 text-center"><p className="truncate text-sm font-medium">Part {article.part} · Article {String(article.number).padStart(2, '0')}</p><p className="truncate text-xs text-[var(--app-muted)]">{article.title}</p></div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="outline" size="icon" aria-label="上一句" className="h-11 w-11" disabled={position === 0} onClick={() => move(-1)}><ChevronLeft className="h-5 w-5" /></Button>
        <Button type="button" variant="outline" size="icon" aria-label="下一句" className="h-11 w-11" disabled={position >= visibleSentences.length - 1} onClick={() => move(1)}><ChevronRight className="h-5 w-5" /></Button>
      </div>
    </header>

    <div className="flex items-center justify-between text-sm text-[var(--app-muted)]"><span>{reviewMode === 'due' ? '到期复习' : reviewMode === 'new' ? '学习新句' : '逐句精听'}</span><span>{position + 1} / {visibleSentences.length}</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-paper-2)]" role="progressbar" aria-label="本篇练习进度" aria-valuemin={0} aria-valuemax={visibleSentences.length} aria-valuenow={position + 1}>
      <div className="h-full rounded-full bg-[var(--app-accent)] transition-[width]" style={{ width: `${progress}%` }} />
    </div>

    <main className={`${panel} flex min-h-[min(68dvh,680px)] flex-col p-5 shadow-sm sm:p-8 md:p-10`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--app-accent)]">LISTEN & REMEMBER</span>
        <span className="rounded-full bg-[var(--app-paper-2)] px-3 py-1 text-xs text-[var(--app-muted)]">{timeLabel}</span>
      </div>

      <div className="my-auto flex flex-col items-center justify-center py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--app-muted)]">ARTICLE {String(article.number).padStart(2, '0')} · SENTENCE {sentence.sourceIndex}</p>
        <h1 className="mt-3 max-w-3xl font-serif text-2xl leading-snug sm:text-3xl">{article.title}</h1>
        <p className="mt-6 max-w-lg text-sm leading-6 text-[var(--app-muted)]">先听一遍，试着复述这句话；准备好后查看原文。</p>

        <button type="button" aria-label={playing ? '暂停原音' : ticketUrl ? '播放原音' : '准备原音'} onClick={() => void playSentence()} disabled={loadingCatalog} className="mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-[var(--app-accent)] text-white shadow-lg transition-transform hover:scale-[1.03] disabled:opacity-50 sm:h-28 sm:w-28">
          {playing ? <Square aria-hidden className="h-8 w-8 fill-current" /> : ticketUrl ? <Play aria-hidden className="ml-1 h-9 w-9 fill-current" /> : <Volume2 aria-hidden className="h-9 w-9" />}
        </button>
        <span className="mt-3 text-sm font-medium">{playing ? '正在播放 · 点击暂停' : ticketUrl ? '播放这一句' : '准备原音'}</span>

        <div className="mt-6 inline-flex flex-wrap justify-center gap-1 rounded-full bg-[var(--app-paper-2)] p-1" aria-label="播放速度">
          {speeds.map(value => <button key={value} type="button" aria-pressed={speed === value} onClick={() => { setSpeed(value); if (player.current) player.current.playbackRate = value }} className={`min-h-10 min-w-14 rounded-full px-3 text-sm font-medium transition-colors ${speed === value ? 'bg-[var(--app-surface)] text-[var(--app-accent)] shadow-sm' : 'text-[var(--app-muted)] hover:text-[var(--app-ink)]'}`}>{value}×</button>)}
        </div>

        <Button type="button" className="mt-8 min-h-12 rounded-full px-7" onClick={() => { setShowOriginal(value => !value); setShowChinese(false) }}>
          {showOriginal ? <><Check className="mr-2 h-4 w-4" />收起原文</> : <><Eye className="mr-2 h-4 w-4" />查看原文</>}
        </Button>
        {audioStatus && <p role="status" className="mt-4 text-xs text-[var(--app-muted)]">{audioStatus}</p>}
        {playedCurrent && <p role="status" className="mt-3 text-xs text-emerald-700">这句已听完，可以查看原文并评分。</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </div>

      {showOriginal && <section className="border-t border-[var(--app-line)] pt-5" aria-label="句子原文和翻译">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--app-muted)]">ENGLISH</p>
        <p className="font-serif text-2xl leading-relaxed sm:text-3xl">{sentence.english}</p>
        <Button type="button" variant="outline" className="mt-5 min-h-11" onClick={() => setShowChinese(value => !value)}>{showChinese ? '隐藏中文' : '显示中文翻译'}</Button>
        {showChinese && <p className="mt-4 border-l-2 border-[var(--app-accent)] pl-4 text-base leading-7 text-[var(--app-muted)]">{sentence.chinese}</p>}
        <div className="mt-6 border-t border-[var(--app-line)] pt-5">
          <p className="text-sm font-medium">这句记得怎么样？</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ratings.map(({ rating, label }) => <Button key={rating} type="button" variant="outline" disabled={!playedCurrent || savingReview || gradedSentenceId === sentence.id}
              onClick={() => void rateSentence(rating)} className="min-h-12 flex-col gap-0.5 py-2">
              <span>{label}</span><small className="text-xs text-[var(--app-muted)]">{ratingPreviews ? formatInterval(ratingPreviews[rating].due) : ''}</small>
            </Button>)}
          </div>
          {!playedCurrent && <p className="mt-2 text-xs text-[var(--app-muted)]">听完整句后选择记忆程度。</p>}
          {gradedSentenceId === sentence.id && <p role="status" className="mt-2 text-sm text-emerald-700">已保存：{gradedLabel}</p>}
        </div>
      </section>}
    </main>

    <nav className="flex gap-3" aria-label="句子导航">
      <Button variant="outline" className="min-h-12 flex-1" disabled={position === 0} onClick={() => move(-1)}><ChevronLeft className="mr-1 h-4 w-4" />上一句</Button>
      <Button variant="outline" className="min-h-12 flex-1" disabled={position >= visibleSentences.length - 1} onClick={() => move(1)}>下一句<ChevronRight className="ml-1 h-4 w-4" /></Button>
    </nav>
  </div>
}
