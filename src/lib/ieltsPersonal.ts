import Dexie, { type Table } from 'dexie'
import type { IELTSCard, IELTSBook } from './ieltsDictation'

export interface PersonalWordInput {
  word: string; chinese?: string; answers: string[]; audio: string; chineseAudio?: string
  groupLabel: string; sourceBook: Exclude<IELTSBook, 'personal'>; sourceLabel: string
  audioData?: Blob; chineseAudioData?: Blob; sources?: string[]
}
export interface PersonalWord extends PersonalWordInput {
  id: string; key: string; owner: string; addedAt: number; sources: string[]
}
class PersonalDB extends Dexie {
  words!: Table<PersonalWord, [string, string]>
  constructor() { super('ielts-personal-vocabulary'); this.version(1).stores({ words: '[owner+key], owner' }) }
}
export const personalDB = new PersonalDB()

export function cleanVocabularyText(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[entity] ?? entity)
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, code: string) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match
    }).replace(/\s+/g, ' ').trim()
}
export function normalizeWord(value: string) {
  return cleanVocabularyText(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim()
}
/** Group identities survive additions/removals during the current page session. */
export function assignPersonalGroups(labels:readonly string[],registry:Map<string,number>) {
  labels.forEach(label=>{if(!registry.has(label))registry.set(label,registry.size+1)})
  return Object.fromEntries(labels.map(label=>[registry.get(label)!,label]))
}
export function isPublicAudio(value: string) {
  try {
    const url = new URL(value, 'https://www.listening.website')
    return !!value && url.protocol === 'https:' && ['www.listening.website', 'listening.website'].includes(url.hostname) && url.pathname.startsWith('/data/audio/') && !url.username && !url.password
  } catch { return false }
}
function validBlob(value?: Blob) { return value instanceof Blob && value.size > 0 && ['audio/mpeg', 'audio/wav', 'audio/ogg'].includes(value.type) }
export function validatePersonalInput(input: PersonalWordInput): PersonalWordInput {
  if (!input || typeof input.word !== 'string' || !normalizeWord(input.word) || input.word.length > 500 ||
    typeof input.groupLabel !== 'string' || !input.groupLabel.trim() || input.groupLabel.length > 300 ||
    typeof input.sourceLabel !== 'string' || input.sourceLabel.length > 300 ||
    !['wanglu', 'frequency', 'network'].includes(input.sourceBook) ||
    !Array.isArray(input.answers) || !input.answers.length || input.answers.some(a => typeof a !== 'string' || !a.trim() || a.length > 500) ||
    (!isPublicAudio(input.audio) && !validBlob(input.audioData)) ||
    (input.chineseAudio && !isPublicAudio(input.chineseAudio)) ||
    (input.audioData !== undefined && !validBlob(input.audioData)) ||
    (input.chineseAudioData !== undefined && !validBlob(input.chineseAudioData)) ||
    (input.chinese !== undefined && (typeof input.chinese !== 'string' || input.chinese.length > 4000)) ||
    (input.sources && (!Array.isArray(input.sources) || input.sources.length > 10000 || input.sources.some(s => typeof s !== 'string' || s.length > 300)))) {
    throw new Error('词条、分组或音频数据不完整；本次没有导入，请检查文件。')
  }
  if (!cleanVocabularyText(input.groupLabel) || input.answers.some(a=>!cleanVocabularyText(a))) throw new Error('词条分组或答案为空；本次没有导入。')
  return { word: cleanVocabularyText(input.word), chinese: input.chinese ? cleanVocabularyText(input.chinese) : '',
    answers: [...new Set(input.answers.map(cleanVocabularyText))], audio: isPublicAudio(input.audio) ? input.audio : '',
    chineseAudio: input.chineseAudio || undefined, groupLabel: cleanVocabularyText(input.groupLabel),
    sourceBook: input.sourceBook, sourceLabel: cleanVocabularyText(input.sourceLabel),
    audioData: input.audioData, chineseAudioData: input.chineseAudioData,
    sources: input.sources?.map(cleanVocabularyText) }
}
export function readPersonalWords(owner: string) { return personalDB.words.where('owner').equals(owner).sortBy('addedAt') }
export async function importPersonalWords(owner: string, inputs: PersonalWordInput[]) {
  if (!owner) throw new Error('账号尚未准备好')
  const validated = inputs.map(validatePersonalInput)
  return personalDB.transaction('rw', personalDB.words, async () => {
    let added = 0
    for (const input of validated) {
      const key = normalizeWord(input.word)
      const existing = await personalDB.words.get([owner, key])
      const sources = [...new Set([...(existing?.sources ?? []), ...(input.sources ?? []), input.sourceLabel].filter(Boolean))]
      if(sources.length>10000)throw new Error('来源数量超过导入上限；本次没有导入。')
      const record: PersonalWord = existing ? { ...existing, sources } : { ...input, sources, key, owner, id: `personal:${key}`, addedAt: Date.now() }
      // A later import may fill missing translations; never replace an existing good recording.
      if (existing && !existing.chineseAudio && !existing.chineseAudioData) {
        record.chineseAudio = input.chineseAudio; record.chineseAudioData = input.chineseAudioData
      }
      if (!record.chinese) record.chinese = input.chinese
      await personalDB.words.put(record)
      if (!existing) added++
    }
    return { added, existing: inputs.length - added, total: await personalDB.words.where('owner').equals(owner).count() }
  })
}
export function removePersonalWord(owner: string, key: string) { return personalDB.words.delete([owner, key]) }
export function clearPersonalWords(owner: string) { return personalDB.words.where('owner').equals(owner).delete() }
export function personalWordInput(card: IELTSCard, book: Exclude<IELTSBook, 'personal'>, groupLabel: string): PersonalWordInput {
  return { word: card.word, chinese: card.chinese, answers: card.answers, audio: card.audio, chineseAudio: card.chineseAudio,
    sourceBook: card.sourceBook ?? book, sourceLabel: card.sourceLabel ?? groupLabel, groupLabel }
}
