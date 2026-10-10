import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/store/settingsStore'

const choices = [
  { key: 'linking', label: '连读', description: '蓝色词间弧线 · 连接连读词', color: 'border-blue-300 bg-blue-50' },
  { key: 'weak', label: '弱读', description: '浅紫色框', color: 'border-purple-300 bg-purple-100' },
  { key: 'phrases', label: '短语', description: '琥珀色底部括线 · 标明完整短语', color: 'border-amber-500 bg-amber-50' },
] as const

export function SentenceAnnotationSettings() {
  const options = useSettingsStore(s => s.sentenceAnnotations)
  const setOption = useSettingsStore(s => s.setSentenceAnnotationSetting)
  return <section aria-labelledby="sentence-annotations-heading" className="py-3">
    <div className="flex items-center justify-between gap-3">
      <div><p id="sentence-annotations-heading" className="font-medium text-gray-900">原句标注</p>
        <p className="text-sm text-gray-500">四六级与新概念的学习、复习卡片</p></div>
      <Button type="button" size="sm" role="switch" aria-label="原句标注总开关" aria-checked={options.enabled}
        title={options.enabled ? '点击关闭原句标注' : '点击开启原句标注'}
        variant={options.enabled ? 'default' : 'outline'} onClick={() => setOption('enabled', !options.enabled)}>
        {options.enabled ? '已开启' : '已关闭'}
      </Button>
    </div>
    {!options.enabled && <p role="status" className="mt-3 text-sm text-gray-500">总开关已关闭，连读、弱读和短语暂不显示；开启后恢复下方选择。</p>}
    <div className={`mt-3 space-y-3 border-l-2 border-gray-200 pl-3 ${options.enabled ? '' : 'opacity-50'}`}>
      {choices.map(item => <div key={item.key} className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span aria-hidden className={`h-3 w-3 shrink-0 rounded border ${item.color}`} />
          <div><p className="text-sm font-medium">{item.label}标注</p><p className="text-xs text-gray-500">{item.description}</p></div></div>
        <Button type="button" size="sm" role="switch" aria-label={`${item.label}标注`} aria-checked={options[item.key]} disabled={!options.enabled}
          variant={options[item.key] ? 'default' : 'outline'} onClick={() => setOption(item.key, !options[item.key])}>
          {options[item.key] ? '已开启' : '已关闭'}
        </Button>
      </div>)}
    </div>
    <p className="mt-3 text-xs text-gray-500">设置保存在本机浏览器；原句标注随 AI 解析解锁后显示。</p>
  </section>
}
