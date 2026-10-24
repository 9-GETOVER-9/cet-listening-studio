import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'
import { frequencyDB, type FrequencyProgress } from './ieltsFrequencyProgress'
import type { IELTSCard } from './ieltsDictation'

export const FREQUENCY_IMPORT_KEY = 'frequency_import_v1'
export interface ImportRow { word: string; passed: boolean }
export interface ImportedRow extends ImportRow { cardIds: string[] }
export interface FrequencyImport { v: 1; id: string; at: number; hash: string; states: string; extra: string; total: number; correct: number }
const MAX_SEED_BYTES = 3500
export const importWord = (word: string) => word.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ')
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''))
const unbase64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0))
async function corpusHash(cards: readonly IELTSCard[]) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(cards.map(c => [c.id, importWord(c.word)]))))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
export function validateImportAccount(expected: string, actual?: string) {
  if (!actual || expected.trim().toLowerCase() !== actual.trim().toLowerCase()) throw new Error('导入文件与当前登录账号不一致。请切换到指定账号。')
}
export async function createFrequencyImport(id: string, rows: ImportRow[], cards: readonly IELTSCard[], at = Date.now()): Promise<FrequencyImport> {
  if (!id || id.length > 100 || !Array.isArray(rows) || !rows.length || rows.length > 5000) throw new Error('测试记录格式无效')
  const byWord = new Map<string, boolean>()
  for (const row of rows) {
    if (typeof row?.word !== 'string' || !importWord(row.word) || row.word.length > 120 || typeof row.passed !== 'boolean') throw new Error('测试判定或单词无效')
    const word = importWord(row.word)
    if (byWord.has(word)) throw new Error(`测试记录有重复单词：${word}`)
    byWord.set(word, row.passed)
  }
  const states = new Uint8Array(Math.ceil(cards.length / 4))
  cards.forEach((card, index) => {
    const status = byWord.get(importWord(card.word))
    if (status !== undefined) states[index >> 2] |= (status ? 2 : 1) << ((index % 4) * 2)
  })
  const native = new Set(cards.map(card => importWord(card.word)))
  const extra = [...byWord].filter(([word]) => !native.has(word)).map(([word, passed]) => [word, passed ? 1 : 0])
  const seed: FrequencyImport = { v: 1, id, at, hash: await corpusHash(cards), states: base64(states), extra: base64(gzipSync(strToU8(JSON.stringify(extra)))), total: rows.length, correct: rows.filter(row => row.passed).length }
  await decodeFrequencyImport(seed, cards)
  return seed
}
export async function decodeFrequencyImport(value: unknown, cards: readonly IELTSCard[]): Promise<ImportedRow[]> {
  const seed = value as FrequencyImport
  if (!seed || JSON.stringify(seed).length > MAX_SEED_BYTES || seed.v !== 1 || typeof seed.id !== 'string' || !seed.id || seed.id.length > 100 ||
    !Number.isSafeInteger(seed.at) || seed.at <= 0 || !Number.isSafeInteger(seed.total) || seed.total < 1 || seed.total > 5000 ||
    !Number.isSafeInteger(seed.correct) || seed.correct < 0 || seed.correct > seed.total || typeof seed.states !== 'string' || typeof seed.extra !== 'string') throw new Error('导入记录无效或过大')
  if (seed.hash !== await corpusHash(cards)) throw new Error('词库版本与导入记录不一致，请重新生成导入文件。')
  const states = unbase64(seed.states)
  if (states.length !== Math.ceil(cards.length / 4)) throw new Error('导入记录长度无效')
  const rows = new Map<string, ImportedRow>()
  cards.forEach((card, index) => {
    const code = (states[index >> 2] >> ((index % 4) * 2)) & 3
    if (code === 3) throw new Error('导入判定无效')
    if (!code) return
    const word = importWord(card.word), prior = rows.get(word)
    if (prior && prior.passed !== (code === 2)) throw new Error('同一单词判定冲突')
    if (prior) prior.cardIds.push(card.id)
    else rows.set(word, { word, passed: code === 2, cardIds: [card.id] })
  })
  const zipped = unbase64(seed.extra)
  if (zipped.length < 18) throw new Error('补充记录无效')
  const size = new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength).getUint32(zipped.length - 4, true)
  if (size > 50000) throw new Error('补充记录过大')
  const extra: unknown = JSON.parse(strFromU8(gunzipSync(zipped, { out: new Uint8Array(size) })))
  if (!Array.isArray(extra)) throw new Error('补充记录格式无效')
  for (const item of extra) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !item[0] || item[0].length > 120 || ![0, 1].includes(item[1]) || rows.has(item[0]) || cards.some(c => importWord(c.word) === item[0])) throw new Error('补充单词无效或重复')
    const word = importWord(item[0])
    if (word !== item[0]) throw new Error('补充单词格式无效')
    rows.set(word, { word, passed: item[1] === 1, cardIds: [`import-${word}`] })
  }
  if (rows.size !== seed.total || [...rows.values()].filter(r => r.passed).length !== seed.correct) throw new Error('导入数量校验失败')
  return [...rows.values()]
}
export async function applyFrequencyImport(owner: string, seed: FrequencyImport, cards: readonly IELTSCard[]) {
  if (!owner || owner === 'guest') throw new Error('请先登录后导入个人测试记录。')
  const rows = await decodeFrequencyImport(seed, cards)
  await frequencyDB.transaction('rw', frequencyDB.progress, frequencyDB.annotations, frequencyDB.practiceState, async () => {
    const key = `import:${seed.id}`
    if (await frequencyDB.practiceState.get([owner, key])) return
    const backup = await frequencyDB.progress.where('owner').equals(owner).toArray()
    await frequencyDB.practiceState.put({ owner, key: `${key}:backup`, value: backup })
    for (const row of rows) for (const cardId of row.cardIds) {
      const prior = await frequencyDB.progress.get([owner, cardId])
      if (prior && prior.updatedAt > seed.at) continue
      const annotation = await frequencyDB.annotations.get([owner, cardId])
      await frequencyDB.progress.put({ owner, cardId, passed: row.passed, attempts: Math.max(prior?.attempts ?? 0, 1), mistakes: Math.max(prior?.mistakes ?? 0, row.passed ? 0 : 1), reason: annotation?.reason !== undefined ? annotation.reason : prior?.reason ?? null, updatedAt: seed.at })
    }
    await frequencyDB.practiceState.put({ owner, key, value: seed })
    await frequencyDB.practiceState.put({ owner, key: FREQUENCY_IMPORT_KEY, value: seed })
  })
  return rows
}
export function projectImportedProgress(progress: FrequencyProgress[], rows: ImportedRow[]): FrequencyProgress[] {
  const result = new Map(progress.map(p => [p.cardId, p]))
  for (const row of rows) {
    const latest = row.cardIds.map(id => result.get(id)).filter((p): p is FrequencyProgress => !!p).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (latest) for (const cardId of row.cardIds) result.set(cardId, { ...latest, cardId })
  }
  return [...result.values()]
}
export function importCards(rows: ImportedRow[], cards: readonly IELTSCard[], dictionary: readonly IELTSCard[]): IELTSCard[] {
  const byId = new Map(cards.map(card => [card.id, card]))
  const byWord = new Map(dictionary.map(card => [importWord(card.word), card]))
  return rows.map(row => ({ ...(byId.get(row.cardIds[0]) ?? byWord.get(row.word) ?? { chapter: 0, section: '个人测试', word: row.word, answers: [row.word], audio: '' }), id: row.cardIds[0], sourceBook: 'frequency' }))
}
