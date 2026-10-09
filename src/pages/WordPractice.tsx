import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Maximize2, RotateCcw, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WordPracticeControls } from '@/components/WordPracticeControls'
import { IELTSWordNotes, type IELTSWordNotesHandle } from '@/components/IELTSWordNotes'
import { useAuth } from '@/hooks/useAuth'
import { useIELTSAnnotations } from '@/hooks/useIELTSAnnotations'
import { useWordPracticeAudio } from '@/hooks/useWordPracticeAudio'
import { useWordPracticeNotebookSync } from '@/hooks/useWordPracticeNotebookSync'
import { resolveFrequencyAnnotation } from '@/lib/ieltsAnnotations'
import { db } from '@/db/schema'
import { canPracticeAutoNext, practiceEnterAllowed, shouldBlockPracticeNavigation, stepPracticeCountdown, type PracticeCountdown, type WordNotesStatus } from '@/lib/wordPracticeInteraction'
import {
  confirmPractice, createPracticeSession, defaultPracticeSettings, loadPracticeWords, parsePracticeOptions,
  practiceContext, practiceReducer, practiceSummary, practiceSourceUrl, practiceLocalDate, mergePracticeDailyProgress,
  readPracticeDailyProgress, readPracticeSession, readPracticeSettings, retryPracticeSave,
  savePracticeSession, savePracticeSettings, selectPracticeQueue,
  type PracticeAction, type PracticeMode, type PracticeOptions, type PracticeSession, type PracticeSettings, type PracticeWord,
} from '@/lib/wordPractice'

