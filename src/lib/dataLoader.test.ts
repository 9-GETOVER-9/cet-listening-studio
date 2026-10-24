import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '@/db/schema'
import { mergeCards } from '@/db/crud'
import { createInitialFSRSState } from '@/lib/fsrs'
import { getInitPromise, initializeData, startBackgroundInit } from './dataLoader'
import type { Card } from '@/types'

function card(index: number): Card {
  return {
    cardId: `card-${index}`, moduleId: 'module-1', seq: index * 1000,
    audioFile: `${index}.mp3`, englishText: `Sentence ${index}.`, chineseText: `句子${index}`,
    tags: [], difficulty: 'basic', level: 'CET4',
    aiAnalysis: { phrases: [], pronunciation: [], grammar: [] },
    fsrsMain: createInitialFSRSState(),
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    cards: [card(1), card(2), card(3), card(4)].map(c => ({ ...c, chineseText: '修订译文' })),
  }), { headers: { 'Content-Type': 'application/json' } })))
})

afterEach(() => vi.unstubAllGlobals())

it.each([2, 3])('keeps %i joined sentences joined during a content upgrade', async (count) => {
  await db.cards.bulkPut([card(1), card(2), card(3), card(4)])
  const ids = Array.from({ length: count }, (_, i) => `card-${i + 1}`)
  const merged = await mergeCards(ids)
  await initializeData()
  expect(await db.cards.bulkGet(ids)).toEqual(ids.map(() => undefined))
  expect(await db.cards.get(merged.cardId)).toEqual(merged)
  expect((await db.cards.get('card-4'))?.chineseText).toBe('修订译文')
  expect((await db.modules.get('module-1'))?.totalCards).toBe(5 - count)
})

it('removes source cards resurrected by an earlier upgrade', async () => {
  await db.cards.bulkPut([card(1), card(2), card(3)])
  const merged = await mergeCards(['card-1', 'card-2'])
  await db.cards.bulkPut([card(1), card(2)])
  await initializeData()
  expect(await db.cards.bulkGet(['card-1', 'card-2'])).toEqual([undefined, undefined])
  expect(await db.cards.get(merged.cardId)).toEqual(merged)
})

it('reserves a shared import promise while critical route code finishes downloading', async () => {
  let allowImport!: () => void
  const criticalPage = new Promise<void>(resolve => { allowImport = resolve })
  const pending = startBackgroundInit(undefined, criticalPage)
  try {
    expect(getInitPromise()).toBe(pending)
    expect(startBackgroundInit()).toBe(pending)
    // Let IndexedDB reads from an ungated importer complete before checking traffic.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    allowImport()
    await pending
  }
  expect(fetch).toHaveBeenCalledOnce()
  expect(await db.cards.count()).toBe(4)
})
