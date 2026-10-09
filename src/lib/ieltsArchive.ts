import { strFromU8, strToU8, Unzip, UnzipInflate, unzipSync, zipSync, type UnzipFileInfo } from 'fflate'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { IELTSCard } from './ieltsDictation'
import { cleanVocabularyText, isPublicAudio, normalizeWord, validatePersonalInput, type PersonalWordInput } from './ieltsPersonal'

const MAX_INPUT = 100 * 1024 * 1024
const MAX_EXPANDED = 250 * 1024 * 1024
const MAX_ENTRIES = 25000
const MAX_WORDS = 10000
const FORMAT = 'ielts-vocabulary'
type Entries = Record<string, Uint8Array>
type JsonObject = Record<string, unknown>
export interface ArchiveOptions { wasmBinary?: Uint8Array; maxReferencedMediaBytes?: number }

function fail(message: string): never { throw new Error(`${message}；本次没有导入。`) }
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('词库文件结构不正确')
  return value as JsonObject
}
function json(bytes: Uint8Array): unknown {
  try { return JSON.parse(strFromU8(bytes)) }
  catch { return fail('JSON 数据无效') }
}
function safePath(path: string) {
  if (!path || path.startsWith('/') || /[\\:]/.test(path) || Array.from(path).some(char => char.charCodeAt(0) < 32) || path.split('/').some(p => p === '..' || p === '.')) fail('压缩包包含不安全路径')
  return path
}
function unpack(bytes: Uint8Array): Entries {
  let expanded = 0, entries = 0
  const metadata = new Map<string, UnzipFileInfo>()
  // The first pass reads only ZIP metadata. No entry is inflated before all paths and sizes pass.
  unzipSync(bytes, { filter: info => {
    safePath(info.name)
    if (metadata.has(info.name)) fail('压缩包包含重复文件')
    if (![0, 8].includes(info.compression) || info.compression === 0 && info.size !== info.originalSize) fail('压缩包文件大小或压缩方式无效')
    metadata.set(info.name, info)
    expanded += Math.max(info.size, info.originalSize); entries++
    if (!Number.isSafeInteger(expanded) || expanded > MAX_EXPANDED || entries > MAX_ENTRIES) fail('压缩包解压大小或文件数量超出限制')
    return false
  } })
  const output: Entries = Object.create(null)
  const discovered = new Set<string>()
  const stream = new Unzip(file => {
    safePath(file.name)
    const info = metadata.get(file.name)
    if (!info || discovered.has(file.name)) fail('压缩包包含重复文件或目录信息不一致')
    if (file.compression !== info.compression || file.size !== undefined && file.size !== info.size || file.originalSize !== undefined && file.originalSize !== info.originalSize) fail('压缩包文件大小信息不一致')
    discovered.add(file.name)
    const result = new Uint8Array(info.originalSize)
    let actual = 0
    file.ondata = (error, data, final) => {
      if (error) throw error
      actual += data.length
      if (actual > info.originalSize) fail('压缩包解压长度与声明大小不一致')
      result.set(data, actual - data.length)
      if (final) {
        if (actual !== info.originalSize) fail('压缩包解压长度与声明大小不一致')
        output[file.name] = result
      }
    }
    file.start()
  })
  stream.register(UnzipInflate)
  // Small compressed chunks keep malformed DEFLATE streams from allocating their entire output at once.
  for (let offset = 0; offset < bytes.length; offset += 16384) stream.push(bytes.subarray(offset, offset + 16384), offset + 16384 >= bytes.length)
  if (Object.keys(output).length !== metadata.size) fail('压缩包文件没有完整解压')
  return output
}
function boundedMpeg(bytes: Uint8Array) {
  let offset = 0
  if (String.fromCharCode(...bytes.subarray(0, 3)) === 'ID3') {
    if (bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4 || bytes.subarray(6, 10).some(b => b > 127)) return false
    const size = bytes.subarray(6, 10).reduce((total, b) => total * 128 + b, 0)
    offset = 10 + size + (bytes[3] === 4 && (bytes[5] & 0x10) ? 10 : 0)
  }
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return false
  const version = (bytes[offset + 1] >> 3) & 3, layer = (bytes[offset + 1] >> 1) & 3
  const bitrateIndex = bytes[offset + 2] >> 4, sampleIndex = (bytes[offset + 2] >> 2) & 3
  if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3 || (bytes[offset + 3] & 3) === 2) return false
  const rates = version === 3 ? layer === 3 ? [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]
    : layer === 2 ? [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]
      : [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : layer === 3 ? [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256]
      : [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  const rate = rates[bitrateIndex - 1] * 1000
  const sampleRate = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4)
  const padding = (bytes[offset + 2] >> 1) & 1
  const length = layer === 3 ? (Math.floor(12 * rate / sampleRate) + padding) * 4
    : Math.floor((layer === 1 && version !== 3 ? 72 : 144) * rate / sampleRate) + padding
  return length > 4 && offset + length <= bytes.length
}
function boundedWav(bytes: Uint8Array) {
  if (bytes.length < 12) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = view.getUint32(4, true) + 8
  if (end > bytes.length || end < 12) return false
  let hasFormat = false, dataSize = 0, alignment = 0
  for (let offset = 12; offset + 8 <= end;) {
    const name = String.fromCharCode(...bytes.subarray(offset, offset + 4)), size = view.getUint32(offset + 4, true)
    const payload = offset + 8, next = payload + size + (size & 1)
    if (next > end) return false
    if (name === 'fmt ') {
      if (size < 16 || ![1, 3, 0xfffe].includes(view.getUint16(payload, true)) || !view.getUint16(payload + 2, true) || !view.getUint32(payload + 4, true)) return false
      alignment = view.getUint16(payload + 12, true); hasFormat = alignment > 0 && view.getUint16(payload + 14, true) > 0
    }
    if (name === 'data') dataSize += size
    offset = next
  }
  return hasFormat && dataSize >= alignment && dataSize % alignment === 0
}
function boundedOgg(bytes: Uint8Array) {
  const packets: { prefix: number[]; length: number }[] = []
  let packet = { prefix: [] as number[], length: 0 }, offset = 0
  while (offset < bytes.length) {
    if (offset + 27 > bytes.length || String.fromCharCode(...bytes.subarray(offset, offset + 4)) !== 'OggS' || bytes[offset + 4] !== 0) return false
    const body = offset + 27 + bytes[offset + 26]
    if (body > bytes.length || !!(bytes[offset + 5] & 1) !== (packet.length > 0)) return false
    const segments = bytes.subarray(offset + 27, body)
    let cursor = body
    for (const length of segments) {
      if (cursor + length > bytes.length) return false
      const prefixLength = Math.min(length, 32 - packet.prefix.length)
      packet.prefix.push(...bytes.subarray(cursor, cursor + prefixLength)); packet.length += length; cursor += length
      if (length < 255) {
        if (packets.length < 4) packets.push(packet)
        packet = { prefix: [], length: 0 }
      }
    }
    offset = cursor
  }
  if (packet.length || packets.length < 3) return false
  const header = packets[0], codec = String.fromCharCode(...header.prefix.slice(0, 8))
  if (codec === 'OpusHead') return header.length >= 19 && header.prefix[8] === 1 && header.prefix[9] > 0 &&
    packets[1].length >= 16 && String.fromCharCode(...packets[1].prefix.slice(0, 8)) === 'OpusTags' && packets[2].length > 0
  if (codec.slice(0, 7) === '\x01vorbis') {
    const view = new DataView(Uint8Array.from(header.prefix).buffer)
    return packets.length >= 4 && header.length >= 30 && !!header.prefix[11] && !!(header.prefix[29] & 1) && view.getUint32(7, true) === 0 && view.getUint32(12, true) > 0 &&
      String.fromCharCode(...packets[1].prefix.slice(0, 7)) === '\x03vorbis' && String.fromCharCode(...packets[2].prefix.slice(0, 7)) === '\x05vorbis' && packets[3].length > 0 && !(packets[3].prefix[0] & 1)
  }
  return false
}
function audioType(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  const type = boundedMpeg(bytes) ? 'audio/mpeg'
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE' && boundedWav(bytes) ? 'audio/wav'
      : ascii(0, 4) === 'OggS' && boundedOgg(bytes) ? 'audio/ogg' : ''
  if (!type) fail('音频文件不是有效的 MP3、WAV 或 OGG')
  return type
}
function audioBlob(bytes: Uint8Array) { return new Blob([Uint8Array.from(bytes)], { type: audioType(bytes) }) }
function mediaReader(options: ArchiveOptions) {
  const budget = Math.min(MAX_EXPANDED, options.maxReferencedMediaBytes ?? MAX_EXPANDED)
  if (!Number.isFinite(budget) || budget < 0) fail('音频引用大小限制无效')
  const cache = new WeakMap<Uint8Array, { type: string; blob?: Blob; hash?: Promise<string> }>()
  let referenced = 0
  const validated = (bytes: Uint8Array) => {
    let entry = cache.get(bytes)
    if (!entry) { entry = { type: audioType(bytes) }; cache.set(bytes, entry) }
    return entry
  }
  return {
    validate: (bytes: Uint8Array) => { validated(bytes) },
    blob: (bytes: Uint8Array) => {
      referenced += bytes.length
      if (referenced > budget) fail('累计引用音频超过 250 MiB；请减少词条或拆分文件')
      const entry = validated(bytes)
      return entry.blob ??= new Blob([Uint8Array.from(bytes)], { type: entry.type })
    },
    hash: (bytes: Uint8Array) => {
      const entry = validated(bytes)
      return entry.hash ??= crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)).then(digest => Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').slice(0, 24))
    },
  }
}
type MediaReader = ReturnType<typeof mediaReader>
function knownIndex(cards: IELTSCard[]) {
  const index = new Map<string, IELTSCard[]>()
  for (const card of cards) {
    const key = normalizeWord(card.word)
    const list = index.get(key) ?? []; list.push(card); index.set(key, list)
  }
  return index
}
function knownWord(index: Map<string, IELTSCard[]>, word: string, sourceBook?: string) {
  const matches = index.get(normalizeWord(word)) ?? []
  return matches.find(c => c.sourceBook === sourceBook && c.chineseAudio) ?? matches.find(c => c.sourceBook === sourceBook) ?? matches.find(c => c.chineseAudio) ?? matches[0]
}
function withChinese(input: PersonalWordInput, index: Map<string, IELTSCard[]>) {
  const known = knownWord(index, input.word, input.sourceBook)
  const suppliedChinese = normalizeWord(input.chinese ?? '')
  const knownChinese = normalizeWord(known?.chinese ?? '')
  // Anki definitions may append the learner's pronunciation notes after the standard translation.
  const suffix = suppliedChinese.startsWith(`${knownChinese} `) ? suppliedChinese.slice(knownChinese.length).trim() : ''
  const pronunciationNote = /[a-z]/i.test(suffix) && /^(?:[a-z]|老是和|容易和|和|当时和|只有|为\s)/i.test(suffix)
  const matchesChinese = !suppliedChinese || !knownChinese || suppliedChinese === knownChinese || pronunciationNote
  return validatePersonalInput({ ...input, chinese: input.chinese || known?.chinese,
    chineseAudio: input.chineseAudio || (!input.chineseAudioData && matchesChinese ? known?.chineseAudio : undefined) })
}
function portableWords(value: unknown, entries: Entries | undefined, index: Map<string, IELTSCard[]>, media: MediaReader) {
  const document = object(value)
  if (document.format !== FORMAT || document.version !== 1 || !Array.isArray(document.words) || !document.words.length || document.words.length > MAX_WORDS) fail('不支持的词库格式或词条数量')
  return document.words.map(raw => {
    const item = object(raw)
    // Explicit metadata allowlist prevents account, scheduling and arbitrary fields from entering storage.
    const input = { word: item.word, chinese: item.chinese, answers: item.answers, audio: item.audio,
      chineseAudio: item.chineseAudio, groupLabel: item.groupLabel, sourceBook: item.sourceBook,
      sourceLabel: item.sourceLabel, sources: item.sources } as PersonalWordInput
    for (const [field, dataField] of [['audio', 'audioData'], ['chineseAudio', 'chineseAudioData']] as const) {
      const path = item[field]
      if (typeof path === 'string' && path.startsWith('media/')) {
        safePath(path)
        if (!entries?.[path]) fail('词库引用的音频文件缺失')
        input[dataField] = media.blob(entries[path])
        if (field === 'audio') input.audio = ''
        else input.chineseAudio = undefined
      } else if (path !== undefined && (typeof path !== 'string' || (path && !isPublicAudio(path)))) fail('词库音频地址无效')
    }
    return withChinese(input, index)
  })
}
interface AnkiModel { flds: { name: string; ord?: number }[] }
async function ankiWords(entries: Entries, filename: string, index: Map<string, IELTSCard[]>, options: ArchiveOptions, mediaCache: MediaReader) {
  if (entries['collection.anki21b']) fail('暂不支持现代 collection.anki21b；请在 Anki 中导出兼容旧版的 APKG')
  const collection = entries['collection.anki21'] ?? entries['collection.anki2']
  if (!collection || !entries.media) fail('APKG 缺少词库或媒体索引')
  const media = object(json(entries.media))
  const mediaByName = new Map<string, Uint8Array>()
  for (const [entry, name] of Object.entries(media)) {
    safePath(entry)
    if (typeof name !== 'string') fail('APKG 媒体索引无效')
    safePath(name)
    if (entries[entry]) mediaByName.set(name, entries[entry])
  }
  const SQL = await initSqlJs(options.wasmBinary ? { wasmBinary: options.wasmBinary.slice().buffer } : { locateFile: () => wasmUrl })
  const db = new SQL.Database(collection)
  try {
    const metadata = db.exec('SELECT models, decks FROM col LIMIT 1')[0]?.values[0]
    if (!metadata || typeof metadata[0] !== 'string' || typeof metadata[1] !== 'string') fail('不支持的 APKG 数据表结构')
    const models = object(JSON.parse(metadata[0]))
    const decks = object(JSON.parse(metadata[1]))
    const rows = db.exec(`SELECT n.mid, n.flds, (SELECT MIN(c.did) FROM cards c WHERE c.nid = n.id) FROM notes n ORDER BY n.id LIMIT ${MAX_WORDS + 1}`)[0]?.values ?? []
    if (!rows.length || rows.length > MAX_WORDS) fail('APKG 词条数量超出限制或词库为空')
    const words: PersonalWordInput[] = []
    for (const row of rows) {
      const model = object(models[String(row[0])]) as unknown as AnkiModel
      if (!Array.isArray(model.flds) || model.flds.length > 100 || typeof row[1] !== 'string') fail('APKG 字段结构无效')
      const fields = row[1].split('\x1f')
      const get = (names: string[]) => {
        const position = model.flds.findIndex(f => typeof f.name === 'string' && names.includes(f.name.trim().toLowerCase()))
        return position < 0 ? '' : fields[model.flds[position].ord ?? position] ?? ''
      }
      const originalWord = cleanVocabularyText(get(['word', 'english', '单词', '英文']))
      const audioField = get(['audio', 'sound', '音频'])
      const mediaName = /\[sound:([^\]]+)\]/i.exec(audioField)?.[1]
      if (!originalWord || !mediaName || !mediaByName.has(mediaName)) fail('APKG 缺少英文单词或音频')
      const bytes = mediaByName.get(mediaName)!
      mediaCache.validate(bytes)
      const source = cleanVocabularyText(get(['source', '来源']))
      const deck = decks[String(row[2])]
      const deckName = deck && typeof object(deck).name === 'string' ? cleanVocabularyText(object(deck).name as string) : ''
      const unit = /\bunit\s*(\d{1,3})\b/i.exec(source)?.[1] ?? /\bunit\s*(\d{1,3})\b/i.exec(deckName)?.[1]
      const known = knownWord(index, originalWord, unit ? 'frequency' : undefined)
      const sourceBook = unit ? 'frequency' : known?.sourceBook ?? 'network'
      const groupLabel = unit ? `雅思高频 · Unit ${Number(unit)}` : (source || deckName || cleanVocabularyText(filename.replace(/\.[^.]+$/, ''))).slice(0, 300)
      const hash = await mediaCache.hash(bytes)
      const matchedAudio = (index.get(normalizeWord(originalWord)) ?? []).find(c => isPublicAudio(c.audio) && new URL(c.audio, 'https://www.listening.website').pathname.split('/').at(-1)?.split('.')[0] === hash)
      words.push(withChinese({ word: known?.word ?? originalWord, chinese: cleanVocabularyText(get(['definition', 'chinese', '中文', '释义'])) || known?.chinese,
        answers: known?.answers?.length ? known.answers : [originalWord], audio: matchedAudio?.audio ?? '', audioData: matchedAudio ? undefined : mediaCache.blob(bytes),
        sourceBook, sourceLabel: groupLabel, groupLabel, sources: source ? [source] : [] }, index))
    }
    return words
  } finally { db.close() }
}

