import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ReadingCard } from '@/lib/ieltsReading'
import { saveReadingAnnotation, type ReadingAnnotation } from '@/lib/ieltsReadingStore'

interface Props { owner: string; card: ReadingCard; annotation?: ReadingAnnotation; onBlocked: (blocked: boolean) => void }
export function IELTSReadingNotes({ owner, card, annotation, onBlocked }: Props) {
  const [note, setNote] = useState(annotation?.note ?? '')
  const [marked, setMarked] = useState(annotation?.marked ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const pending = useRef<{ note?: string; marked?: string[] } | undefined>(undefined)
  const busy = useRef(false)
  async function flush() {
    if (busy.current || !pending.current) return
    busy.current = true; setSaving(true); setError(''); onBlocked(true)
    try {
      while (pending.current) {
        const patch = pending.current; pending.current = undefined
        try { await saveReadingAnnotation(owner, card, patch) }
        catch (e) { pending.current = Object.assign({}, patch, pending.current); throw e }
      }
      setSaved(true); onBlocked(false)
    } catch { setError('批注保存失败，输入仍保留。请重试后再切换词条。'); onBlocked(true) }
    finally { busy.current = false; setSaving(false) }
  }
  function update(patch: { note?: string; marked?: string[] }) {
    pending.current = { ...pending.current, ...patch }; setSaved(false); onBlocked(true)
    if (!error) void flush()
  }
  return <section className="space-y-4 border-t border-[var(--app-line)] pt-5" aria-label={`${card.word} 的阅读批注`}>
    <label className="block text-sm font-semibold">词条笔记
      <textarea aria-label={`${card.word} 的阅读笔记`} rows={4} maxLength={10000} value={note} onChange={event => { setNote(event.target.value); update({ note: event.target.value }) }} placeholder="记忆方法、例句，或这组容易混淆的地方…" className="mt-2 w-full rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)] p-3 font-normal leading-7" />
    </label>
    <fieldset><legend className="mb-2 text-sm font-semibold">标记需要留意的替换表达</legend>
      <div className="flex flex-wrap gap-2">{card.expressions.map(expression => <label key={expression.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${marked.includes(expression.id) ? 'border-[var(--app-accent)] bg-[var(--app-bg)]' : 'border-[var(--app-line)]'}`}>
        <input type="checkbox" checked={marked.includes(expression.id)} onChange={() => { const next = marked.includes(expression.id) ? marked.filter(id => id !== expression.id) : [...marked, expression.id]; setMarked(next); update({ marked: next }) }} />{expression.text}
      </label>)}</div>
    </fieldset>
    <p role="status" className="text-xs text-[var(--app-muted)]">{saving ? '正在自动保存…' : saved ? '批注已保存到本机。' : '笔记与标记自动保存在当前账号的本机浏览器。'}</p>
    {error && <div role="alert" className="text-sm text-red-700">{error}<Button className="ml-3" variant="outline" disabled={saving} onClick={() => { void flush() }}>重试保存批注</Button></div>}
  </section>
}
