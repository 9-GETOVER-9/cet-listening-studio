import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
const entries = new Map<string, string>()
const storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => entries.set(k, v), removeItem: (k: string) => entries.delete(k) }
let useSettingsStore: typeof import('./settingsStore')['useSettingsStore']
beforeAll(async () => { vi.stubGlobal('window', { localStorage: storage }); useSettingsStore = (await import('./settingsStore')).useSettingsStore })
beforeEach(() => { entries.clear(); useSettingsStore.setState({ sentenceAnnotations: { enabled: true, linking: true, weak: true, phrases: true } }) })

it('persists switches and preserves individual choices when the master is disabled', async () => {
  const { setSentenceAnnotationSetting } = useSettingsStore.getState()
  setSentenceAnnotationSetting('weak', false)
  setSentenceAnnotationSetting('enabled', false)
  expect(JSON.parse(storage.getItem('cet-settings-store')!).state.sentenceAnnotations).toEqual({ enabled: false, linking: true, weak: false, phrases: true })
  await useSettingsStore.persist.rehydrate()
  setSentenceAnnotationSetting('enabled', true)
  expect(useSettingsStore.getState().sentenceAnnotations.weak).toBe(false)
})
it('supplies enabled defaults for existing installations without annotation settings', async () => {
  storage.setItem('cet-settings-store', JSON.stringify({ state: { nickname: 'Existing learner' }, version: 0 }))
  await useSettingsStore.persist.rehydrate()
  expect(useSettingsStore.getState().sentenceAnnotations).toEqual({ enabled: true, linking: true, weak: true, phrases: true })
  expect(useSettingsStore.getState().nickname).toBe('Existing learner')
})
it('fills partial settings and ignores malformed saved values', async () => {
  storage.setItem('cet-settings-store', JSON.stringify({ state: { sentenceAnnotations: { weak: false, enabled: 'false' } }, version: 0 }))
  await useSettingsStore.persist.rehydrate()
  expect(useSettingsStore.getState().sentenceAnnotations).toEqual({ enabled: true, linking: true, weak: false, phrases: true })
})
