import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Headphones, RotateCcw, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuietPageHeader } from '@/components/QuietPageHeader'
import { IELTSWalkman } from '@/components/IELTSWalkman'
import { IELTSHistory } from '@/components/IELTSHistory'
import { IELTSFrequencyReview } from '@/components/IELTSFrequencyReview'
import { IELTSNotesLibrary } from '@/components/IELTSNotesLibrary'
import { IELTSWordNotes } from '@/components/IELTSWordNotes'
import { useIELTSFrequencyProgress } from '@/hooks/useIELTSFrequencyProgress'
import { useIELTSAnnotations } from '@/hooks/useIELTSAnnotations'
import { useAuth } from '@/hooks/useAuth'
import { AudioTimeTracker, getListeningOwner } from '@/lib/audioTimeTracker'
import { createIELTSHistorySession, saveIELTSHistory, type IELTSHistorySession } from '@/lib/ieltsHistory'
import { checkSpelling, summarizeResults, type IELTSCard, type IELTSCorpus, type IELTSBook } from '@/lib/ieltsDictation'
import { emptyFrequencyRetry, frequencyRetryReducer, parseFrequencyShortcut } from '@/lib/ieltsFrequencyRetry'
import { FREQUENCY_REASON_LABELS, saveFrequencyOutcome, selectFrequencyCards, selectFrequencyTestCards, type FrequencyReason } from '@/lib/ieltsFrequencyProgress'
import { resolveFrequencyAnnotation, saveFrequencyAnnotation } from '@/lib/ieltsAnnotations'

const CHAPTERS = [3, 4, 5, 8, 11]
const panel = 'quiet-surface p-5 md:p-8'

