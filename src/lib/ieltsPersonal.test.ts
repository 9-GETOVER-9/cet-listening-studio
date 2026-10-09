import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import * as api from './ieltsPersonal'
const item = { word: 'Library', chinese: '图书馆', audio: '/data/audio/ielts/a.mp3', chineseAudio: '/data/audio/ielts-zh/z.mp3', answers: ['library'], groupLabel: '高频 · Unit 1', sourceBook: 'frequency' as const, sourceLabel: '高频 · Unit 1' }
beforeEach(async () => { if (api) { await api.personalDB.delete(); await api.personalDB.open() } })
it('normalizes formatting without merging different spelling variants', () => {
  expect(api).toBeDefined()
  expect(api.normalizeWord('  Children’s  BOOKS ')).toBe("children's books")
  expect(api.normalizeWord('cheque/check')).not.toBe(api.normalizeWord('cheque'))
})
it('keeps selected group identity when earlier groups are removed or inserted',()=>{
 const registry=new Map<string,number>()
 const initial=api.assignPersonalGroups(['Unit 1','Unit 2'],registry)
 const selected=Number(Object.keys(initial).find(id=>initial[Number(id)]==='Unit 2'))
 expect(api.assignPersonalGroups(['Unit 2'],registry)[selected]).toBe('Unit 2')
 expect(api.assignPersonalGroups(['Unit 0','Unit 2'],registry)[selected]).toBe('Unit 2')
})
it('persists marked words after reopen and isolates accounts', async () => {
  expect(api).toBeDefined()
  await api.importPersonalWords('alice', [item])
  api.personalDB.close(); await api.personalDB.open()
  expect(await api.readPersonalWords('bob')).toEqual([])
  expect(await api.readPersonalWords('alice')).toMatchObject([{ word: 'Library', groupLabel: item.groupLabel }])
})
it('deduplicates concurrent imports and retains extra sources', async () => {
  expect(api).toBeDefined()
  await Promise.all([api.importPersonalWords('alice', [item]), api.importPersonalWords('alice', [{ ...item, word: 'library', sourceLabel: '王陆 · 第3章' }])])
  const words = await api.readPersonalWords('alice')
  expect(words).toHaveLength(1)
  expect(words[0].sources).toEqual(expect.arrayContaining([item.sourceLabel, '王陆 · 第3章']))
  expect((await api.importPersonalWords('alice', [item])).added).toBe(0)
})
it('rejects an invalid batch without saving its valid prefix', async () => {
  expect(api).toBeDefined()
  await expect(api.importPersonalWords('alice', [item, { ...item, word: 'bad', audio: 'javascript:alert(1)' }])).rejects.toThrow()
  expect(await api.readPersonalWords('alice')).toEqual([])
})
it('rejects labels and answers that become empty after stripping markup',async()=>{
  await expect(api.importPersonalWords('alice',[{...item,groupLabel:'<b></b>',answers:['<i></i>']}])).rejects.toThrow()
  expect(await api.readPersonalWords('alice')).toEqual([])
})
it('removes and clears only the requested owner', async () => {
  expect(api).toBeDefined()
  await api.importPersonalWords('alice', [item]); await api.importPersonalWords('bob', [item])
  await api.removePersonalWord('alice', api.normalizeWord(item.word))
  expect(await api.readPersonalWords('alice')).toEqual([])
  await api.clearPersonalWords('alice')
  expect(await api.readPersonalWords('bob')).toHaveLength(1)
})
it('retains imported provenance without silently truncating its source label',async()=>{
 await api.importPersonalWords('alice',[{...item,sources:Array.from({length:50},(_,i)=>`来源${i}`)}])
 const [word]=await api.readPersonalWords('alice');expect(word.sources).toHaveLength(51);expect(word.sources).toContain(item.sourceLabel)
})
it('storage failures roll back and propagate to the caller', async () => {
  expect(api).toBeDefined()
  const fail = vi.spyOn(api.personalDB.words, 'put').mockRejectedValueOnce(new Error('quota'))
  try { await expect(api.importPersonalWords('alice', [item])).rejects.toThrow('quota') }
  finally { fail.mockRestore() }
  expect(await api.readPersonalWords('alice')).toEqual([])
})
