import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { frequencyDB, readFrequencyProgress, saveFrequencyOutcome, selectFrequencyTestCards, summarizeFrequencyChapters } from './ieltsFrequencyProgress'
import { applyFrequencyImport, createFrequencyImport, decodeFrequencyImport, importCards, projectImportedProgress, validateImportAccount } from './frequencyImport'
import type { IELTSCard } from './ieltsDictation'
import { loadPracticeWords, parsePracticeOptions } from './wordPractice'

const cards: IELTSCard[] = ['ice', 'tools', 'ice', 'new'].map((word, i) => ({ id: `f${i}`, word, answers: [word], chapter: 1, section: 'a', audio: '/audio.mp3' }))
const rows = [{ word: 'ice', passed: true }, { word: 'tools', passed: false }, { word: 'whales', passed: false }, { word: 'plants', passed: true }]
beforeEach(async () => { await frequencyDB.delete(); await frequencyDB.open() })

it('counts mastered native cards per unit for only the current owner after import and review', async () => {
  const units = cards.map((card, i) => ({ ...card, chapter: i < 2 ? 1 : 2 }))
  const seed = await createFrequencyImport('test', rows, units, 123)
  await applyFrequencyImport('alice', seed, units)
  await saveFrequencyOutcome({ owner: 'bob', sessionId: 'other', cardId: 'f1', passed: true })
  const decoded = await decodeFrequencyImport(seed, units)
  const read = async () => projectImportedProgress(await readFrequencyProgress('alice'), decoded)
  const mixed = [...await read(), ...await readFrequencyProgress('bob')]
  expect([...summarizeFrequencyChapters('alice', units, mixed)]).toEqual([[1, { mastered: 1, total: 2 }], [2, { mastered: 1, total: 2 }]])
  await saveFrequencyOutcome({ owner: 'alice', sessionId: 'review', cardId: 'f1', passed: true })
  expect(summarizeFrequencyChapters('alice', units, await read()).get(1)).toEqual({ mastered: 2, total: 2 })
  expect(summarizeFrequencyChapters('guest', units, mixed).get(1)).toEqual({ mastered: 0, total: 2 })
})

it('retains exact word forms, covers duplicate native cards and round trips compactly', async () => {
  const seed = await createFrequencyImport('test', rows, cards, 123)
  const decoded = await decodeFrequencyImport(seed, cards)
  expect(decoded.map(row => [row.word, row.passed, row.cardIds])).toEqual([
    ['ice', true, ['f0', 'f2']], ['tools', false, ['f1']],
    ['whales', false, [expect.stringContaining('import-')]], ['plants', true, [expect.stringContaining('import-')]],
  ])
  expect(seed).toMatchObject({ total: 4, correct: 2 })
  expect(JSON.stringify(seed)).not.toContain('answer')
  await expect(decodeFrequencyImport(seed, [...cards].reverse())).rejects.toThrow('词库')
})

it('rejects malformed, duplicate, oversized or wrong-account imports before writes', async () => {
  await expect(createFrequencyImport('test', [...rows, rows[0]], cards)).rejects.toThrow('重复')
  await expect(createFrequencyImport('test', [{ word: 'bad', passed: 'true' } as never], cards)).rejects.toThrow()
  const seed = await createFrequencyImport('test', rows, cards)
  await expect(decodeFrequencyImport({ ...seed, correct: 3 }, cards)).rejects.toThrow()
  await expect(decodeFrequencyImport({ ...seed, extra: 'a'.repeat(20000) }, cards)).rejects.toThrow()
  expect(() => validateImportAccount('a@example.com', 'b@example.com')).toThrow('账号')
  expect(() => validateImportAccount(' A@example.com ', 'a@example.com')).not.toThrow()
  expect(await readFrequencyProgress('alice')).toEqual([])
})

it('applies atomically to one owner and only once, preserving later reviews', async () => {
  const seed = await createFrequencyImport('test', rows, cards, 123)
  await saveFrequencyOutcome({ owner: 'bob', sessionId: 'other', cardId: 'f0', passed: false })
  await Promise.all([applyFrequencyImport('alice', seed, cards), applyFrequencyImport('alice', seed, cards)])
  expect(await readFrequencyProgress('alice')).toHaveLength(5)
  expect(selectFrequencyTestCards(cards, await readFrequencyProgress('alice')).map(c => c.id)).toEqual(['f1', 'f3'])
  expect(await readFrequencyProgress('bob')).toMatchObject([{ passed: false, attempts: 1 }])
  await saveFrequencyOutcome({ owner: 'alice', sessionId: 'review', cardId: 'f1', passed: true })
  await applyFrequencyImport('alice', seed, cards)
  expect((await readFrequencyProgress('alice')).find(p => p.cardId === 'f1')).toMatchObject({ passed: true, attempts: 2 })
})

it('projects the latest review to duplicate word forms only for imported words', async () => {
  const seed = await createFrequencyImport('test', rows, cards, 123)
  const decoded = await decodeFrequencyImport(seed, cards)
  await applyFrequencyImport('alice', seed, cards)
  await saveFrequencyOutcome({ owner: 'alice', sessionId: 'again', cardId: 'f2', passed: false })
  const projected = projectImportedProgress(await readFrequencyProgress('alice'), decoded)
  expect(projected.filter(p => ['f0', 'f2'].includes(p.cardId)).every(p => !p.passed)).toBe(true)
  expect(projectImportedProgress(await readFrequencyProgress('bob'), decoded)).toEqual([])
  const supplement = { ...cards[0], id: 'dictionary-whales', word: 'whales', chinese: '鲸', chineseAudio: '/zh.mp3' }
  const list = importCards(decoded, cards, [supplement])
  expect(list.map(c => c.word)).toEqual(['ice', 'tools', 'whales', 'plants'])
  expect(list.find(c => c.word === 'whales')).toMatchObject({ audio: '/audio.mp3', chineseAudio: '/zh.mp3' })
})

it('rolls back the whole import if a write fails', async () => {
  const seed = await createFrequencyImport('test', rows, cards)
  const hook = (_key: unknown, obj: { cardId: string }) => { if (obj.cardId === 'f1') throw new Error('quota') }
  frequencyDB.progress.hook('creating', hook)
  try { await expect(applyFrequencyImport('alice', seed, cards)).rejects.toThrow('quota') }
  finally { frequencyDB.progress.hook('creating').unsubscribe(hook) }
  expect(await readFrequencyProgress('alice')).toEqual([])
  await applyFrequencyImport('alice', seed, cards)
  expect(await readFrequencyProgress('alice')).toHaveLength(5)
})

it('reconstructs the same import on a fresh device and skips passed words in focused practice only for that owner', async () => {
  const seed = await createFrequencyImport('test', rows, cards)
  await applyFrequencyImport('alice', seed, cards)
  await frequencyDB.delete(); await frequencyDB.open()
  await applyFrequencyImport('alice', JSON.parse(JSON.stringify(seed)), cards)
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ cards })))
  vi.stubGlobal('fetch', fetcher)
  try {
    const options = parsePracticeOptions(new URLSearchParams('source=frequency'))
    expect((await loadPracticeWords('alice', options)).map(w => w.word)).toEqual(['tools', 'new'])
    expect((await loadPracticeWords('bob', options)).map(w => w.word)).toEqual(['ice', 'tools', 'ice', 'new'])
  } finally { vi.unstubAllGlobals() }
})
