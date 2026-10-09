import { Button } from '@/components/ui/button'
import type { PracticeMode, PracticeSettings, PracticeSource } from '@/lib/wordPractice'
interface Props {
  settings: PracticeSettings; onChange: (patch: Partial<PracticeSettings>) => void; source: PracticeSource
  voices: SpeechSynthesisVoice[]; mode: PracticeMode; onMode: (mode: PracticeMode) => void; disabled?: boolean
}
const selectStyle = 'ml-2 rounded border border-[var(--app-line)] bg-[var(--app-surface)] p-2'
export function WordPracticeControls({ settings, onChange, source, voices, mode, onMode, disabled }: Props) {
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="练习模式">
      <Button disabled={disabled} variant={mode === 'dictation' ? 'default' : 'outline'} aria-pressed={mode === 'dictation'} onClick={() => onMode('dictation')}>听音拼写</Button>
      <Button disabled={disabled} variant={mode === 'meaning' ? 'default' : 'outline'} aria-pressed={mode === 'meaning'} onClick={() => onMode('meaning')}>看释义拼写</Button>
    </div>
    <fieldset disabled={disabled} className="flex flex-wrap items-center gap-4 text-sm">
      <label>重复次数<select className={selectStyle} value={settings.repeats} onChange={e => onChange({ repeats: Number(e.target.value) })}>{[1,2,3,5].map(v => <option key={v} value={v}>{v} 次</option>)}</select></label>
      <label>播放速度<select className={selectStyle} value={settings.speed} onChange={e => onChange({ speed: Number(e.target.value) })}>{[0.5,0.75,1,1.25,1.5].map(v => <option key={v} value={v}>{v} 倍</option>)}</select></label>
      <Button variant="outline" aria-pressed={settings.muted} onClick={() => onChange({ muted: !settings.muted })}>{settings.muted ? '开启声音' : '静音'}</Button>
      <label>正确后自动继续<select className={selectStyle} value={settings.autoNext} onChange={e => onChange({ autoNext: Number(e.target.value) })}>{[0,3,5,10].map(v => <option key={v} value={v}>{v ? `${v} 秒` : '关闭'}</option>)}</select></label>
      {source === 'notebook' ? <label>设备合成发音<select aria-label="设备声音" className={selectStyle} value={settings.voice} onChange={e => onChange({ voice: e.target.value })}>
        <option value="">{voices.length ? '设备可用英语声音' : '本设备没有可用英语声音'}</option>
        {!voices.some(v => v.lang.toLowerCase() === 'en-gb') && <option disabled>英式声音不可用</option>}
        {!voices.some(v => v.lang.toLowerCase() === 'en-us') && <option disabled>美式声音不可用</option>}
        {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.lang.toLowerCase() === 'en-gb' ? '英式' : '美式'} · {v.name}</option>)}
      </select></label> : <p className="text-[var(--app-muted)]">教材原始录音 · 口音与讲者固定</p>}
    </fieldset>
  </div>
}