export default function WordPractice() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const options = useMemo(() => parsePracticeOptions(params), [params])
  const owner = user?.id || 'guest'
  if (loading) return <div className="quiet-page" role="status">正在准备学习记录…</div>
  return <PracticeStudy key={`${owner}:${practiceContext(options)}`} owner={owner} options={options} />
}
function PracticeStudy({ owner, options }: { owner: string; options: PracticeOptions }) {
  const navigate = useNavigate()
  const context = practiceContext(options)
  const [words, setWords] = useState<PracticeWord[]>([])
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [settings, setSettings] = useState(defaultPracticeSettings)
  const settingsRef = useRef(defaultPracticeSettings)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [dailyError, setDailyError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [draftPending, setDraftPending] = useState(false)
  const [settingsPending, setSettingsPending] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<PracticeCountdown>({ key: '', remaining: 0 })
  const [focus, setFocus] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesStatus, setNotesStatus] = useState<WordNotesStatus>({ dirty: false, saving: false, error: '' })
  const notesBlocked = shouldBlockPracticeNavigation(notesStatus)
  const onNotesStatus = useCallback((status: WordNotesStatus) => setNotesStatus(status), [])
  const [hidden, setHidden] = useState(document.hidden)
  const [composing, setComposing] = useState(false)
  const sessionRef = useRef<PracticeSession | null>(null)
  const mounted = useRef(true)
  const busy = useRef(false)
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  const settingsChain = useRef<Promise<void>>(Promise.resolve())
  const dailyReadToken = useRef(0)
  const draftWriteToken = useRef(0)
  const settingsWriteToken = useRef(0)
  const notesEditor = useRef<IELTSWordNotesHandle | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const audio = useWordPracticeAudio()
  const { pending: notebookSyncPending, retry: retryNotebookSync } = useWordPracticeNotebookSync(owner)
  const annotations = useIELTSAnnotations(owner, options.source === 'frequency')
  const navigationBlocked = shouldBlockPracticeNavigation(notesStatus, { saving, error: !!error, draftPending, settingsPending })
  const blocker = useBlocker(navigationBlocked)
  useEffect(() => { if (blocker.state === 'blocked' && !navigationBlocked) blocker.proceed() }, [blocker, navigationBlocked])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (navigationBlocked) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [navigationBlocked])
  const activeWord = session?.queue[session.position]
  const hasSession = !!session
  const isFinished = !!session?.finished
  const shownWord = preview !== null ? session?.queue[preview] : activeWord
  const revealed = preview !== null || session?.verdict !== null
  const mode = session?.mode || options.mode
  const recommendationQueue = options.source === 'notebook' ? 'due' : 'mistakes'
  const recommended = selectPracticeQueue(words, recommendationQueue)
  const wrongCount = selectPracticeQueue(words, 'mistakes').length
  const currentQueue = selectPracticeQueue(words, options.queue)
  const sourceName = options.source === 'notebook' ? '词汇难点本' : options.source === 'frequency' ? '雅思高频语料库' : '王陆雅思语料库'
  const sourcePath = practiceSourceUrl(options)
  const voice = audio.voices.find(v => v.voiceURI === settings.voice) || (!settings.voice ? audio.voices[0] : undefined)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const refreshDailyProgress = useCallback(async () => {
    const token = ++dailyReadToken.current
    try {
      const progress = await readPracticeDailyProgress(owner)
      if (!mounted.current || token !== dailyReadToken.current || progress.date !== practiceLocalDate()) return
      // A count-only refresh must preserve preference edits queued while this read was pending.
      const next = mergePracticeDailyProgress(settingsRef.current, progress)
      settingsRef.current = next; setSettings(next); setDailyError('')
    } catch {
      if (mounted.current && token === dailyReadToken.current) setDailyError('今日完成数读取失败。已确认的成绩仍安全保留，可单独重试读取。')
    }
  }, [owner])
  useEffect(() => {
    if (!ready) return
    const visible = () => { if (!document.hidden) void refreshDailyProgress() }
    const timer = window.setInterval(() => {
      if (!document.hidden && settingsRef.current.date !== practiceLocalDate()) void refreshDailyProgress()
    }, 1000)
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [ready, refreshDailyProgress])
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([loadPracticeWords(owner, options, controller.signal), readPracticeSession(owner, context), readPracticeSettings(owner)]).then(([loaded, restored, prefs]) => {
      if (controller.signal.aborted) return
      setWords(loaded); setSettings(prefs); settingsRef.current = prefs; setSession(restored); sessionRef.current = restored; setReady(true); setLoadError('')
    }).catch(() => { if (!controller.signal.aborted) setLoadError('语料或本机记录读取失败，请重试。') })
    return () => controller.abort()
  }, [owner, options, context, attempt])
  useEffect(() => {
    const change = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  useEffect(() => {
    const change = () => { if (!document.fullscreenElement) setFocus(false) }
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])

  const persist = useCallback((next: PracticeSession) => {
    const token = ++draftWriteToken.current
    setDraftPending(true)
    saveChain.current = saveChain.current.catch(() => {}).then(async () => {
      // Already queued snapshots keep their immutable owner/context key even if auth changes
      // or the component unmounts; never redirect this write to a newly active owner.
      await savePracticeSession(next)
    })
    void saveChain.current.then(() => {
      if (mounted.current && token === draftWriteToken.current) setDraftPending(false)
    }, () => {
      if (mounted.current && token === draftWriteToken.current) {
        setDraftPending(false); setError('练习草稿保存失败，当前答案仍保留。请重试保存后继续。')
      }
    })
  }, [])
  const dispatch = useCallback((action: PracticeAction) => {
    const current = sessionRef.current
    if (!current || busy.current) return
    const next = practiceReducer(current, action)
    sessionRef.current = next; setSession(next); persist(next)
  }, [persist])
  const play = useCallback((word: PracticeWord, sentence = false) => {
    audio.player.play({ id: word.id, word: sentence ? word.sentence || word.word : word.word, audio: sentence ? word.sentenceAudio : word.audio }, {
      repeats: sentence ? 1 : settings.repeats, speed: settings.speed, muted: settings.muted, voice,
    })
  }, [audio.player, settings.repeats, settings.speed, settings.muted, voice])
  const confirm = useCallback(async () => {
    const current = sessionRef.current
    if (!current || busy.current || preview !== null || notesOpen || notesBlocked || composing) return
    busy.current = true; setSaving(true)
    try {
      await saveChain.current
      await settingsChain.current
      const toSave = options.source === 'frequency' ? { ...current, queue: current.queue.map((word, index) => index === current.position ? {
        ...word, reason: resolveFrequencyAnnotation(word.id, annotations.seeds, annotations.local, word.reason).reason,
      } : word) } : current
      const next = await confirmPractice(toSave, () => mounted.current)
      if (!mounted.current) return
      if (next === toSave) return
      sessionRef.current = next; setSession(next); setError(''); audio.player.stop()
      // Display refresh is independent of the canonical grade/session commit. Its failure must
      // never present an already-committed question as failed or trigger a duplicate advance.
      void refreshDailyProgress()
      if (options.source === 'notebook') void retryNotebookSync()
      const word = current.queue[current.position]
      if (word.source === 'notebook') {
        void db.notebook.get(word.notebookId || word.id).then(item => { if (mounted.current && item) setWords(list => list.map(w => w.id === word.id ? { ...w, due: new Date(item.fsrsNotebook.due).getTime(), wrong: !current.firstVerdict } : w)) }).catch(() => {})
      } else if (current.mode === 'dictation') setWords(list => list.map(w => w.id === word.id ? { ...w, wrong: !current.firstVerdict } : w))
      if (!next.finished && next.mode === 'dictation') play(next.queue[next.position])
    } catch { if (mounted.current) setError('本题保存失败，答案、首判和笔记仍保留。请重试保存。') }
    finally { busy.current = false; if (mounted.current) setSaving(false) }
  }, [preview, notesOpen, notesBlocked, composing, audio.player, play, options, retryNotebookSync, refreshDailyProgress, annotations.seeds, annotations.local])
  const canAuto = canPracticeAutoNext({ hidden, editing: notesOpen || notesBlocked, composing, preview: preview !== null, saving,
    error: !!error || !!annotations.error || annotations.loading, verdict: session?.verdict ?? null, finished: !!session?.finished })
  useEffect(() => {
    if (!hasSession || isFinished || hidden || saving || preview !== null || notesOpen || notesBlocked || composing || error) return
    const timer = window.setInterval(() => dispatch({ type: 'tick', seconds: 1 }), 1000)
    return () => window.clearInterval(timer)
  }, [hasSession, isFinished, hidden, saving, preview, notesOpen, notesBlocked, composing, error, dispatch])
  const countdownKey = session?.verdict === true && !session.finished ? `${session.sessionId}:${session.position}:${settings.autoNext}` : ''
  const remaining = countdown.key === countdownKey ? countdown.remaining : settings.autoNext
  useEffect(() => {
    if (!canAuto || !settings.autoNext) return
    const timer = window.setTimeout(() => {
      const next = stepPracticeCountdown(countdown, countdownKey, settings.autoNext)
      setCountdown(next)
      if (next.remaining <= 0) void confirm()
    }, countdown.key === countdownKey && countdown.remaining === 0 ? 0 : 1000)
    return () => window.clearTimeout(timer)
  }, [canAuto, settings.autoNext, countdown, countdownKey, confirm])
  useEffect(() => {
    if (hasSession && !isFinished && preview === null && !notesOpen) input.current?.focus()
  }, [session?.position, session?.verdict, hasSession, isFinished, preview, notesOpen])
  useEffect(() => { audio.player.update({ speed: settings.speed, muted: settings.muted }) }, [audio.player, settings.speed, settings.muted])

  async function start(queue: PracticeWord[]) {
    if (!queue.length || busy.current || notesBlocked) return
    const target = queue.findIndex(word => word.id === options.targetId)
    const ordered = target > 0 ? [...queue.slice(target), ...queue.slice(0, target)] : queue
    const next = createPracticeSession(owner, context, options.limit ? ordered.slice(0, options.limit) : ordered, options.mode)
    busy.current = true; setSaving(true)
    try {
      await saveChain.current.catch(() => {}); await savePracticeSession(next)
      if (mounted.current) { sessionRef.current = next; setSession(next); setPreview(null); setError(''); if (next.mode === 'dictation') play(next.queue[0]) }
    } catch { if (mounted.current) setError('无法保存本轮队列，请重试开始。') }
    finally { busy.current = false; if (mounted.current) setSaving(false) }
  }
  function checkOrNext() {
    if (saving || error || preview !== null || composing || notesBlocked || !session) return
    if (session.verdict === true) void confirm()
    else if (session.verdict === false) { setNotesOpen(false); dispatch({ type: 'retry' }); audio.player.stop(); if (activeWord && mode === 'dictation') play(activeWord) }
    else dispatch({ type: 'check' })
  }
  async function retrySave() {
    if (busy.current) return
    busy.current = true; setSaving(true)
    try { await saveChain.current.catch(() => {}); await settingsChain.current.catch(() => {}); await retryPracticeSave(owner, session, settingsRef.current); saveChain.current = Promise.resolve(); settingsChain.current = Promise.resolve(); if (mounted.current) setError('') }
    catch { if (mounted.current) setError('本机保存仍失败，请检查浏览器存储空间后重试。') }
    finally { busy.current = false; if (mounted.current) setSaving(false) }
  }
  function changeSettings(patch: Partial<PracticeSettings>) {
    if (patch.voice !== undefined) audio.player.stop()
    const next = { ...settingsRef.current, ...patch }; settingsRef.current = next; setSettings(next)
    const token = ++settingsWriteToken.current
    setSettingsPending(true)
    settingsChain.current = settingsChain.current.catch(() => {}).then(async () => { await savePracticeSettings(owner, next) })
    void settingsChain.current.then(() => {
      if (mounted.current && token === settingsWriteToken.current) setSettingsPending(false)
    }, () => {
      if (mounted.current && token === settingsWriteToken.current) { setSettingsPending(false); setError('设置保存失败，请重试。') }
    })
  }
  function changeMode(next: PracticeMode) {
    const params = new URLSearchParams(window.location.search); params.set('mode', next)
    void navigateSafely(`/word-practice?${params}`)
  }
  async function navigateSafely(url: string) {
    if (busy.current || notesBlocked || error) return
    busy.current = true; setSaving(true)
    try {
      await saveChain.current; await settingsChain.current
      if (!mounted.current) return
      audio.player.stop()
      navigate(url)
    } catch { if (mounted.current) setError('当前草稿保存失败，已留在本题。请重试保存后再切换。') }
    finally { busy.current = false; if (mounted.current) setSaving(false) }
  }
  function openWrongWords() {
    const params = new URLSearchParams(window.location.search); params.set('queue', 'mistakes'); params.delete('targetId')
    void navigateSafely(`/word-practice?${params}`)
  }
  function discardForNavigation() {
    if (saving || draftPending || settingsPending || notesStatus.saving || blocker.state !== 'blocked') return
    if (notesBlocked && !notesEditor.current?.discard()) return
    // The user's explicit discard removes only the unsaved UI state; canonical grades and
    // confirmed results remain untouched. Wait for the child's real clean-status callback.
    if (error) { setError(''); saveChain.current = Promise.resolve(); settingsChain.current = Promise.resolve() }
  }
  async function fullscreen() {
    if (document.fullscreenElement) { await document.exitFullscreen(); setFocus(false); return }
    setFocus(true)
    if (window.matchMedia('(min-width: 768px)').matches && page.current?.requestFullscreen) {
      try { await page.current.requestFullscreen() } catch { /* browser keeps the usable focus layout */ }
    }
  }
  const summary = session ? practiceSummary(session) : null
  const progress = session?.queue.length ? Math.round(session.results.length / session.queue.length * 100) : 0
  const last = session?.results.at(-1)
  const lastWord = last ? session?.queue.find(word => word.id === last.id) : null
  const dailyCurrent = settings.date === practiceLocalDate() && !dailyError
  return <div ref={page} className={`quiet-page space-y-5 bg-[var(--app-bg)] ${focus ? 'fixed inset-0 z-50 overflow-y-auto p-4 md:p-8' : ''}`}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-line)] pb-4">
      <div><Button variant="ghost" size="sm" disabled={saving || notesBlocked || !!error} onClick={() => { void navigateSafely(sourcePath) }}><ArrowLeft className="mr-2 h-4 w-4" />返回来源</Button>
        <h1 className="quiet-display mt-3 text-3xl md:text-5xl">单词练习。</h1><p className="mt-2 text-sm text-[var(--app-muted)]">{sourceName}{options.level ? ` · ${options.level}` : ''}{options.chapter ? ` · ${options.chapter} / ${options.section}` : ''} · {options.queue === 'mistakes' ? '待复习错词队列' : options.queue === 'due' ? '当前到期队列' : '全部词汇队列'}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving || notesBlocked || !!error} onClick={() => { void openWrongWords() }}>错词本 · {wrongCount} 词{options.queue === 'mistakes' ? ' · 当前队列' : ''}</Button><Button asChild variant="outline" size="sm"><a href="/feedback" target="_blank" rel="noreferrer">反馈</a></Button>
        <Button variant="outline" size="sm" onClick={() => { if (focus) { setFocus(false); if (document.fullscreenElement) void document.exitFullscreen() } else void fullscreen() }}><Maximize2 className="mr-1 h-4 w-4" />{focus ? '退出专注' : '全屏 / 专注'}</Button>
        {session && !session.finished && <Button variant="outline" size="sm" disabled={saving || notesBlocked || !!error} onClick={() => { audio.player.stop(); dispatch({ type: 'finish' }); setNotesOpen(false) }}>结束本轮</Button>}</div>
    </header>
    <WordPracticeControls settings={settings} onChange={changeSettings} source={options.source} voices={audio.voices} mode={mode} onMode={changeMode} disabled={saving || notesBlocked || !!error} />
    {blocker.state === 'blocked' && <div role="alert" className="quiet-surface space-y-3 p-4 text-sm">
      <p>{notesBlocked ? '笔记或原因尚未保存，离开会丢失这些修改。请先保存，或明确丢弃后继续。' : error ? '当前题或设置保存失败。请重试保存，或明确丢弃未保存修改后继续。' : '正在安全保存当前题，保存完成后会继续跳转。'}</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => blocker.reset()}>留在本题</Button>
        {notesBlocked && <Button variant="outline" onClick={() => setNotesOpen(true)}>打开笔记并保存</Button>}
        {error && <Button variant="outline" disabled={saving || draftPending || settingsPending} onClick={() => { void retrySave() }}>{session ? '保存当前草稿后继续' : '保存设置后继续'}</Button>}
        {(notesBlocked || !!error) && <Button variant="outline" disabled={saving || draftPending || settingsPending || notesStatus.saving} onClick={discardForNavigation}>丢弃未保存修改并继续</Button>}</div>
    </div>}
    {notesBlocked && !notesOpen && <p role="status" className="text-sm text-[var(--app-muted)]">笔记或原因尚未安全保存，自动继续与切换已暂停。<Button variant="ghost" onClick={() => setNotesOpen(true)}>打开笔记，保存或明确丢弃修改</Button></p>}
    {mode === 'meaning' && <p className="text-sm text-[var(--app-muted)]">看释义属于提示练习，不改变雅思高频听写掌握状态，也不计入每日正式听写完成数。</p>}
    {loadError && <div role="alert">{loadError}<Button variant="outline" onClick={() => setAttempt(v => v + 1)}>重新加载</Button></div>}
    {notebookSyncPending && <p role="status" className="text-sm">本机成绩已安全保存，云端同步待重试。<Button variant="ghost" onClick={() => { void retryNotebookSync() }}>重试云端同步</Button></p>}
    {!ready && !loadError && <p role="status">正在读取语料与学习记录…</p>}
    {error && <div role="alert" className="quiet-surface p-4 text-red-600">{error}<Button variant="outline" className="ml-2" disabled={saving} onClick={() => { void retrySave() }}>{session ? '重试保存草稿与设置' : '重试保存设置'}</Button>{session?.verdict === true && <Button className="ml-2" disabled={saving || preview !== null || notesOpen} onClick={() => { void confirm() }}>重试确认本题</Button>}</div>}
    {ready && (!session || session.finished) && <section className="quiet-surface space-y-4 p-5 md:p-8">
      {session?.finished && summary && <div role="status"><h2 className="text-xl font-semibold">本轮结束</h2><p className="mt-3">已确认 {summary.answered} / {session.queue.length} 词 · 首次正确 {summary.firstCorrect}（{summary.firstAccuracy ?? '—'}%） · 最终正确 {summary.finalCorrect}（{summary.finalAccuracy ?? '—'}%）</p><p className="mt-2 text-sm text-[var(--app-muted)]">未确认的题目不计成绩。有效学习 {Math.floor(session.elapsed / 60)} 分 {session.elapsed % 60} 秒。</p>
        {!!session.results.length && <div className="mt-4 flex flex-wrap gap-2">{session.results.map((r, index) => <Button key={r.id} variant="outline" size="sm" disabled={saving || notesBlocked} onClick={() => setPreview(index)}>{session.queue[index].word} · {r.firstCorrect ? '首对' : '首错'}</Button>)}</div>}</div>}
      <p>{currentQueue.length} 词可练习 · 推荐 {recommended.length} 词</p><p className="text-sm text-[var(--app-muted)]">{options.source === 'notebook' ? '推荐来自当前范围内现在已经到期的词汇 FSRS 记录。' : '推荐来自当前范围内正式听写首答错误、尚未在独立新轮首答正确的词。'}</p>
      <div className="flex flex-wrap gap-3"><Button disabled={!currentQueue.length || saving || notesBlocked || !!error || (options.source === 'frequency' && (annotations.loading || !!annotations.error))} onClick={() => { void start(currentQueue) }}>{session ? '开始新一轮' : '开始练习'} · {options.limit ? Math.min(options.limit, currentQueue.length) : currentQueue.length} 词</Button>
        <Button variant="outline" disabled={!recommended.length || saving || notesBlocked || !!error} onClick={() => { const params = new URLSearchParams(window.location.search); params.set('queue', recommendationQueue); void navigateSafely(`/word-practice?${params}`) }}>推荐复习 · {recommended.length} 词</Button></div>
      {!currentQueue.length && <p role="status">当前范围没有符合条件的词汇。<Button variant="ghost" onClick={() => navigate(sourcePath)}>回到来源选择内容</Button></p>}
    </section>}
    {session && !session.finished && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>第 {Math.min(session.position + 1, session.queue.length)} / {session.queue.length} 词 · 已完成 {session.results.length} · {progress}%</span><span>有效学习 {Math.floor(session.elapsed / 60)}:{String(session.elapsed % 60).padStart(2, '0')}</span><progress className="w-full accent-[var(--app-accent)]" max={100} value={progress} aria-label="本轮进度" /></div>}
    {lastWord && !session?.finished && preview === null && <p className="text-sm text-[var(--app-muted)]">上一词：{lastWord.word}{lastWord.ipa ? ` · ${lastWord.ipa}` : ''}{lastWord.partOfSpeech ? ` · ${lastWord.partOfSpeech}` : ''} · {lastWord.meaning || '来源未提供释义'} · {last?.firstCorrect ? '首次正确' : '首次错误，已重拼正确'}</p>}
    {shownWord && (preview !== null || !session?.finished) && <section className="quiet-surface space-y-5 p-5 md:p-8" aria-label={preview !== null ? '已完成词回看' : '当前练习'}>
      {preview !== null && <p className="text-sm text-[var(--app-muted)]">第 {preview + 1} 词回看 · 只读，不重复评分</p>}
      <p className="text-sm text-[var(--app-muted)]">{shownWord.sourceLabel}</p>
      {mode === 'meaning' && preview === null && <p className="text-xl md:text-2xl">{shownWord.meaning || '来源未提供独立释义：请切换听音拼写，或回到来源补充词条信息。'}</p>}
      {revealed ? <div><h2 className="break-words text-3xl font-semibold md:text-5xl">{shownWord.word}</h2><p className="mt-3 text-lg">{shownWord.meaning || '来源未提供释义'}</p>{shownWord.ipa && <p>{shownWord.ipa}</p>}{shownWord.partOfSpeech && <p>{shownWord.partOfSpeech}</p>}{shownWord.metadataSource && <p className="mt-2 text-xs text-[var(--app-muted)]">词典补充信息：{shownWord.metadataSource}</p>}{shownWord.sentence && <p className="mt-4 break-words text-sm text-[var(--app-muted)]">{shownWord.sentence}</p>}</div>
        : <p className="text-lg">{mode === 'dictation' ? '听清发音，写下你听到的单词。' : '根据释义写出英文。'}</p>}
      {preview === null && <form onSubmit={e => { e.preventDefault(); if (!composing) checkOrNext() }}>
        <label className="sr-only" htmlFor="word-practice-answer">英文答案</label>
        <input ref={input} id="word-practice-answer" value={session?.draft || ''} readOnly={session?.verdict !== null} disabled={saving || !!error} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
          onChange={e => dispatch({ type: 'input', value: e.target.value })} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
          onKeyDown={e => { if (e.key !== 'Enter') return; e.preventDefault(); if (practiceEnterAllowed({ ...e, isComposing: e.nativeEvent.isComposing, keyCode: e.nativeEvent.keyCode, answerInput: true }) && !composing) checkOrNext() }}
          className="w-full min-w-0 rounded border-2 border-[var(--app-line)] bg-[var(--app-surface)] p-4 text-2xl md:text-4xl" placeholder="输入英文答案" />
        {session?.verdict === true && <div role="status" className="mt-4 text-emerald-700"><Check className="mr-2 inline h-5 w-5" />拼写正确{session.firstVerdict === false ? ' · 首次错误仍保留' : ''} · {saving ? '正在安全保存…' : settings.autoNext ? canAuto ? `${remaining} 秒后保存并继续，Enter 可立即继续` : `自动继续已暂停 · 剩余 ${remaining} 秒` : '点击继续或按 Enter 保存本题'}</div>}
        {session?.verdict === false && <p role="status" className="mt-4 text-red-600">还没有拼对。记住正确拼写后，按 Enter 隐藏答案重拼。</p>}
        <div className="mt-5 flex flex-wrap gap-3"><Button type="submit" disabled={saving || notesBlocked || !!error || (!session?.draft.trim() && session?.verdict === null)}>{session?.verdict === true ? '保存并继续 · Enter' : session?.verdict === false ? '隐藏答案重拼 · Enter' : '核对答案 · Enter'}</Button></div>
      </form>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={saving || (!shownWord.audio && !voice) || settings.muted} onClick={() => play(shownWord)}><Volume2 className="mr-2 h-4 w-4" />{audio.state === 'playing' ? '重新播放' : '重播单词'}</Button>
        {shownWord.sentenceAudio && <Button variant="outline" disabled={settings.muted || saving} onClick={() => play(shownWord, true)}>回听来源原句</Button>}
        <Button variant="outline" disabled={!session?.results.length || saving || notesBlocked} onClick={() => { audio.player.stop(); setPreview(v => v === null ? (session?.results.length || 1) - 1 : Math.max(0, v - 1)) }}><RotateCcw className="mr-2 h-4 w-4" />上一词</Button>
        {preview !== null && <Button variant="outline" disabled={notesBlocked} onClick={() => { setPreview(null); setNotesOpen(false) }}>返回{session?.finished ? '总结' : '当前题'}</Button>}
        {options.source === 'frequency' && shownWord.ieltsCard && revealed && <Button variant="outline" disabled={saving} aria-expanded={notesOpen} onClick={() => setNotesOpen(v => !v)}>{notesOpen ? '收起笔记，恢复自动继续' : '编辑笔记 / 原因'}</Button>}</div>
      {options.source === 'notebook' && <p className="text-xs text-[var(--app-muted)]">单词使用设备合成发音{voice ? ` · ${voice.lang} · ${voice.name}` : ' · 当前无可用英美声音，单词重播已禁用'}。原句使用教材录音。</p>}
      {audio.state === 'error' && <p role="alert" className="text-sm text-red-600">音频播放失败，请重播；合成声音需要本设备支持。</p>}
      {annotations.error && options.source === 'frequency' && <p role="alert">{annotations.error}<Button variant="outline" onClick={annotations.retry}>重试笔记读取</Button></p>}
      {shownWord.ieltsCard && revealed && options.source === 'frequency' && <div hidden={!notesOpen}><IELTSWordNotes key={`${owner}:${shownWord.id}`} owner={owner} card={shownWord.ieltsCard} annotation={resolveFrequencyAnnotation(shownWord.id, annotations.seeds, annotations.local, shownWord.reason)} disabled={saving} onStatusChange={onNotesStatus} editorRef={notesEditor} /></div>}
    </section>}
    <footer className="quiet-surface flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
      <label>每日正式听写目标<input type="number" min="1" max="10000" disabled={saving} aria-label="每日听写目标" value={settings.dailyTarget} onChange={e => { const value = Number(e.target.value); if (Number.isInteger(value) && value > 0 && value <= 10000) changeSettings({ dailyTarget: value }) }} className="ml-3 w-20 rounded border border-[var(--app-line)] bg-[var(--app-surface)] p-2" /></label>
      <span>{dailyCurrent ? `今日已确认 ${settings.completed} / ${settings.dailyTarget} 词 · ${Math.min(100, Math.round(settings.completed / settings.dailyTarget * 100))}%` : dailyError ? '今日完成数暂时无法读取' : '正在读取今日完成数…'}</span>
      <progress className="w-full" max={settings.dailyTarget} value={dailyCurrent ? settings.completed : 0} aria-label="每日目标进度" />
      {dailyError && <p role="status">{dailyError}<Button variant="ghost" onClick={() => { void refreshDailyProgress() }}>重试读取今日完成数</Button></p>}
    </footer>
  </div>
}
