import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { IELTSReadingNotes } from './IELTSReadingNotes'
import { buildReadingQuestion, gradeReadingQuestion, READING_RELATIONS, type ReadingCard } from '@/lib/ieltsReading'
import { commitReadingReview, saveReadingSession, type ReadingSession, type ReadingSnapshot } from '@/lib/ieltsReadingStore'
import { createInitialFSRSState, previewFSRSRatings } from '@/lib/fsrsScheduler'
import { Rating } from '@/types'

interface Props { cards: ReadingCard[]; session: ReadingSession; data: ReadingSnapshot; onEnd: () => Promise<void>; onNotesBlocked: (blocked: boolean) => void; notesBlocked: boolean }
function interval(date: Date) {
  const mins = Math.max(1, Math.round((date.getTime() - Date.now()) / 60000))
  return mins < 60 ? `${mins} 分钟` : mins < 1440 ? `${Math.round(mins / 60)} 小时` : `${Math.round(mins / 1440)} 天`
}
export function IELTSReadingSession({ cards, session: initial, data, onEnd, onNotesBlocked, notesBlocked }: Props) {
  const [session, setSession] = useState(initial)
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
  const card = cards.find(c => c.id === session.cardIds[session.cursor])!
  const progress = data.progress.find(p => p.cardId === card.id)
  const question = session.question ?? buildReadingQuestion(card, cards, progress?.fsrs.reps ?? 0)
  const result = session.mode === 'recall' ? undefined : gradeReadingQuestion(question, session.selected)
  const previews = previewFSRSRatings(progress?.fsrs ?? createInitialFSRSState())
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
  const labels: Record<Rating, string> = { 1: '重新学习', 2: '费力想起', 3: '正常想起', 4: '很熟悉' }
  return <section aria-label="阅读同义替换练习" className="mx-auto max-w-3xl space-y-5">
    <div className="flex items-center justify-between gap-4 text-sm text-[var(--app-muted)]"><span>第 {session.cursor + 1} / {session.cardIds.length} 题</span><span>{session.mode === 'recall' ? '主动回忆' : session.mode === 'retry' ? '错题重做' : '多选题'} · 第{card.category}类</span></div>
    <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5 sm:p-8">
      {finished ? <div className="space-y-5"><h2 className="font-serif text-3xl">这一轮，记住了更多。</h2><p>完成 {session.completed} 组 · {session.correct} 组答对</p><p className="text-sm text-[var(--app-muted)]">正式复习已安排下次时间。重做练习单独记录。</p><Button disabled={busy || notesBlocked} onClick={() => { void operation(onEnd) }}>返回阅读词库</Button></div> : <>
        <p className="quiet-kicker">{READING_RELATIONS[card.relation]}</p>
        <h2 className="mt-3 break-words font-serif text-4xl sm:text-5xl">{card.word.replace(/\*$/, '')}</h2>
        <p className="my-6 text-base leading-7">{session.mode === 'recall' ? '先回忆这组考点对应，再展开答案。' : '以下哪些是书中列出的考点对应？选择所有符合的表达。'}</p>
        {session.mode !== 'recall' && <fieldset disabled={session.revealed || busy} className="space-y-3"><legend className="sr-only">{card.word} 的考点对应选项</legend>
          {question.options.map(option => {
            const selected = session.selected.includes(option.id)
            const missed = session.revealed && option.correct && !selected
            const wrong = session.revealed && !option.correct && selected
            return <label key={option.id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-4 text-lg sm:p-5 ${session.revealed && option.correct ? 'border-emerald-600 bg-emerald-50 text-emerald-950' : wrong ? 'border-red-600 bg-red-50 text-red-950' : selected ? 'border-[var(--app-accent)] bg-[var(--app-bg)]' : 'border-[var(--app-line)]'}`}>
              <input className="h-5 w-5 shrink-0" type="checkbox" checked={selected} onChange={() => { void operation(() => update({ ...session, question, selected: selected ? session.selected.filter(id => id !== option.id) : [...session.selected, option.id] }, true)) }} />
              <span className="min-w-0 break-words">{option.text}{session.revealed && <span className="ml-2 text-xs">{missed ? '漏选' : wrong ? '误选' : option.correct ? '正确对应' : ''}</span>}</span>
            </label>
          })}
        </fieldset>}
        {!session.revealed && <Button className="mt-6 w-full min-h-12" disabled={busy} onClick={() => { void operation(() => update({ ...session, question, revealed: true })) }}>{session.mode === 'recall' ? '展开答案' : '提交并查看解析'}</Button>}
        {session.revealed && <div className="mt-6 space-y-5">
          {result && <p role="status" className={`font-semibold ${result.passed ? 'text-emerald-700' : 'text-red-700'}`}>{result.passed ? '本题全部选对' : `本题还需巩固 · 漏选 ${result.missed.length} 项 · 误选 ${result.extra.length} 项`}</p>}
          <div className="rounded-xl bg-[var(--app-bg)] p-4"><p className="text-sm text-[var(--app-muted)]">{card.meaning}</p><p className="mt-2 text-sm font-semibold">书中完整对应</p><p className="mt-2 break-words leading-7">{card.expressions.map(e => e.text).join(' · ')}</p>
            {card.relation !== 'lexical' && <p className="mt-3 text-sm text-[var(--app-muted)]">这组考查{READING_RELATIONS[card.relation]}；请按原句的关系理解。</p>}
            {card.expressions.length > question.options.filter(o => o.correct).length && session.mode !== 'recall' && <p className="mt-2 text-xs text-[var(--app-muted)]">本题抽取部分表达；下一次会轮换。未出现的表达不计漏选。</p>}
          </div>
          {!session.graded && <div className="space-y-2"><p className="text-sm">{session.mode === 'retry' ? '重做结果单独记录，不改变下次复习时间。' : '记录这一题，并安排下次复习。'}</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(session.mode === 'recall' ? [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] : result!.passed ? [Rating.Hard, Rating.Good, Rating.Easy] : [Rating.Again]).map(rating => <Button key={rating} variant="outline" className="h-auto min-h-14 flex-col gap-1 whitespace-normal py-3" disabled={busy || notesBlocked} onClick={() => rate(rating)}>{labels[rating]}{session.mode !== 'retry' && <small className="font-normal">{interval(previews[rating].due)}后</small>}</Button>)}
          </div></div>}
          {session.graded && <div><p role="status" className="mb-3 text-sm text-emerald-700">{session.mode === 'retry' ? '重做结果已保存。' : '评分已保存，下次复习已安排。'}</p><Button className="w-full min-h-12" disabled={busy || notesBlocked} onClick={() => { void operation(async () => {
            if (session.cursor === session.cardIds.length - 1) { setFinished(true); return }
            const nextCard = cards.find(c => c.id === session.cardIds[session.cursor + 1])!
            await update({ ...session, cursor: session.cursor + 1, selected: [], revealed: false, graded: false, question: buildReadingQuestion(nextCard, cards, data.progress.find(p => p.cardId === nextCard.id)?.fsrs.reps ?? 0) })
          }) }}>{session.cursor === session.cardIds.length - 1 ? '完成本轮' : '下一题'}</Button></div>}
          <IELTSReadingNotes key={`${session.owner}:${card.id}`} owner={session.owner} card={card} annotation={data.annotations.find(a => a.cardId === card.id)} onBlocked={onNotesBlocked} />
        </div>}
      </>}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="text-xs text-[var(--app-muted)]">正在保存答题状态…</p>}
    {!finished && <Button variant="outline" disabled={busy || notesBlocked} onClick={() => { void operation(onEnd) }}>结束本轮</Button>}
  </section>
}
