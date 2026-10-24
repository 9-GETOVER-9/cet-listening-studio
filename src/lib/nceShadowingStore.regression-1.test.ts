import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '@/db/schema'
import { createNCESession, editNCEDraft, moveNCESession, readNCESession, saveNCESession } from './nceShadowingStore'

beforeEach(async () => { await db.delete(); await db.open() })
afterEach(async () => { vi.restoreAllMocks(); await db.delete() })

// Regression: SYNC-001 — an entry target must not send another device back to an older sentence.
// Found by /qa on 2026-10-24
// Report: output/qa-mobile-sync-20261024-1535/report.md
it('saves the current sentence and exact range as the cross-device resume link', async () => {
  const initial = createNCESession('alice', 'NCE_Book2_Lesson01', { start: 5, end: 7, mode: 'hidden' }, ['five', 'six', 'seven'])
  const latest = editNCEDraft(moveNCESession(initial, 2), 'draft at sentence seven')
  await saveNCESession(latest)
  const resume = (await db.settings.get('cloud-resume:alice'))?.value as { path: string } | undefined
  expect(resume).toBeDefined()
  const url = new URL(resume!.path, 'https://example.test')
  expect(url.pathname).toBe('/nce/shadowing/NCE_Book2_Lesson01')
  expect(Object.fromEntries(url.searchParams)).toEqual({ start: '5', end: '7', mode: 'hidden', targetId: 'seven' })
  expect((await readNCESession('alice', latest.context))?.draft).toBe('draft at sentence seven')
  expect(await db.settings.get('cloud-resume:bob')).toBeUndefined()
})

it('keeps the old session and resume link together when saving the new sentence fails', async () => {
  const old = createNCESession('alice', 'NCE_Book2_Lesson01', { start: 1, end: 2, mode: 'visible' }, ['one', 'two'])
  await saveNCESession(old)
  const resume = await db.settings.get('cloud-resume:alice')
  const put = db.settings.put.bind(db.settings)
  vi.spyOn(db.settings, 'put').mockImplementationOnce(put).mockRejectedValueOnce(new Error('quota'))
  await expect(saveNCESession(moveNCESession(old, 1))).rejects.toThrow('quota')
  expect((await readNCESession('alice', old.context))?.position).toBe(0)
  expect(await db.settings.get('cloud-resume:alice')).toEqual(resume)
})