/** Parse and validate the complete batch before the caller opens a storage transaction. */
export async function parseVocabularyArchive(bytes: Uint8Array, filename: string, knownCards: IELTSCard[], options: ArchiveOptions = {}) {
  if (!bytes.length || bytes.length > MAX_INPUT) fail('文件为空或超过 100 MiB')
  const index = knownIndex(knownCards)
  const media = mediaReader(options)
  const extension = filename.split('.').at(-1)?.toLowerCase()
  let words: PersonalWordInput[]
  if (extension === 'json') words = portableWords(json(bytes), undefined, index, media)
  else if (extension === 'zip' || extension === 'apkg') {
    const entries = unpack(bytes)
    if (extension === 'apkg') words = await ankiWords(entries, filename, index, options, media)
    else {
      if (!entries['vocabulary.json']) fail('ZIP 缺少 vocabulary.json')
      words = portableWords(json(entries['vocabulary.json']), entries, index, media)
    }
  } else return fail('请选择 APKG、JSON 或 ZIP 文件')
  return { words, missingChinese: words.filter(w => !w.chineseAudio && !w.chineseAudioData).length }
}

function record(input: PersonalWordInput) {
  const word = validatePersonalInput(input)
  return { word: word.word, chinese: word.chinese, answers: word.answers, audio: word.audio, chineseAudio: word.chineseAudio,
    groupLabel: word.groupLabel, sourceBook: word.sourceBook, sourceLabel: word.sourceLabel, sources: word.sources }
}
function document(words: ReturnType<typeof record>[]) { return JSON.stringify({ format: FORMAT, version: 1, words }, null, 2) }
export function exportVocabularyJSON<T extends PersonalWordInput>(words: readonly T[]) {
  if (!words.length || words.length > MAX_WORDS) throw new Error('导出词条数量无效')
  if (words.some(w => w.audioData || w.chineseAudioData)) throw new Error('包含本地音频，请使用 ZIP 导出。')
  return document(words.map(record))
}
export function exportVocabularyCSV<T extends PersonalWordInput>(words: readonly T[]) {
  if (words.some(w => w.audioData || w.chineseAudioData)) throw new Error('包含本地音频，请使用 ZIP 导出。')
  const cell = (value: string) => {
    const firstVisible = Array.from(value).findIndex(char => char.charCodeAt(0) > 32)
    const significant = firstVisible < 0 ? '' : value.slice(firstVisible).trimStart()
    return `"${(/^[=+@-]/.test(significant) ? "'" + value : value).replace(/"/g, '""')}"`
  }
  return '\uFEFF' + [['word', 'chinese', 'answers', 'audio', 'chineseAudio', 'groupLabel', 'sourceBook', 'sourceLabel', 'sources'],
    ...words.map(input => { const w = record(input); return [w.word, w.chinese ?? '', w.answers.join(' | '), w.audio, w.chineseAudio ?? '', w.groupLabel, w.sourceBook, w.sourceLabel, (w.sources ?? []).join(' | ')] })]
    .map(row => row.map(cell).join(',')).join('\r\n')
}
export async function exportVocabularyZip<T extends PersonalWordInput>(words: readonly T[]) {
  if (!words.length || words.length > MAX_WORDS) throw new Error('导出词条数量无效')
  const entries: Entries = Object.create(null)
  let expanded = 0
  const records = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i], portable = record(w)
    for (const [field, blob] of [['audio', w.audioData], ['chineseAudio', w.chineseAudioData]] as const) {
      if (!blob) continue
      expanded += blob.size
      if (expanded > MAX_EXPANDED) throw new Error('导出音频超过 250 MiB')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const validated = audioBlob(bytes)
      const extension = validated.type === 'audio/mpeg' ? 'mp3' : validated.type === 'audio/wav' ? 'wav' : 'ogg'
      const path = `media/${i}-${field}.${extension}`
      entries[path] = bytes; portable[field] = path
    }
    records.push(portable)
  }
  entries['vocabulary.json'] = strToU8(document(records))
  const zip = zipSync(entries, { level: 0 })
  if (zip.length > MAX_INPUT) throw new Error('导出文件超过 100 MiB，请分批导出')
  return zip
}
