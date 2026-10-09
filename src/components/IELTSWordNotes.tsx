import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { IELTSCard } from '@/lib/ieltsDictation'
import { saveFrequencyAnnotation, type AnnotationSeed } from '@/lib/ieltsAnnotations'
import { FREQUENCY_REASON_LABELS, type FrequencyReason } from '@/lib/ieltsFrequencyProgress'

interface Props {
  owner: string
  card: IELTSCard
  annotation: AnnotationSeed
  showReason?: boolean
  disabled?: boolean
}
export function IELTSWordNotes({ owner, card, annotation, showReason = true, disabled = false }: Props) {
  // The parent keys each editor by owner and card, so an earlier save cannot
  // replace a different word's draft. Live updates only fill untouched fields.
  const [draft, setDraft] = useState<{ note?: string; reason?: FrequencyReason }>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  const note = draft.note !== undefined ? draft.note : annotation.note
  const reason = draft.reason !== undefined ? draft.reason : annotation.reason
  const dirty = draft.note !== undefined || draft.reason !== undefined
  async function save() {
    if (disabled || busyRef.current || !dirty) return
    busyRef.current = true; setSaving(true); setError(''); setSaved(false)
    const patch = { ...draft }
    try {
      await saveFrequencyAnnotation(owner, card.id, patch)
      if (mountedRef.current) { setDraft({}); setSaved(true) }
    } catch {
      if (mountedRef.current) setError('笔记与标签保存失败，输入仍然保留。请重试保存。')
    } finally {
      busyRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }
  return <section className="space-y-3 border-t border-[var(--app-line)] pt-4" aria-label={`${card.word} 的笔记编辑`}>
    <label className="block text-sm">{card.word} 的笔记
      <textarea aria-label={`${card.word} 的笔记`} value={note} maxLength={10000} rows={5} disabled={saving || disabled}
        onChange={event => { setDraft(value => ({ ...value, note: event.target.value })); setSaved(false) }}
        placeholder="写下记忆方法、发音提示或易错点"
        className="mt-2 block w-full resize-y border border-[var(--app-line)] bg-[var(--app-surface)] p-3 leading-6 disabled:opacity-70" />
    </label>
    {annotation.sourceFlag && <p className="break-words text-sm text-[var(--app-muted)]">原始 Flag：{annotation.sourceFlag}</p>}
    {showReason && <label className="block text-sm">词条标签
      <select aria-label={`${card.word} 的笔记标签`} value={reason ?? 'unlabelled'} disabled={saving || disabled}
        onChange={event => { setDraft(value => ({ ...value, reason: event.target.value === 'unlabelled' ? null : event.target.value as FrequencyReason })); setSaved(false) }}
        className="mt-2 block w-full border border-[var(--app-line)] bg-[var(--app-surface)] p-3">
        {Object.entries(FREQUENCY_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>}
    <div className="flex flex-wrap gap-3">
      <Button disabled={saving || disabled || !dirty} onClick={() => { void save() }}>{saving ? '正在保存…' : error ? '重试保存笔记与标签' : '保存笔记与标签'}</Button>
      <Button variant="outline" disabled={saving || disabled} onClick={() => { setDraft(showReason ? { note: '', reason: null } : { note: '' }); setSaved(false); setError('') }}>{showReason ? '清空笔记与标签' : '清空笔记'}</Button>
    </div>
    <p className="text-xs text-[var(--app-muted)]">编辑或清空后点击保存；保存在当前账号的本机浏览器中。</p>
    {saved && <p role="status" className="text-sm text-emerald-700">笔记与标签已保存。</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>
}
