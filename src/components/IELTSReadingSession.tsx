import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IELTSReadingNotes } from './IELTSReadingNotes'
import { buildReadingQuestion, gradeReadingQuestion, READING_RELATIONS, type ReadingCard } from '@/lib/ieltsReading'
import { commitReadingReview, saveReadingSession, type ReadingSession, type ReadingSnapshot } from '@/lib/ieltsReadingStore'
import { createInitialFSRSState, previewFSRSRatings } from '@/lib/fsrsScheduler'
import { Rating } from '@/types'
import { useFSRSParameterKey } from '@/hooks/useFSRSParameterKey'

interface Props { cards: ReadingCard[]; session: ReadingSession; data: ReadingSnapshot; onEnd: () => Promise<void>; onArchive?: (cardId: string) => Promise<void>; onNotesBlocked: (blocked: boolean) => void; notesBlocked: boolean }
function interval(date: Date) {
  const mins = Math.max(1, Math.round((date.getTime() - Date.now()) / 60000))
  return mins < 60 ? `${mins} 分钟` : mins < 1440 ? `${Math.round(mins / 60)} 小时` : `${Math.round(mins / 1440)} 天`
}
const labels: Record<Rating, string> = { 1: '重来', 2: '困难', 3: '良好', 4: '简单' }
const descriptions: Record<Rating, string> = { 1: '没想起 / 答错', 2: '想起来了，但很吃力', 3: '想起来了，稍有停顿', 4: '立即想起，很轻松' }

