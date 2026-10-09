import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import { liveQuery } from 'dexie'
import { Button } from '@/components/ui/button'
import { QuietPageHeader } from '@/components/QuietPageHeader'
import { IELTSReadingNotes } from '@/components/IELTSReadingNotes'
import { IELTSReadingSession } from '@/components/IELTSReadingSession'
import { useAuth } from '@/hooks/useAuth'
import { buildReadingQuestion, parseReadingCorpus, selectReadingQueue, READING_RELATIONS, type ReadingCorpus } from '@/lib/ieltsReading'
import { endReadingSession, exportReadingBackup, readReadingSnapshot, restoreReadingBackup, saveReadingSession, type ReadingSnapshot, type ReadingMode } from '@/lib/ieltsReadingStore'

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
    void fetch('/data/ielts-reading-538-v1.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('阅读词库加载失败')
      return response.json() as Promise<unknown>
    }).then(value => setCorpus(parseReadingCorpus(value))).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '词库加载失败') })
    const subscription = liveQuery(() => readReadingSnapshot(owner)).subscribe({ next: setData, error: () => setError('学习记录读取失败，请重试。') })
    return () => { controller.abort(); subscription.unsubscribe() }
  }, [owner, reload])
  async function perform(action: () => Promise<void>) {
    if (lock.current || notesBlocked) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试。') }
    finally { lock.current = false; setBusy(false) }
  }
  const cards = corpus?.cards ?? []
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
  function start(kind: 'due' | 'new' | 'all' | 'retry') {
    void perform(async () => {
      const chosen = (kind === 'retry' ? mistakes : selectReadingQueue(scope, states, kind)).slice(0, roundSize)
      if (!chosen.length) return
      // A saved round is deliberately retained until explicitly replaced by a new round.
      if (data?.session && !window.confirm('开始新一轮会替换尚未结束的练习。已保存的评分和笔记会保留，继续吗？')) return
      const session = { owner, id: crypto.randomUUID(), mode: kind === 'retry' ? 'retry' as const : mode, cardIds: chosen.map(c => c.id), cursor: 0, selected: [], revealed: false, graded: false, completed: 0, correct: 0, createdAt: Date.now(), question: buildReadingQuestion(chosen[0], cards, states.get(chosen[0].id)?.reps ?? 0) }
      await saveReadingSession(session); setExpanded(undefined); setActive(true)
    })
  }
  async function end() { await endReadingSession(owner); setActive(false); setClock(Date.now()) }
  async function download() {
    const content = await exportReadingBackup(owner)
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `reading-538-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('阅读记录、批注与当前练习已导出。')
  }
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
    <Link to="/ielts" className="mb-6 inline-block text-sm text-[var(--app-muted)]">← 雅思专区</Link>
    <QuietPageHeader eyebrow="IELTS · Read & Remember" title="认出另一种表达。" description="阅读 538 · 第一章。同义替换与结构关系，按你的记忆节奏复习。" />
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-300 p-4 text-sm text-red-700">{error}{!active && <Button variant="outline" className="ml-3" onClick={() => setReload(n => n + 1)}>重新加载</Button>}</div>}
    {blocker.state === 'blocked' && <div role="alert" className="mb-4 text-sm">批注尚未保存，请先在编辑区重试。<Button variant="outline" className="ml-3" onClick={() => blocker.reset()}>取消跳转</Button></div>}
    {!corpus || !data ? <p role="status">正在读取词库与本机学习记录…</p> : active && data.session ? <IELTSReadingSession key={data.session.id} cards={cards} session={data.session} data={data} onEnd={end} notesBlocked={notesBlocked} onNotesBlocked={onNotesBlocked} /> : <>
      <div className="mb-6 grid grid-cols-3 gap-3 text-center"><div className="rounded-xl border border-[var(--app-line)] p-4"><strong className="block font-serif text-3xl">{studied}</strong><span className="text-xs text-[var(--app-muted)]">已学 / {scope.length} 组</span></div><div className="rounded-xl border border-[var(--app-line)] p-4"><strong className="block font-serif text-3xl">{due.length}</strong><span className="text-xs text-[var(--app-muted)]">当前到期</span></div><div className="rounded-xl border border-[var(--app-line)] p-4"><strong className="block font-serif text-3xl">{newCards.length}</strong><span className="text-xs text-[var(--app-muted)]">可学新词</span></div></div>
      {data.session && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-accent)] p-4 text-sm"><span>上次练习 · 第 {data.session.cursor + 1} / {data.session.cardIds.length} 题 · 已评分 {data.session.completed} 组</span><Button disabled={busy || notesBlocked} onClick={() => setActive(true)}>继续上次练习</Button></div>}
      <div className="grid gap-3 sm:grid-cols-3">{[1, 2, 3].map(c => <Button key={c} variant={category === String(c) ? 'default' : 'outline'} className="h-auto min-h-20 flex-col gap-2" disabled={notesBlocked || busy} onClick={() => { setCategory(String(c)); setExpanded(undefined) }}><span>第{c}类</span><small className="font-normal">{cards.filter(card => card.category === c).length} 组 · {c === 1 ? '优先熟记' : c === 2 ? '重点积累' : '继续拓展'}</small></Button>)}</div>
      <div className="my-5 flex flex-wrap items-center gap-3"><Button variant="outline" disabled={notesBlocked || busy} onClick={() => { setCategory('all'); setExpanded(undefined) }}>全部三类</Button>
        <label className="text-sm">练习方式 <select aria-label="阅读练习方式" disabled={notesBlocked || busy} value={mode} onChange={e => setMode(e.target.value as typeof mode)} className="rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] p-2"><option value="quiz">多选辨认</option><option value="recall">主动回忆</option></select></label>
        <label className="text-sm">每轮 <input aria-label="每轮题数" type="number" min={1} max={376} value={roundSize} disabled={notesBlocked || busy} onChange={e => setRoundSize(Math.min(376, Math.max(1, Math.floor(Number(e.target.value) || 1))))} className="w-16 rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] p-2" /> 组</label>
      </div>
      <div className="mb-7 flex flex-wrap gap-3"><Button disabled={busy || notesBlocked || !due.length} onClick={() => start('due')}>复习到期词 · {due.length}</Button><Button variant="outline" disabled={busy || notesBlocked || !newCards.length} onClick={() => start('new')}>学习新词</Button><Button variant="outline" disabled={busy || notesBlocked || !scope.some(c => c.status !== 'pending')} onClick={() => start('all')}>练习所选分类</Button><Button variant="outline" disabled={busy || notesBlocked || !mistakes.length} onClick={() => start('retry')}>错题重做 · {mistakes.length}</Button></div>
      <section aria-label="阅读词条查阅" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">词条查阅</h2><span className="text-xs text-[var(--app-muted)]">按主词条组记录进度，保留完整对应表达</span></div>
        <div className="flex flex-col gap-3 sm:flex-row"><input aria-label="搜索阅读词条" value={query} disabled={notesBlocked || busy} onChange={e => setQuery(e.target.value)} placeholder="搜索主词、替换表达或笔记" className="min-w-0 flex-1 rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] p-3 text-sm" /><select aria-label="阅读词条筛选" disabled={notesBlocked || busy} value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-[var(--app-line)] bg-[var(--app-surface)] p-3 text-sm"><option value="all">全部词条</option><option value="notes">有笔记</option><option value="marked">有标记表达</option><option value="due">当前到期</option></select></div>
        <p className="text-xs text-[var(--app-muted)]">找到 {visible.length} 组</p>
        <div className="space-y-3">{visible.map(card => {
          const p = data.progress.find(p => p.cardId === card.id)
          return <article key={card.id} className="rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] p-4 sm:p-5"><button className="flex w-full min-h-11 items-center justify-between gap-4 text-left" disabled={notesBlocked || busy} aria-expanded={expanded === card.id} onClick={() => setExpanded(expanded === card.id ? undefined : card.id)}>
            <span className="min-w-0"><strong className="block break-words text-xl">{card.word.replace(/\*$/, '')}</strong><span className="mt-1 block text-sm text-[var(--app-muted)]">{card.meaning}</span></span><span className="shrink-0 text-right text-xs text-[var(--app-muted)]">第{card.category}类<br />{card.status === 'pending' ? '待核验 · 仅查阅' : p ? `已学 · 覆盖 ${p.covered.length}/${card.expressions.length}` : '未学习'}<br />{expanded === card.id ? '收起' : '展开'}</span>
          </button>{expanded === card.id && <div className="mt-4 space-y-4"><p className="text-xs text-[var(--app-muted)]">{READING_RELATIONS[card.relation]}{p && ` · 下次复习 ${new Date(p.fsrs.due).toLocaleString('zh-CN')}`}</p><p className="break-words leading-7">{card.expressions.map(e => e.text).join(' · ')}</p><IELTSReadingNotes key={`${owner}:${card.id}`} owner={owner} card={card} annotation={annotations.get(card.id)} onBlocked={onNotesBlocked} /></div>}</article>
        })}</div>
        {!visible.length && <p className="py-8 text-center text-sm text-[var(--app-muted)]">当前筛选下没有词条。</p>}
      </section>
      <section className="mt-8 space-y-3 border-t border-[var(--app-line)] pt-5" aria-label="阅读学习备份"><h2 className="font-serif text-xl">把积累留好。</h2><p className="text-xs leading-6 text-[var(--app-muted)]">学习记录、批注与标记保存在当前账号的本机浏览器。导出备份，可在另一台设备恢复；恢复会替换当前账号的阅读学习记录。</p><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || notesBlocked} onClick={() => { void perform(download) }}>导出阅读备份</Button><Button variant="outline" disabled={busy || notesBlocked} onClick={() => input.current?.click()}>恢复阅读备份</Button></div><input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="选择阅读备份文件" onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        void perform(async () => {
          if (file.size > 10 * 1024 * 1024) throw new Error('备份文件超过 10 MB，请检查文件。')
          const value: unknown = JSON.parse(await file.text())
          if (!window.confirm('恢复会替换当前账号在本机的阅读进度、批注和当前练习。建议先导出备份，确认恢复吗？')) return
          await restoreReadingBackup(owner, value, cards); setExpanded(undefined); setNotice('阅读学习备份已恢复。')
        })
      }} />{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}</section>
    </>}
  </div>
}
