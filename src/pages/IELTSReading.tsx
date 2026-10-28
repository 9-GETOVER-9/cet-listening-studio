import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import { liveQuery } from 'dexie'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { QuietPageHeader } from '@/components/QuietPageHeader'
import { IELTSReadingNotes } from '@/components/IELTSReadingNotes'
import { IELTSReadingSession } from '@/components/IELTSReadingSession'
import { ReadingLoadStatus } from '@/components/ReadingLoadStatus'
import { useAuth } from '@/hooks/useAuth'
import { buildReadingQuestion, selectReadingQueue, READING_RELATIONS, type ReadingCorpus } from '@/lib/ieltsReading'
import { loadReadingCorpus } from '@/lib/ieltsReadingLoader'
import { archiveReadingCard, endReadingSession, exportReadingBackup, readReadingSnapshot, restoreReadingBackup, restoreReadingCard, saveReadingSession, type ReadingSnapshot, type ReadingMode } from '@/lib/ieltsReadingStore'

export default function IELTSReading() {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-8" role="status">正在读取学习账号…</p>
  return <ReadingStudy key={user?.id ?? 'guest'} owner={user?.id ?? 'guest'} />
}
function ReadingStudy({ owner }: { owner: string }) {
  const [corpus, setCorpus] = useState<ReadingCorpus | null>(null)
  const [data, setData] = useState<ReadingSnapshot | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notesBlocked, setNotesBlocked] = useState(false)
  const [active, setActive] = useState(false)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [completionFilter, setCompletionFilter] = useState<'incomplete' | 'completed'>('incomplete')
  const [showArchived, setShowArchived] = useState(false)
  const [listLimit, setListLimit] = useState(20)
  const [expanded, setExpanded] = useState<string>()
  const [mode, setMode] = useState<Exclude<ReadingMode, 'retry'>>('quiz')
  const [roundSize, setRoundSize] = useState(10)
  const [clock, setClock] = useState(Date.now())
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  const onNotesBlocked = useCallback((value: boolean) => setNotesBlocked(value), [])
  const blocker = useBlocker(notesBlocked)
  useEffect(() => { if (blocker.state === 'blocked' && !notesBlocked) blocker.proceed() }, [blocker, notesBlocked])
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (notesBlocked) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [notesBlocked])
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void loadReadingCorpus(controller.signal).then(value => {
      if (!controller.signal.aborted) setCorpus(value)
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '词库加载失败') })
    const subscription = liveQuery(() => readReadingSnapshot(owner)).subscribe({ next: setData, error: () => setError('学习记录读取失败，请重试。') })
    return () => { controller.abort(); subscription.unsubscribe() }
  }, [owner, reload])
  async function perform(action: () => Promise<void>) {
    if (lock.current || notesBlocked) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试。') }
    finally { lock.current = false; setBusy(false) }
  }
  const sourceCards = corpus?.cards ?? []
  const archivedIds = new Set(data?.archivedCards?.filter(row => row.archived).map(row => row.cardId) ?? [])
  const cards = sourceCards.filter(card => !archivedIds.has(card.id))
  const scope = cards.filter(c => category === 'all' || c.category === Number(category))
  const states = new Map(data?.progress.map(p => [p.cardId, p.fsrs]) ?? [])
  const annotations = new Map(data?.annotations.map(a => [a.cardId, a]) ?? [])
  const due = selectReadingQueue(scope, states, 'due', new Date(clock))
  const newCards = selectReadingQueue(scope, states, 'new')
  const studied = scope.filter(c => (states.get(c.id)?.reps ?? 0) > 0).length
  const latest = new Map(data?.logs.filter(l => l.mode !== 'retry').sort((a, b) => a.reviewedAt - b.reviewedAt).map(l => [l.cardId, l]) ?? [])
  const mistakes = scope.filter(c => c.status !== 'pending' && latest.get(c.id)?.passed === false)
  const visible = scope.filter(c => {
    const a = annotations.get(c.id)
    const text = `${c.word} ${c.meaning} ${c.expressions.map(e => e.text).join(' ')} ${a?.note ?? ''}`.toLowerCase()
    return text.includes(query.trim().toLowerCase()) && (filter === 'all' || filter === 'notes' && !!a?.note || filter === 'marked' && !!a?.marked.length || filter === 'due' && due.some(d => d.id === c.id))
  })
  const categoryStats = [1, 2, 3].map(value => {
    const totalEntries = cards.filter(card => card.category === value)
    const entries = totalEntries.filter(card => card.status !== 'pending')
    const learned = entries.filter(card => (states.get(card.id)?.reps ?? 0) > 0).length
    const categoryDue = selectReadingQueue(entries, states, 'due', new Date(clock)).length
    return { value, entries, total: totalEntries.length, learned, due: categoryDue, completed: entries.length > 0 && learned === entries.length }
  })
  const completedCategories = categoryStats.filter(item => item.completed).length
  const visibleCategories = categoryStats.filter(item => completionFilter === 'completed' ? item.completed : !item.completed)
  const archivedCards = sourceCards.filter(card => archivedIds.has(card.id))
  const shownCards = visible.slice(0, listLimit)
  function start(kind: 'due' | 'new' | 'all' | 'retry', categoryOverride = category) {
    void perform(async () => {
      const targetScope = cards.filter(c => categoryOverride === 'all' || c.category === Number(categoryOverride))
      const targetMistakes = targetScope.filter(c => c.status !== 'pending' && latest.get(c.id)?.passed === false)
      const queue = kind === 'retry' ? targetMistakes : selectReadingQueue(targetScope, states, kind)
      const chosen = queue.slice(0, roundSize)
      if (!chosen.length) return
      // A saved round is deliberately retained until explicitly replaced by a new round.
      if (data?.session && !window.confirm('开始新一轮会替换尚未结束的练习。已保存的评分和笔记会保留，继续吗？')) return
      const session = { owner, id: crypto.randomUUID(), mode: kind === 'retry' ? 'retry' as const : mode, cardIds: chosen.map(c => c.id), cursor: 0, selected: [], revealed: false, graded: false, completed: 0, correct: 0, createdAt: Date.now(), question: buildReadingQuestion(chosen[0], cards, states.get(chosen[0].id)?.reps ?? 0) }
      await saveReadingSession(session); setExpanded(undefined); setActive(true)
    })
  }
  async function end() { await endReadingSession(owner); setActive(false); setClock(Date.now()) }
  async function archive(cardId: string) {
    await archiveReadingCard(owner, cardId)
    setActive(false); setExpanded(undefined); setShowArchived(false)
    setNotice('这张卡片已从当前账号隐藏，可在“已隐藏卡片”中恢复。')
  }
  async function download() {
    const content = await exportReadingBackup(owner)
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `reading-538-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('阅读记录、批注与当前练习已导出。')
  }
  return <div data-practice={active ? '' : undefined} className="quiet-page">
    <Link to="/ielts" className="mb-6 inline-block text-sm text-[var(--app-muted)]">← 雅思专区</Link>
    {!active && <QuietPageHeader eyebrow="IELTS · READING 538" title="雅思阅读同义替换。" description="第一章 · 538 个考点词，按 FSRS 间隔复习。" />}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-300 p-4 text-sm text-red-700">{error}{!active && <Button variant="outline" className="ml-3" onClick={() => setReload(n => n + 1)}>重新加载</Button>}</div>}
    {blocker.state === 'blocked' && <div role="alert" className="mb-4 text-sm">批注尚未保存，请先在编辑区重试。<Button variant="outline" className="ml-3" onClick={() => blocker.reset()}>取消跳转</Button></div>}
    {!corpus || !data ? <ReadingLoadStatus corpusReady={Boolean(corpus)} recordsReady={Boolean(data)} error={error} /> : active && data.session ? <IELTSReadingSession key={data.session.id} cards={sourceCards} session={data.session} data={data} onEnd={end} onArchive={archive} notesBlocked={notesBlocked} onNotesBlocked={onNotesBlocked} /> : <>
      <div className="mb-6 grid grid-cols-3 gap-3 text-center"><div className="quiet-surface p-4"><strong className="block font-serif text-3xl">{studied}</strong><span className="text-xs text-[var(--app-muted)]">已学 / {scope.length} 组</span></div><div className="quiet-surface p-4"><strong className="block font-serif text-3xl">{due.length}</strong><span className="text-xs text-[var(--app-muted)]">当前到期</span></div><div className="quiet-surface p-4"><strong className="block font-serif text-3xl">{newCards.length}</strong><span className="text-xs text-[var(--app-muted)]">可学新词</span></div></div>
      {data.session && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-accent)] p-4 text-sm"><span>上次练习 · 第 {data.session.cursor + 1} / {data.session.cardIds.length} 题 · 已评分 {data.session.completed} 组</span><Button disabled={busy || notesBlocked} onClick={() => setActive(true)}>继续上次练习</Button></div>}
      <section className="quiet-surface mb-4 p-4 md:p-6" aria-label="选择词条类别">
        <p className="mb-3 text-sm text-[var(--app-muted)]">选择类别</p>
        <div className="grid gap-3 sm:grid-cols-3">{visibleCategories.map(item => {
          const all = item.entries.length
          const percent = all ? Math.round(item.learned / all * 100) : 0
          return <article key={item.value} className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-4 md:p-5">
            <p className="quiet-kicker">READING 538 · CATEGORY {item.value}</p>
            <h2 className="mt-3 font-serif text-2xl">第 {item.value} 类</h2>
            <p className="mt-1 text-sm text-[var(--app-muted)]">{item.total} 组{item.total !== all ? ` · ${all} 组可练` : ''} · {item.value === 1 ? '优先熟记' : item.value === 2 ? '重点积累' : '继续拓展'}</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--app-line)]"><div className="h-full bg-[var(--app-accent)] transition-all" style={{ width: `${percent}%` }} /></div>
            <div className="mt-2 flex justify-between text-sm text-[var(--app-muted)]"><span>{item.learned}/{all} 组已学习</span><span>{percent}%</span></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><Button variant={category === String(item.value) ? 'default' : 'outline'} onClick={() => { setCategory(String(item.value)); setExpanded(undefined); setListLimit(20) }}>查看词条</Button><Button disabled={busy || notesBlocked || !all} onClick={() => { setCategory(String(item.value)); start('all', String(item.value)) }}>进入练习</Button></div>
          </article>
        })}</div>
        {visibleCategories.length === 0 && <p className="py-5 text-sm text-[var(--app-muted)]">这一状态下暂无类别。</p>}
      </section>
      <div className="quiet-surface mb-7 flex flex-wrap items-center gap-4 p-4 md:px-6">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">学习状态</p><p className="text-xs text-[var(--app-muted)]">{completedCategories}/3 类已完成 · 已隐藏 {archivedCards.length} 张</p></div>
        <ToggleGroup type="single" value={completionFilter} onValueChange={value => { if (value === 'incomplete' || value === 'completed') setCompletionFilter(value) }} aria-label="类别完成状态">
          <ToggleGroupItem value="incomplete">未完成 ({categoryStats.length - completedCategories})</ToggleGroupItem><ToggleGroupItem value="completed">已完成 ({completedCategories})</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="quiet-surface mb-7 flex flex-wrap items-center gap-3 p-4 md:px-6">
        <Button disabled={busy || notesBlocked || !due.length} onClick={() => start('due')}>复习到期词 · {due.length}</Button><Button variant="outline" disabled={busy || notesBlocked || !newCards.length} onClick={() => start('new')}>学习新词 · {newCards.length}</Button><Button variant="outline" disabled={busy || notesBlocked || !scope.some(c => c.status !== 'pending')} onClick={() => start('all')}>练习所选类别</Button><Button variant="outline" disabled={busy || notesBlocked || !mistakes.length} onClick={() => start('retry')}>错题重做 · {mistakes.length}</Button>
        <label className="flex items-center gap-2 text-sm">练习方式 <select aria-label="阅读练习方式" disabled={notesBlocked || busy} value={mode} onChange={e => setMode(e.target.value as Exclude<ReadingMode, 'retry'>)} className="rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] p-2"><option value="quiz">多选辨认</option><option value="recall">主动回忆</option></select></label>
        <label className="ml-auto flex items-center gap-2 text-sm">每轮 <input aria-label="每轮题数" type="number" min={1} max={376} value={roundSize} disabled={notesBlocked || busy} onChange={e => setRoundSize(Math.min(376, Math.max(1, Math.floor(Number(e.target.value) || 1))))} className="w-20 rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] p-2" /> 组</label>
      </div>
      <section aria-label="阅读词条查阅" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">词条卡片</h2><span className="text-xs text-[var(--app-muted)]">按主词条组记录进度，保留完整对应表达</span></div>
        <div className="flex flex-col gap-3 sm:flex-row"><input aria-label="搜索阅读词条" value={query} disabled={notesBlocked || busy} onChange={e => { setQuery(e.target.value); setListLimit(20) }} placeholder="搜索主词、替换表达或笔记" className="min-w-0 flex-1 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] p-3 text-sm" /><select aria-label="阅读词条筛选" disabled={notesBlocked || busy} value={filter} onChange={e => { setFilter(e.target.value); setListLimit(20) }} className="rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] p-3 text-sm"><option value="all">全部词条</option><option value="notes">有笔记</option><option value="marked">有标记表达</option><option value="due">当前到期</option></select></div>
        <div className="grid gap-3 sm:grid-cols-2">{shownCards.map(card => {
          const p = data.progress.find(p => p.cardId === card.id)
          return <article key={card.id} className="quiet-surface p-4 sm:p-5"><button className="flex min-h-11 w-full items-center justify-between gap-4 text-left" disabled={notesBlocked || busy} aria-expanded={expanded === card.id} onClick={() => setExpanded(expanded === card.id ? undefined : card.id)}>
            <span className="min-w-0"><span className="quiet-kicker">第 {card.category} 类</span><strong className="mt-2 block break-words font-serif text-2xl">{card.word.replace(/\*$/, '')}</strong><span className="mt-1 block text-sm text-[var(--app-muted)]">{card.meaning}</span></span><span className="shrink-0 text-right text-xs text-[var(--app-muted)]">{card.status === 'pending' ? '待核验 · 仅查阅' : p ? `已学 · 覆盖 ${p.covered.length}/${card.expressions.length}` : '未学习'}<br />{expanded === card.id ? '收起' : '查看'}</span>
          </button>{expanded === card.id && <div className="mt-4 border-t border-[var(--app-line)] pt-4"><p className="text-xs text-[var(--app-muted)]">{READING_RELATIONS[card.relation]}{p && ` · 下次复习 ${new Date(p.fsrs.due).toLocaleString('zh-CN')}`}</p><p className="mt-3 break-words leading-7">{card.expressions.map(e => e.text).join(' · ')}</p><div className="mt-4"><IELTSReadingNotes key={`${owner}:${card.id}`} owner={owner} card={card} annotation={annotations.get(card.id)} onBlocked={onNotesBlocked} /></div></div>}</article>
        })}</div>
        <p className="text-xs text-[var(--app-muted)]">显示 {shownCards.length} / {visible.length} 组</p>
        {shownCards.length < visible.length && <Button className="w-full" variant="outline" onClick={() => setListLimit(value => value + 20)}>继续加载词条</Button>}
        {!visible.length && <p className="py-8 text-center text-sm text-[var(--app-muted)]">当前筛选下没有词条。</p>}
      </section>
      <section className="mt-7 border-t border-[var(--app-line)] pt-5">
        <Button variant="outline" onClick={() => setShowArchived(value => !value)} aria-expanded={showArchived}>已隐藏卡片 · {archivedCards.length} {showArchived ? '收起' : '查看 / 恢复'}</Button>
        {showArchived && <div className="mt-4 grid gap-3 sm:grid-cols-2">{archivedCards.map(card => <article key={card.id} className="quiet-surface flex items-center justify-between gap-4 p-4"><div><p className="font-serif text-xl">{card.word.replace(/\*$/, '')}</p><p className="text-sm text-[var(--app-muted)]">{card.meaning}</p></div><Button variant="outline" disabled={busy || notesBlocked} onClick={() => void perform(async () => { await restoreReadingCard(owner, card.id); setNotice(`“${card.word.replace(/\*$/, '')}”已恢复。`) })}>恢复</Button></article>)}</div>}
      </section>
      <section className="mt-8 space-y-3 border-t border-[var(--app-line)] pt-5" aria-label="阅读学习备份"><h2 className="font-serif text-xl">把积累留好。</h2><p className="text-xs leading-6 text-[var(--app-muted)]">登录后，学习进度、批注、隐藏卡片和当前练习会随账号同步。也可导出独立备份；恢复备份会替换当前账号的阅读记录并同步到其他设备。</p><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || notesBlocked} onClick={() => { void perform(download) }}>导出阅读备份</Button><Button variant="outline" disabled={busy || notesBlocked} onClick={() => input.current?.click()}>恢复阅读备份</Button></div><input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="选择阅读备份文件" onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        void perform(async () => {
          if (file.size > 10 * 1024 * 1024) throw new Error('备份文件超过 10 MB，请检查文件。')
          const value: unknown = JSON.parse(await file.text())
          if (!window.confirm('恢复会替换当前账号在本机的阅读进度、批注、隐藏状态和当前练习。建议先导出备份，确认恢复吗？')) return
          await restoreReadingBackup(owner, value, cards); setExpanded(undefined); setNotice('阅读学习备份已恢复。')
        })
      }} />{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}</section>
    </>}
  </div>
}