export function IELTSReadingSession({ cards, session: initial, data, onEnd, onArchive, onNotesBlocked, notesBlocked }: Props) {
  const [session, setSession] = useState(initial)
  useFSRSParameterKey('reading', session.owner)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const lock = useRef(false)
  const selectionDirty = useRef(false)
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (lock.current || selectionDirty.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
  const cardId = session.cardIds[session.cursor]
  const card = cards.find(c => c.id === cardId)
  const archived = data.archivedCards?.some(row => row.cardId === cardId && row.archived) ?? false
  const archivedIds = new Set(data.archivedCards?.filter(row => row.archived).map(row => row.cardId) ?? [])
  const availableCards = cards.filter(item => !archivedIds.has(item.id) && item.status !== 'pending')
  const progress = card ? data.progress.find(p => p.cardId === card.id) : undefined
  const question = card ? session.question ?? buildReadingQuestion(card, availableCards, progress?.fsrs.reps ?? 0) : undefined
  const result = session.mode === 'recall' || !question ? undefined : gradeReadingQuestion(question, session.selected)
  const previews = previewFSRSRatings(progress?.fsrs ?? createInitialFSRSState(), new Date(), { scope: 'reading', owner: session.owner })
  async function operation(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? `保存失败：${e.message}。当前题目已保留，请重试。` : '保存失败，当前题目已保留，请重试。') }
    finally { lock.current = false; setBusy(false) }
  }
  async function update(next: ReadingSession, optimistic = false) {
    if (optimistic) { selectionDirty.current = true; setSession(next) }
    await saveReadingSession(next)
    selectionDirty.current = false
    if (!optimistic) setSession(next)
  }
  function rate(rating: Rating) {
    if (!card || !question) return
    void operation(async () => {
      const passed = session.mode === 'recall' ? rating !== Rating.Again : result!.passed
      const next = { ...session, question, graded: true, completed: session.completed + 1, correct: session.correct + (passed ? 1 : 0) }
      await commitReadingReview({ owner: session.owner, operationId: `${session.id}:${session.cursor}`, card, question, rating, mode: session.mode, selected: session.selected,
        shown: session.mode === 'recall' ? card.expressions.map(e => e.id) : question.options.filter(o => o.correct).map(o => o.id),
        missed: result?.missed ?? [], extra: result?.extra ?? [], passed, reviewedAt: new Date(), session: next })
      setSession(next)
      selectionDirty.current = false
    })
  }
  function deleteCurrentCard() {
    if (!card || !onArchive || !window.confirm(`将“${card.word.replace(/\*$/, '')}”从当前账号的阅读词库隐藏吗？其他账号不受影响，可在词库中恢复。这会结束当前练习。`)) return
    void operation(() => onArchive(card.id))
  }
  const returnToLibrary = () => { void operation(onEnd) }
  const showUnavailable = !card || archived

  return <section aria-label="阅读同义替换练习" className="mx-auto max-w-5xl space-y-5">
    <header className="flex items-center justify-between gap-3 border-b border-[var(--app-line)] pb-4">
      <Button variant="ghost" className="min-h-11 px-2" disabled={busy || notesBlocked} onClick={returnToLibrary}><ArrowLeft className="mr-2 h-4 w-4" />返回词库</Button>
      <div className="text-center"><p className="text-xs text-[var(--app-muted)]">雅思阅读 538 · 第 {card?.category ?? '—'} 类</p><p className="font-medium">第 {session.cursor + 1} / {session.cardIds.length} 题</p></div>
      {card && onArchive ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busy || notesBlocked} aria-label="更多卡片操作"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={deleteCurrentCard}><Trash2 className="mr-2 h-4 w-4" />删除当前卡片</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : <span className="w-10" />}
    </header>
    <div className="flex items-center justify-between text-sm text-[var(--app-muted)]"><span>多选辨认 · {session.mode === 'retry' ? '错题重做' : session.mode === 'recall' ? '主动回忆' : '学习练习'}</span><span>{session.completed}/{session.cardIds.length} 已完成</span></div>
    <div role="progressbar" aria-label="本轮复习进度" aria-valuemin={0} aria-valuemax={session.cardIds.length} aria-valuenow={session.completed} className="h-2 overflow-hidden rounded-full bg-[var(--app-line)]"><div className="h-full bg-[var(--app-accent)] transition-all" style={{ width: `${session.completed / session.cardIds.length * 100}%` }} /></div>
    <article className="quiet-surface min-h-[65dvh] rounded-3xl p-5 sm:p-8 md:p-10">
      {showUnavailable ? <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center"><p className="quiet-kicker">CARD UNAVAILABLE</p><h1 className="font-serif text-3xl">这张卡片已从当前账号隐藏。</h1><p className="max-w-md text-sm text-[var(--app-muted)]">它可能已在另一台设备上移除。当前学习记录仍保留，你可以回到词库恢复卡片。</p><Button onClick={returnToLibrary} disabled={busy}>返回词库</Button></div> : finished ? <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-5 text-center"><p className="quiet-kicker">ROUND COMPLETE</p><h1 className="font-serif text-4xl">这一轮，记住了更多。</h1><p>完成 {session.completed} 组 · {session.correct} 组答对</p><p className="text-sm text-[var(--app-muted)]">正式复习已安排下次时间。错题重做只记录结果，不改复习日期。</p><Button disabled={busy || notesBlocked} onClick={returnToLibrary}>返回阅读词库</Button></div> : <>
        <p className="quiet-kicker">{READING_RELATIONS[card!.relation]}</p>
        <h1 className="mt-2 font-serif text-3xl text-[var(--app-muted)]">A CLOSER LOOK</h1>
        <div className="mt-8"><p className="quiet-kicker">ENGLISH · 考点词</p><h2 className="mt-3 break-words font-serif text-5xl leading-tight sm:text-6xl">{card!.word.replace(/\*$/, '')}</h2><p className="mt-4 max-w-3xl text-xl leading-relaxed">{session.mode === 'recall' ? '先回忆这组考点词的替换表达，再展开答案。' : '以下哪些是书中列出的考点对应？选择所有符合的表达。'}</p></div>
        {session.mode !== 'recall' && <fieldset disabled={session.revealed || busy} className="mt-8 grid gap-3"><legend className="sr-only">{card!.word} 的考点对应选项</legend>
          {question!.options.map(option => {
            const selected = session.selected.includes(option.id)
            const missed = session.revealed && option.correct && !selected
            const wrong = session.revealed && !option.correct && selected
            return <label key={option.id} className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 text-lg transition-colors sm:p-5 ${missed || wrong ? 'border-red-500 bg-red-50 text-red-950' : session.revealed && option.correct && selected ? 'border-emerald-600 bg-emerald-50 text-emerald-950' : selected ? 'border-[var(--app-accent)] bg-[var(--app-bg)]' : 'border-[var(--app-line)] bg-[var(--app-surface)]'}`}>
              <input className="h-5 w-5 shrink-0 accent-[var(--app-accent)]" type="checkbox" checked={selected} onChange={() => { void operation(() => update({ ...session, question: question!, selected: selected ? session.selected.filter(id => id !== option.id) : [...session.selected, option.id] }, true)) }} />
              <span className="min-w-0 flex-1 break-words">{option.text}</span>{session.revealed && <span className={`shrink-0 text-xs font-semibold ${missed || wrong ? 'text-red-700' : 'text-emerald-700'}`}>{missed ? '漏选' : wrong ? '误选' : option.correct ? '正确对应' : ''}</span>}
            </label>
          })}
        </fieldset>}
        {!session.revealed && <Button className="mt-7 min-h-12 w-full text-base" disabled={busy || notesBlocked} onClick={() => { void operation(() => update({ ...session, question: question!, revealed: true })) }}>{session.mode === 'recall' ? '展开答案' : '提交并查看解析'}</Button>}
        {session.revealed && <div className="mt-8 space-y-6">
          {result && <p role="status" className={`font-semibold ${result.passed ? 'text-emerald-700' : 'text-red-700'}`}>{result.passed ? '本题全部选对' : `本题还需巩固 · 漏选 ${result.missed.length} 项 · 误选 ${result.extra.length} 项`}</p>}
          <div className="rounded-2xl bg-[var(--app-bg)] p-5 sm:p-6"><p className="quiet-kicker">中文释义</p><p className="mt-3 text-xl leading-relaxed">{card!.meaning}</p><p className="mt-5 text-sm font-semibold text-[var(--app-muted)]">书中完整对应</p><p className="mt-2 break-words text-lg leading-relaxed">{card!.expressions.map(e => e.text).join(' · ')}</p>
            {card!.relation !== 'lexical' && <p className="mt-4 text-sm text-[var(--app-muted)]">这组考查{READING_RELATIONS[card!.relation]}；请按原句中的关系理解。</p>}
            {card!.expressions.length > question!.options.filter(o => o.correct).length && session.mode !== 'recall' && <p className="mt-3 text-xs text-[var(--app-muted)]">本题抽取部分表达；下一次会轮换。未出现的表达不计漏选。</p>}
          </div>
          {!session.graded && <div className="space-y-3"><div><p className="font-medium">这次记得怎么样？</p><p className="mt-1 text-xs text-[var(--app-muted)]">“重来”表示没记起；其他三档用于答对后选择实际回忆难度。</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Rating[]).map(rating => {
              const disabledByAnswer = rating !== Rating.Again && session.mode !== 'recall' && !result!.passed
              return <Button key={rating} variant="outline" aria-disabled={disabledByAnswer} className={`h-auto min-h-24 flex-col items-start gap-2 whitespace-normal rounded-2xl px-4 py-3 text-left ${disabledByAnswer ? 'opacity-45' : ''}`} disabled={busy || notesBlocked || disabledByAnswer} onClick={() => rate(rating)}>
                <span className="font-semibold">{labels[rating]}</span><span className="text-xs font-normal text-[var(--app-muted)]">{descriptions[rating]}</span><small className="font-medium">{session.mode === 'retry' ? '仅记录' : interval(previews[rating].due)}{session.mode !== 'retry' ? '后' : ''}</small>
              </Button>
            })}
          </div></div>}
          {session.graded && <div className="space-y-3"><p role="status" className="text-sm text-emerald-700">{session.mode === 'retry' ? '重做结果已保存。' : '评分已保存，下次复习已安排。'}</p><Button className="min-h-12 w-full text-base" disabled={busy || notesBlocked} onClick={() => { void operation(async () => {
            if (session.cursor === session.cardIds.length - 1) { setFinished(true); return }
            const nextCard = cards.find(c => c.id === session.cardIds[session.cursor + 1])!
            await update({ ...session, cursor: session.cursor + 1, selected: [], revealed: false, graded: false, question: buildReadingQuestion(nextCard, availableCards, data.progress.find(p => p.cardId === nextCard.id)?.fsrs.reps ?? 0) })
          }) }}>{session.cursor === session.cardIds.length - 1 ? '完成本轮' : '下一题'}</Button></div>}
          <details className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5"><summary className="cursor-pointer font-medium text-[var(--app-accent)]">查看笔记与标记</summary><div className="mt-4"><IELTSReadingNotes key={`${session.owner}:${card!.id}`} owner={session.owner} card={card!} annotation={data.annotations.find(a => a.cardId === card!.id)} onBlocked={onNotesBlocked} /></div></details>
        </div>}
      </>}
    </article>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="text-xs text-[var(--app-muted)]">正在保存答题状态…</p>}
    {!finished && !showUnavailable && <Button variant="outline" disabled={busy || notesBlocked} onClick={returnToLibrary}>结束本轮</Button>}
  </section>
}
