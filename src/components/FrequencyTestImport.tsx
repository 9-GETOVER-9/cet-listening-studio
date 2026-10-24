import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { applyFrequencyImport, createFrequencyImport, FREQUENCY_IMPORT_KEY, validateImportAccount, type FrequencyImport, type ImportRow } from '@/lib/frequencyImport'
import type { IELTSCard } from '@/lib/ieltsDictation'

export function FrequencyTestImport({ owner, cards, onImported }: { owner: string; cards: IELTSCard[]; onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ seed: FrequencyImport; email: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  async function prepare(file?: File) {
    if (!file) return
    if (file.size > 500000) { setPreview(null); setError('导入文件过大'); return }
    try { await prepareText(await file.text()) }
    catch { setPreview(null); setError('文件读取失败，请重试或粘贴导入内容。') }
    finally { if (input.current) input.current.value = '' }
  }
  async function prepareText(text: string) {
    setBusy(true); setPreview(null); setError(''); setDone(false)
    try {
      if (new Blob([text]).size > 500000) throw new Error('导入内容过大')
      const data = JSON.parse(text) as { version: string; email: string; id: string; rows: ImportRow[] }
      if (data.version !== 'frequency-test-import-v1' || typeof data.email !== 'string') throw new Error('请选择已整理的测试记录 JSON 文件。')
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || auth.user?.id !== owner) throw new Error('请先登录指定账号。')
      validateImportAccount(data.email, auth.user.email)
      setPreview({ seed: await createFrequencyImport(data.id, data.rows, cards), email: data.email })
    } catch (e) { setError(e instanceof Error ? e.message : '文件读取失败') }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!preview || busy) return
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error || data.user?.id !== owner) throw new Error('登录账号已变化，请重新登录。')
      validateImportAccount(preview.email, data.user.email)
      const existing = data.user.user_metadata[FREQUENCY_IMPORT_KEY] as FrequencyImport | undefined
      if (existing && existing.id !== preview.seed.id) throw new Error('账号已有另一份导入记录，请先核对后再处理。')
      const seed = existing?.id === preview.seed.id ? existing : preview.seed
      const result = await supabase.auth.updateUser({ data: { [FREQUENCY_IMPORT_KEY]: seed } })
      if (result.error) throw new Error('账号保存失败，尚未修改本机进度。请重试。')
      await applyFrequencyImport(owner, seed, cards)
      setPreview(null); setPasted(''); setPasteOpen(false); setDone(true); onImported()
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败，请重试。') }
    finally { setBusy(false) }
  }
  return <details className="mt-5 border-t border-[var(--app-line)] pt-4">
    <summary className="cursor-pointer text-sm">导入我的测试记录</summary>
    <p className="my-3 text-sm text-[var(--app-muted)]">仅更新当前账号。正确词自动跳过，错词进入个人复习列表；手机登录同一账号即可读取这次导入。</p>
    <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="选择个人测试记录文件" onChange={e => void prepare(e.target.files?.[0])} />
    <Button variant="outline" disabled={busy || owner === 'guest'} onClick={() => input.current?.click()}>{busy ? '正在处理…' : '选择测试记录文件'}</Button>
    <Button variant="ghost" disabled={busy || owner === 'guest'} onClick={() => { setPasteOpen(value => !value); setPreview(null) }}>粘贴导入内容</Button>
    {pasteOpen && <div className="mt-3 space-y-3">
      <label className="block text-sm">测试记录 JSON
        <textarea aria-label="测试记录 JSON" className="mt-2 block min-h-28 w-full rounded border border-[var(--app-line)] bg-[var(--app-surface)] p-3 text-sm" value={pasted} disabled={busy} maxLength={500000}
          onChange={event => { setPasted(event.target.value); setPreview(null); setDone(false) }} placeholder="无法选择文件时，将已整理的 JSON 内容粘贴到这里" />
      </label>
      <Button variant="outline" disabled={busy || !pasted.trim()} onClick={() => void prepareText(pasted)}>预览导入记录</Button>
    </div>}
    {owner === 'guest' && <p className="mt-2 text-sm">请先登录后导入，访客记录不会上传。</p>}
    {preview && <div className="mt-4 space-y-3"><p>本次 {preview.seed.total} 词：正确 {preview.seed.correct} 词将跳过，错误 {preview.seed.total - preview.seed.correct} 词进入复习。</p><Button disabled={busy} onClick={() => void apply()}>确认导入到我的账号</Button></div>}
    {error && <p role="alert" className="mt-3 text-red-600">{error}</p>}
    {done && <p role="status" className="mt-3 text-emerald-700">已保存到当前账号，正在刷新个人错词列表。</p>}
  </details>
}