export default function IELTSDictation() {
  const { user, loading: authLoading } = useAuth()
  const owner = user?.id ?? 'guest'
  if (authLoading) return <div className="quiet-page" role="status">正在准备学习记录…</div>
  return <IELTSStudy key={owner} owner={owner} />
}
const BOOK_TITLES = { wanglu: '王陆雅思语料库', frequency: '雅思高频语料库' }
function IELTSStudy({owner}:{owner:string}) {
  const [sourceParams] = useSearchParams()
  const initialBook = sourceParams.get('source') === 'frequency' ? 'frequency' : 'wanglu'
  const authLoading = false
  const [roundCards,setRoundCards] = useState(new Map<string,IELTSCard>())
  const frequency = useIELTSFrequencyProgress(owner)
  const [questionReason, setQuestionReason] = useState<FrequencyReason | undefined>(undefined)
  const [questionSaving, setQuestionSaving] = useState(false)
  const [questionSaveError, setQuestionSaveError] = useState('')
  const questionSavingRef = useRef(false)
  const confirmedFrequencyIdsRef = useRef(new Set<string>())
  const mountedRef = useRef(true)
  const [rate, setRate] = useState(1)
  const sessionRef = useRef<IELTSHistorySession | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'failed'>('idle')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [corpus, setCorpus] = useState<IELTSCorpus | null>(null)
  const [chineseIndex,setChineseIndex] = useState<IELTSCard[]>([])
  const [indexError,setIndexError]=useState('')
  const [book, setBook] = useState<Extract<IELTSBook, 'wanglu' | 'frequency'>>(initialBook)
  const [mode, setMode] = useState<'dictation' | 'walkman' | 'notes'>('dictation')
  const annotations = useIELTSAnnotations(owner, book === 'frequency')
  const chapters = book === 'frequency' ? [1,2,3,4,5,6,7,8] : CHAPTERS
  const groupName = (value: number) => book === 'frequency' ? `Unit ${value}` : `第 ${value} 章`
  const bookTitle = BOOK_TITLES[book]
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [chapter, setChapter] = useState(() => {
    const value = Number(sourceParams.get('chapter'))
    return (initialBook === 'frequency' ? [1,2,3,4,5,6,7,8] : CHAPTERS).includes(value) ? value : initialBook === 'frequency' ? 1 : 3
  })
  const [section, setSection] = useState(sourceParams.get('section') || 'all')
  const [limit, setLimit] = useState(['10','20','50','all'].includes(sourceParams.get('limit') || '') ? sourceParams.get('limit')! : '20')
  const [state, dispatch] = useReducer(frequencyRetryReducer, emptyFrequencyRetry)
  const [audioError, setAudioError] = useState('')
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackerRef = useRef<AudioTimeTracker | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const answerComposingRef = useRef(false)

  useEffect(()=>{
    const controller=new AbortController()
    fetch('/data/ielts-chinese-audio-v1.json',{signal:controller.signal}).then(async r=>{
      if(!r.ok)throw new Error('中文音频索引加载失败')
      const data=await r.json();if(!Array.isArray(data.cards)||!data.cards.length)throw new Error('中文音频索引无效')
      if(!controller.signal.aborted){setChineseIndex(data.cards);setIndexError('')}
    }).catch(()=>{if(!controller.signal.aborted)setIndexError('中文配音索引加载失败，请重新加载。')})
    return()=>controller.abort()
  },[reload])

  useEffect(() => {
    const controller = new AbortController()
    const path=book==='wanglu'?'/data/ielts-corpus-v1.json':'/data/ielts-high-frequency-v1.json'
    fetch(path, { signal: controller.signal, cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error('语料加载失败')
      const data: IELTSCorpus = await response.json()
      if (controller.signal.aborted) return
      const expected = book === 'frequency' ? [1,2,3,4,5,6,7,8] : CHAPTERS
      if (!data.cards?.length || !expected.every(ch => data.cards.some(card => card.chapter === ch))) throw new Error('章节数据不完整')
      setCorpus(data)
      setLoadError('')
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error.message || '语料加载失败，请重试')
    })
    return () => controller.abort()
  }, [reload, book])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      trackerRef.current?.dispose()
      const audio = audioRef.current
      if (audio) { audio.onended = null; audio.onerror = null; audio.pause() }
      audioRef.current = null
    }
  }, [])

  const byId = useMemo(() => state.queue.length ? roundCards : new Map(corpus?.cards.map(card => [card.id, card])), [corpus,state.queue,roundCards])
  const chineseById = useMemo(()=>new Map(chineseIndex.map(card=>[card.id,card])),[chineseIndex])
  const chapterCards = useMemo(() => corpus?.cards.filter(card => card.chapter === chapter) ?? [], [corpus, chapter])
  const sections = useMemo(() => [...new Set(chapterCards.map(card => card.section))], [chapterCards])
  const available = useMemo(()=>chapterCards.filter(card => section === 'all' || card.section === section),[chapterCards,section])
  const untested = useMemo(() => selectFrequencyCards(available, frequency.progress, 'untested'), [available, frequency.progress])
  const pending = useMemo(() => selectFrequencyCards(available, frequency.progress, 'mistakes'), [available, frequency.progress])
  const eligibleFrequencyCards = useMemo(() => selectFrequencyTestCards(available, frequency.progress), [available, frequency.progress])
  const testCards = book === 'frequency' ? eligibleFrequencyCards : available
  const frequencyReady = !frequency.loading && !frequency.error && !annotations.loading && !annotations.error
  const current = byId.get(state.queue[state.results.length])
  const currentAnnotation = current ? resolveFrequencyAnnotation(current.id, annotations.seeds, annotations.local,
    frequency.progress.find(record => record.cardId === current.id)?.reason) : undefined
  const currentFrequencyReason = questionReason === undefined
    ? currentAnnotation?.reason ?? null : questionReason
  const summary = summarizeResults(state.results)
  const active = state.queue.length > 0 && !state.finished
  const mistakes = state.results.filter(result => !result.passed)
  const displayedSaveStatus = state.finished && !state.results.length
    ? 'empty'
    : state.finished && saveStatus === 'idle' ? 'saving' : saveStatus
  const frequencyHistoryPending = book === 'frequency' && state.finished && (displayedSaveStatus === 'saving' || displayedSaveStatus === 'failed')

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate }, [rate])
  useEffect(() => {
    const session = sessionRef.current
    if (!state.finished || !session || !state.results.length) return
    let cancelled = false
    void saveIELTSHistory({ ...session, finishedAt: Date.now(), results: state.results }).then(() => {
      if (!cancelled) setSaveStatus('saved')
    }).catch(() => { if (!cancelled) setSaveStatus('failed') })
    return () => { cancelled = true }
  }, [state.finished, state.results, saveAttempt])

  function stopAudio() {
    trackerRef.current?.dispose()
    trackerRef.current = null
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlaying(false)
  }

  function play(card: IELTSCard) {
    if (questionSavingRef.current || !mountedRef.current) return
    stopAudio()
    setAudioError('')
    const audio = new Audio(card.audio)
    audio.playbackRate = rate
    audio.preservesPitch = true
    audioRef.current = audio
    trackerRef.current = new AudioTimeTracker(audio, { owner: getListeningOwner(), category: (card.sourceBook??book)==='frequency'?'frequency':'wanglu' })
    audio.onended = () => { if (audioRef.current === audio) setPlaying(false) }
    const failed = () => {
      if (audioRef.current !== audio) return
      setPlaying(false)
      setAudioError('音频未播放成功，请检查网络并点击重播。')
    }
    audio.onerror = failed
    setPlaying(true)
    void audio.play().catch(failed)
  }

  function start(cards: IELTSCard[], practice = false) {
    if (!cards.length || !corpus || authLoading || questionSavingRef.current || (book === 'frequency' && !frequencyReady)) return
    setQuestionReason(undefined)
    setQuestionSaveError('')
    confirmedFrequencyIdsRef.current.clear()
    setRoundCards(new Map(cards.map(card=>[card.id,card])))
    sessionRef.current = createIELTSHistorySession({ owner, book, chapter, groupLabel:groupName(chapter), section, corpusVersion: corpus.version, total: cards.length, practice })
    setSaveStatus('idle')
    dispatch({ type: 'start', queue: cards.map(card => card.id), frequencyMode: book === 'frequency' })
    play(cards[0])
  }

  async function confirm(passed: boolean) {
    if (!current || state.verdict === null || questionSavingRef.current) return
    if (book === 'frequency' && (state.verdict !== true || !state.firstAttempt)) return
    if (book === 'frequency' && confirmedFrequencyIdsRef.current.has(current.id)) return
    const actualPassed = book === 'frequency' ? state.firstAttempt!.passed : passed
    if (book === 'frequency') {
      const session = sessionRef.current
      if (!session) return
      questionSavingRef.current = true
      setQuestionSaving(true); setQuestionSaveError('')
      try {
        if (questionReason !== undefined) await saveFrequencyAnnotation(owner, current.id, { reason: questionReason })
        await saveFrequencyOutcome({ owner, sessionId: session.id, cardId: current.id, passed: actualPassed, reason: currentFrequencyReason })
      } catch {
        if (mountedRef.current) {
          setQuestionSaveError('本题保存失败，答案和原因仍然保留。请重试保存后继续。')
          setQuestionSaving(false)
        }
        questionSavingRef.current = false
        return
      }
      confirmedFrequencyIdsRef.current.add(current.id)
      questionSavingRef.current = false
      if (!mountedRef.current) return
      setQuestionSaving(false); setQuestionReason(undefined)
    }
    dispatch({ type: 'confirm', id: current.id, passed: actualPassed })
    const next = byId.get(state.queue[state.results.length + 1])
    if (next) play(next)
    else stopAudio()
  }

  function retryQuestion() {
    if (book !== 'frequency' || state.verdict !== false || !current || questionSavingRef.current) return
    dispatch({ type: 'retry' })
    play(current)
  }

  function frequencyEnter() {
    if (questionSavingRef.current) return
    if (state.verdict === null) formRef.current?.requestSubmit()
    else if (state.verdict === false) retryQuestion()
    else void confirm(true)
  }

  // Capture Enter before native form/button activation so one press has one action.
  // The answer form remains the sole entry point for checking an input answer.
  useEffect(() => {
    if (book !== 'frequency' || !active || !current) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest('button')
      const auxiliaryControl = !!button && !button.hasAttribute('data-frequency-enter')
      const contentEditable = target instanceof HTMLElement ? target.isContentEditable : !!target?.closest('[contenteditable="true"]')
      const answerInput = target === inputRef.current
      const shortcut = parseFrequencyShortcut({ key: event.key, ctrlKey: event.ctrlKey, altKey: event.altKey,
        metaKey: event.metaKey, shiftKey: event.shiftKey, repeat: event.repeat, isComposing: event.isComposing,
        keyCode: event.keyCode, targetTagName: target?.tagName, targetIsContentEditable: contentEditable,
        answerInput, targetIsAuxiliaryControl: auxiliaryControl })
      if (!shortcut) {
        // Held/modified/composing Enter must not fall through to a native
        // submit or button click. Notes retain their own newline behavior.
        const editable = contentEditable || ['TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
          || (target?.tagName === 'INPUT' && !answerInput)
        if (!editable && !auxiliaryControl && event.key === 'Enter') event.preventDefault()
        return
      }
      if (shortcut.type === 'reason') {
        if (state.firstAttempt?.passed !== false) return
        event.preventDefault()
        if (!questionSavingRef.current) setQuestionReason(shortcut.reason)
        return
      }
      event.preventDefault()
      if (!answerComposingRef.current) frequencyEnter()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  })

  useEffect(() => {
    if (active && state.verdict === null) inputRef.current?.focus()
  }, [active, state.results.length, state.verdict])

  return (
    <div className="quiet-page space-y-6">
      <QuietPageHeader eyebrow="IELTS · Listen & Learn" title="雅思语料库。"
        description="听发音，写出单词；也可以按章、按单元开启中英双语随身听。" />
      {!active && <div className="flex flex-wrap gap-2" aria-label="选择语料库">
        {(['wanglu', 'frequency'] as const).map(value => <Button key={value} variant={book === value ? 'default' : 'outline'} aria-pressed={book === value} disabled={frequencyHistoryPending}
          onClick={() => { if (value === book) return; stopAudio(); setRoundCards(new Map()); setCorpus(null); setLoadError(''); setBook(value); if (value === 'wanglu' && mode === 'notes') setMode('dictation'); setChapter(value === 'wanglu' ? 3 : 1); setSection('all'); dispatch({ type: 'start', queue: [] }) }}>
          {BOOK_TITLES[value]}
        </Button>)}
      </div>}
      <label className="flex items-center gap-3 text-sm">播放速度
        <select aria-label="播放速度" value={rate} disabled={questionSaving} onChange={event => setRate(Number(event.target.value))} className="border border-[var(--app-line)] bg-[var(--app-surface)] p-2">
          {[0.5, 0.75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{value} 倍{value === 1 ? ' · 原速' : ''}</option>)}
        </select>
      </label>
      {book === 'frequency' && frequency.loading && <p role="status">正在读取高频测试进度…</p>}
      {book === 'frequency' && frequency.error && <div role="alert">{frequency.error}<Button variant="outline" className="ml-3" onClick={frequency.retry}>重试读取进度</Button></div>}
      {book === 'frequency' && annotations.loading && <p role="status">正在读取高频笔记与标签…</p>}
      {book === 'frequency' && annotations.error && <div role="alert">{annotations.error}<Button variant="outline" className="ml-3" onClick={annotations.retry}>重新加载笔记</Button></div>}
      {loadError ? <div className={panel} role="alert">{loadError}<Button className="ml-3" onClick={() => setReload(reload + 1)}>重新加载</Button></div>
        : !corpus ? <div className={panel} role="status">正在加载听写语料…</div> : null}

      {corpus && !active && !state.finished && <section className={panel} aria-label="选择学习内容">
        <h2 className="mb-4 text-xl font-semibold">{bookTitle}</h2>
        <div className="mb-5 flex gap-2">
          <Button variant={mode === 'dictation' ? 'default' : 'outline'} aria-pressed={mode === 'dictation'} onClick={() => { stopAudio(); setMode('dictation') }}>听写测试</Button>
          <Button variant={mode === 'walkman' ? 'default' : 'outline'} aria-pressed={mode === 'walkman'} onClick={() => { stopAudio(); setMode('walkman') }}>{book === 'frequency' ? '错词复习' : '随身听'}</Button>
          {book === 'frequency' && <Button variant={mode === 'notes' ? 'default' : 'outline'} aria-pressed={mode === 'notes'} onClick={() => { stopAudio(); setMode('notes') }}>词条笔记</Button>}
        </div>
        <div className="mb-6 flex flex-wrap gap-2">
          {chapters.map(ch => <Button key={ch} variant={chapter === ch ? 'default' : 'outline'} aria-pressed={chapter === ch}
            onClick={() => { setChapter(ch); setSection('all') }}>{groupName(ch)} <span className="ml-1 text-xs opacity-70">{corpus.cards.filter(card => card.chapter === ch).length} 题</span></Button>)}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm">选择小节
            <select className="mt-2 block w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-3" value={section} onChange={event => setSection(event.target.value)}>
              <option value="all">全部（{chapterCards.length} 题）</option>
              {sections.map(value => <option key={value} value={value}>{value}（{chapterCards.filter(card => card.section === value).length} 题）</option>)}
            </select>
          </label>
          {mode === 'dictation' && <label className="text-sm">本轮题量
            <select className="mt-2 block w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-3" value={limit} onChange={event => setLimit(event.target.value)}>
              <option value="10">10 题 · 快速测试</option><option value="20">20 题</option><option value="50">50 题</option><option value="all">全部</option>
            </select>
          </label>}
        </div>
        {book === 'frequency' && frequencyReady && <p role="status" className="mt-5 text-sm">未测 {untested.length} 词 · 已掌握 {available.length - untested.length - pending.length} 词 · 待复习 {pending.length} 词</p>}
        {mode === 'dictation' ? <><p className="my-5 text-sm leading-6 text-[var(--app-muted)]">{book === 'frequency' ? '优先测待复习错词，再测未测词，已掌握的词自动跳过。答错后反复重拼同一个词，首次判定计入准确率；以后新一轮首次答对才移出错词。' : '按原牌组顺序出题，提交后显示答案。'}忽略大小写、多余空格和末尾标点；拼写和词形需要正确。</p>
        <div className="flex flex-wrap gap-3"><Button size="lg" disabled={!testCards.length || authLoading || (book === 'frequency' && !frequencyReady)} onClick={() => start(limit === 'all' ? testCards : testCards.slice(0, Number(limit)))}>
          <Headphones className="mr-2 h-4 w-4" />开始听写 · {limit === 'all' ? testCards.length : Math.min(testCards.length, Number(limit))} 题
        </Button>
        <Button asChild size="lg" variant="outline"><a href={`/word-practice?${new URLSearchParams({ source: book, chapter: String(chapter), section, queue: 'all', mode: 'dictation', limit })}`}>进入专注单词练习</a></Button>
        {book === 'frequency' && <Button size="lg" variant="outline" disabled={!available.length || !frequencyReady} onClick={() => start(limit === 'all' ? available : available.slice(0, Number(limit)))}>重新测验所选内容</Button>}</div>
        {book === 'frequency' && frequencyReady && !testCards.length && <p role="status" className="mt-4 text-sm">所选内容已全部掌握，可以重新测验。</p>}
        </> : mode === 'notes' && book === 'frequency' ? frequencyReady && <IELTSNotesLibrary key={`${owner}:${chapter}:${section}`} owner={owner} cards={available}
          seeds={annotations.seeds} local={annotations.local} progress={frequency.progress} />
          : book === 'frequency' ? frequencyReady && <IELTSFrequencyReview key={`${owner}:${chapter}:${section}`} owner={owner} cards={available} progress={frequency.progress}
          seeds={annotations.seeds} local={annotations.local}
          chapter={chapter} section={section}
          chineseById={chineseById} rate={rate} indexError={indexError} onReload={() => setReload(value => value + 1)} onStart={cards => start(cards, true)} />
          : <IELTSWalkman corpus={corpus} chapter={chapter} section={section} title={bookTitle} rate={rate} book={book} />}
      </section>}

      {active && current && <section className={panel} aria-label="听写题目">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-line)] pb-4 text-sm text-[var(--app-muted)]">
          <span>{groupName(current.chapter)} · {current.section} · 第 {state.results.length + 1} / {state.queue.length} 题</span>
          <Button variant="ghost" size="sm" disabled={questionSaving || !!questionSaveError} onClick={() => { if (questionSavingRef.current || questionSaveError) return; stopAudio(); dispatch({ type: 'finish' }) }}>结束本轮</Button>
        </div>
        <div className="my-8 text-center">
          <Button size="lg" variant="outline" disabled={questionSaving} onClick={() => play(current)}><Volume2 className="mr-2 h-5 w-5" />{playing ? '正在播放 · 点击重播' : '重播发音'}</Button>
          {audioError && <p role="alert" className="mt-3 text-sm text-red-600">{audioError}</p>}
          <p className="mt-4 text-sm text-[var(--app-muted)]">听到什么，就写下什么。</p>
          {book === 'frequency' && <p className="mt-2 text-sm text-[var(--app-muted)]">Enter 检查答案 · 答错后 Enter 隐藏答案重拼 · 答对后 Enter 保存并进入下一词</p>}
        </div>
        <form ref={formRef} onSubmit={event => {
          event.preventDefault()
          if (state.verdict !== null || !state.draft.trim() || audioError || questionSavingRef.current
            || (book === 'frequency' && answerComposingRef.current)) return
          stopAudio()
          dispatch({ type: 'check', answer: state.draft, correct: checkSpelling(state.draft, current.answers) })
        }}>
          <label htmlFor="ielts-answer" className="text-sm">你的答案</label>
          <input ref={inputRef} id="ielts-answer" value={state.draft} disabled={state.verdict !== null}
            onCompositionStart={() => { answerComposingRef.current = true }} onCompositionEnd={() => { answerComposingRef.current = false }}
            onChange={event => dispatch({ type: 'input', value: event.target.value })}
            autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
            placeholder="输入英文单词或词组" className="mt-2 w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-4 text-xl disabled:opacity-75" />
          {state.verdict === null && <div className="mt-5 flex flex-wrap gap-3">
            <Button data-frequency-enter type="submit" disabled={!state.draft.trim() || !!audioError}>检查答案</Button>
            <Button type="button" variant="outline" disabled={!!audioError} onClick={() => {
              stopAudio(); dispatch({ type: 'check', answer: state.draft, correct: false })
            }}>不会，查看答案</Button>
          </div>}
        </form>
        {state.verdict !== null && <div className="mt-6 border-t border-[var(--app-line)] pt-6" aria-live="polite">
          <p className={`flex items-center gap-2 font-semibold ${state.verdict ? 'text-emerald-700' : 'text-red-600'}`}>
            {state.verdict ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}系统判定：{state.verdict ? '通过' : '不通过'}
          </p>
          <p className="mt-4 text-sm text-[var(--app-muted)]">参考答案</p><p className="mt-1 break-words text-2xl font-semibold">{current.word}</p>
          {current.chinese && <p className="mt-2 text-[var(--app-muted)]">{current.chinese}</p>}
          {current.answers.length > 1 && <p className="mt-2 text-sm text-[var(--app-muted)]">可接受：{current.answers.join(' / ')}</p>}
          {book === 'frequency' ? <>
            {currentAnnotation && <div className="mt-5"><IELTSWordNotes key={`${owner}:${current.id}`} owner={owner} card={current}
              annotation={currentAnnotation} showReason={false} disabled={questionSaving} /></div>}
            {state.firstAttempt?.passed === false && <div className="mt-5 text-sm" role="group" aria-label="本题错题原因">
              <p>错题原因（可选）</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['pronunciation', 'spelling', 'both'] as const).map((reason, index) => <Button data-frequency-enter key={reason} type="button"
                  disabled={questionSaving} variant={currentFrequencyReason === reason ? 'default' : 'outline'} aria-pressed={currentFrequencyReason === reason}
                  onClick={() => { if (!questionSavingRef.current) setQuestionReason(reason) }}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.preventDefault() }}>
                  Ctrl+{index + 1} {FREQUENCY_REASON_LABELS[reason]}
                </Button>)}
                <Button data-frequency-enter type="button" variant="ghost" disabled={questionSaving} onClick={() => { if (!questionSavingRef.current) setQuestionReason(null) }}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.preventDefault() }}>清除标签</Button>
              </div><p className="mt-2 text-[var(--app-muted)]">鼠标点击或 Ctrl+1 / 2 / 3 标注；Enter 只检查、重拼或进入下一词。标签不影响判定。</p>
            </div>}
            <p className="mt-5 text-sm text-[var(--app-muted)]">{state.firstAttempt?.passed === false ? '首次答错仍计为错题；重拼不增加测试次数。' : '首次答对计入通过。'}{state.verdict ? ' Enter 保存并进入下一词。' : ' Enter 隐藏答案，在本词重新拼写。'}</p>
            {questionSaveError && <p role="alert" className="mt-3 text-sm text-red-600">{questionSaveError}</p>}
            <Button data-frequency-enter className="mt-4" disabled={questionSaving} onClick={frequencyEnter}>{questionSaving ? '正在保存本题…' : questionSaveError ? '重试保存本题' : state.verdict ? '保存并进入下一词 · Enter' : '隐藏答案，重新拼写 · Enter'}</Button>
          </> : <>
            <p className="mt-5 text-sm text-[var(--app-muted)]">确认本题后进入下一题。可根据实际听音情况调整判定，准确率按你最终确认的结果计算。</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant={state.verdict ? 'default' : 'outline'} onClick={() => { void confirm(true) }}>通过 / 会</Button>
              <Button variant={!state.verdict ? 'default' : 'outline'} onClick={() => { void confirm(false) }}>不通过 / 不会</Button>
            </div>
          </>}
        </div>}
        <p className="mt-6 text-sm text-[var(--app-muted)]">已确认 {summary.answered} 题 · 通过 {summary.passed} 题 · 当前准确率 {summary.accuracy === null ? '—' : `${summary.accuracy}%`}</p>
      </section>}

      {state.finished && <section className={panel} aria-label="听写结果">
        <p className="quiet-kicker">本轮听写结果</p>
        <h2 className="quiet-display mt-4 text-6xl">{summary.accuracy === null ? '—' : `${summary.accuracy}%`}</h2>
        <p className="mt-4 text-[var(--app-muted)]">通过 {summary.passed} 题 · 不通过 {summary.failed} 题 · 已确认 {summary.answered} / {state.queue.length} 题</p>
        <p className="mt-2 text-sm text-[var(--app-muted)]">准确率 = 通过题数 ÷ 已确认题数。未确认的题目不计入。</p>
        <p role="status" className="mt-2 text-sm text-[var(--app-muted)]">{displayedSaveStatus === 'saved' ? '成绩已保存到本机日志，刷新后仍可查看。' : displayedSaveStatus === 'empty' ? '本轮没有确认题目，不保存成绩。' : displayedSaveStatus === 'failed' ? '成绩保存失败，本轮结果仍可查看。' : '正在保存成绩…'}</p>
        {displayedSaveStatus === 'failed' && <Button className="mt-3" variant="outline" onClick={() => { setSaveStatus('idle'); setSaveAttempt(value => value + 1) }}>重试保存日志</Button>}
        <div className="my-6 flex flex-wrap gap-3">
          <Button variant="outline" disabled={frequencyHistoryPending} onClick={() => { stopAudio(); setRoundCards(new Map()); dispatch({ type: 'start', queue: [] }) }}>选择新一轮</Button>
          <Button disabled={!mistakes.length || authLoading || displayedSaveStatus === 'saving' || displayedSaveStatus === 'failed'} onClick={() => start(mistakes.map(result => byId.get(result.id)).filter((card): card is IELTSCard => !!card), true)}>
            <RotateCcw className="mr-2 h-4 w-4" />重练错题 · {mistakes.length} 题
          </Button>
          {book === 'frequency' && <Button variant="outline" disabled={frequencyHistoryPending} onClick={() => { stopAudio(); setRoundCards(new Map()); setMode('walkman'); dispatch({ type: 'start', queue: [] }) }}>查看待复习错词</Button>}
        </div>
        {!!mistakes.length && <div className="space-y-3 border-t border-[var(--app-line)] pt-5">
          <h3 className="font-semibold">本轮错题</h3>
          {mistakes.map(result => {
            const card = byId.get(result.id)
            return card ? <div key={result.id} className="flex items-center justify-between gap-3 border-b border-[var(--app-line)] pb-3">
              <div className="min-w-0"><p className="break-words font-medium">{card.word}</p><p className="break-words text-sm text-[var(--app-muted)]">你的答案：{result.answer || '不会 / 未填写'} · {card.section}</p></div>
              <Button variant="ghost" size="icon" aria-label={`播放 ${card.word}`} onClick={() => play(card)}><Volume2 className="h-4 w-4" /></Button>
            </div> : null
          })}
          {audioError && <p role="alert" className="text-sm text-red-600">{audioError}</p>}
        </div>}
      </section>}
      {!active && !authLoading && <IELTSHistory key={owner} owner={owner} />}
    </div>
  )
}
