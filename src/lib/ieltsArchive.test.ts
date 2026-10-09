/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import initSqlJs from 'sql.js'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { expect, it } from 'vitest'
import { exportVocabularyCSV, exportVocabularyJSON, exportVocabularyZip, parseVocabularyArchive } from './ieltsArchive'
import type { IELTSCard } from './ieltsDictation'

function pcmWav() {
  const bytes = new Uint8Array(46), view = new DataView(bytes.buffer)
  bytes.set(strToU8('RIFF')); view.setUint32(4, 38, true); bytes.set(strToU8('WAVEfmt '), 8)
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  bytes.set(strToU8('data'), 36); view.setUint32(40, 2, true)
  return bytes
}
const recording = pcmWav()
const options = { wasmBinary: new Uint8Array(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')) }
const word = { word: 'library', chinese: '图书馆', answers: ['library', 'libraries'], audio: '/data/audio/ielts/a.mp3', chineseAudio: '/data/audio/ielts-zh/z.mp3', sourceBook: 'frequency' as const, sourceLabel: '雅思高频 · Unit 1', groupLabel: '雅思高频 · Unit 1', sources: ['原始来源'] }
async function apkg(audio = recording, filename = 'voice.wav') {
  const SQL = await initSqlJs({ wasmBinary: options.wasmBinary.slice().buffer })
  const db = new SQL.Database()
  db.run('CREATE TABLE col(models TEXT,decks TEXT); CREATE TABLE notes(id INTEGER,mid INTEGER,flds TEXT); CREATE TABLE cards(nid INTEGER,did INTEGER)')
  // Ordinal metadata, rather than object order, identifies the note fields.
  db.run('INSERT INTO col VALUES (?,?)', [JSON.stringify({ 1: { flds: [{ name: 'Source', ord: 3 }, { name: 'Word', ord: 1 }, { name: 'ReviewSnapshot', ord: 4 }, { name: 'Audio', ord: 0 }, { name: 'Definition', ord: 2 }] } }), JSON.stringify({ 2: { name: 'Practice::Unit1' } })])
  db.run('INSERT INTO notes VALUES (1,1,?)', [`[sound:${filename}]\x1f<b>library</b>\x1f图书馆\x1fUnit1\x1fprivate review history`])
  db.run('INSERT INTO cards VALUES (1,2)')
  const data = db.export(); db.close()
  return zipSync({ 'collection.anki2': data, media: strToU8(JSON.stringify({ 0: filename })), 0: audio })
}
it('round trips public JSON and strips account and review metadata', async () => {
  const json = exportVocabularyJSON([{ ...word, owner: 'secret', key: 'private', id: 'id', addedAt: 5, ReviewSnapshot: 'history' }])
  expect(json).not.toMatch(/secret|private|history|addedAt|ReviewSnapshot/)
  expect((await parseVocabularyArchive(strToU8(json), 'words.json', [])).words).toMatchObject([word])
})
it('requires ZIP for local recordings and round trips their bytes', async () => {
  const input = { ...word, audio: '', audioData: new Blob([Uint8Array.from(recording)], { type: 'audio/wav' }), chineseAudio: undefined, chineseAudioData: new Blob([Uint8Array.from(recording)], { type: 'audio/wav' }) }
  expect(() => exportVocabularyJSON([input])).toThrow(/ZIP/i)
  expect(() => exportVocabularyCSV([input])).toThrow(/ZIP/i)
  const bytes = await exportVocabularyZip([input])
  const entries = unzipSync(bytes)
  expect(Object.keys(entries)).toContain('vocabulary.json')
  expect(new TextDecoder().decode(entries['vocabulary.json'])).not.toContain('blob:')
  const restored = (await parseVocabularyArchive(bytes, 'words.zip', [])).words[0]
  expect(new Uint8Array(await restored.audioData!.arrayBuffer())).toEqual(recording)
  expect(new Uint8Array(await restored.chineseAudioData!.arrayBuffer())).toEqual(recording)
})
it('escapes CSV quotes and spreadsheet formulas', () => {
  const csv = exportVocabularyCSV([{ ...word, word: '=HYPERLINK("evil")', chinese: '+danger, quote"' }])
  expect(csv).toContain('"\'=HYPERLINK(""evil"")"')
  expect(csv).toContain('"\'+danger, quote"""')
  expect(csv).toContain('"audio","chineseAudio"')
  expect(csv).toContain(word.audio)
  expect(csv).toContain(word.chineseAudio)
})
it('rejects unsupported schema, executable URLs, traversal and modern Anki archives', async () => {
  await expect(parseVocabularyArchive(strToU8('{"words":[]}'), 'x.json', [])).rejects.toThrow()
  await expect(parseVocabularyArchive(strToU8(JSON.stringify({ format: 'ielts-vocabulary', version: 1, words: [{ ...word, audio: 'javascript:alert(1)' }] })), 'x.json', [])).rejects.toThrow()
  await expect(parseVocabularyArchive(zipSync({ '../vocabulary.json': strToU8('x') }), 'x.zip', [])).rejects.toThrow(/路径/)
  await expect(parseVocabularyArchive(zipSync({ 'collection.anki21b': recording }), 'x.apkg', [])).rejects.toThrow(/anki21b/)
})
it('maps field names, ignores review history and retains an unmatched recording', async () => {
  const result = await parseVocabularyArchive(await apkg(), 'x.apkg', [], options)
  expect(result.words).toMatchObject([{ word: 'library', chinese: '图书馆', groupLabel: '雅思高频 · Unit 1', sourceBook: 'frequency', audio: '' }])
  expect(result.words[0].audioData).toBeInstanceOf(Blob)
  expect(JSON.stringify(result.words)).not.toContain('private review')
})
it('reuses English audio only when its content hash agrees and matches Chinese by word', async () => {
  const hash = createHash('sha256').update(recording).digest('hex').slice(0, 24)
  const known: IELTSCard = { ...word, id: 'f', chapter: 1, section: '1', audio: `/data/audio/ielts/${hash}.wav` }
  const match = (await parseVocabularyArchive(await apkg(), 'x.apkg', [known], options)).words[0]
  expect(match.audio).toBe(known.audio); expect(match.audioData).toBeUndefined()
  expect(match.answers).toEqual(word.answers); expect(match.chineseAudio).toBe(word.chineseAudio)
  const differentVoice = pcmWav(); differentVoice[44] = 1
  const other = (await parseVocabularyArchive(await apkg(differentVoice), 'x.apkg', [known], options)).words[0]
  expect(other.audio).toBe(''); expect(other.audioData).toBeInstanceOf(Blob)
  expect(other.chineseAudio).toBe(word.chineseAudio)
})
it('rejects HTML disguised as MP3 before any caller writes the batch', async () => {
  await expect(parseVocabularyArchive(await apkg(strToU8('<script>evil()</script>')), 'x.apkg', [], options)).rejects.toThrow(/音频/)
})
it('recognizes a bounded WAV containing PCM sample data', async () => {
  const result = await parseVocabularyArchive(await apkg(recording), 'x.apkg', [], options)
  expect(result.words[0].audioData?.type).toBe('audio/wav')
})
it('rejects forged ID3, truncated MPEG frames and empty WAV/OGG headers', async () => {
  const fakeID3 = strToU8('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000<script>evil()</script>')
  const oversizedTag = fakeID3.slice(); oversizedTag[6] = 0x7f
  const wav = new Uint8Array(44); wav.set(strToU8('RIFF')); wav.set(strToU8('WAVE'), 8)
  const ogg = new Uint8Array(27); ogg.set(strToU8('OggS'))
  for (const bytes of [fakeID3, oversizedTag, new Uint8Array([0xff, 0xfb, 0x90, 0x64]), wav, ogg]) {
    await expect(parseVocabularyArchive(await apkg(bytes), 'x.apkg', [], options)).rejects.toThrow(/音频/)
  }
})
it('reads classic collection.anki21 archives as well', async () => {
  const entries = unzipSync(await apkg())
  entries['collection.anki21'] = entries['collection.anki2']; delete entries['collection.anki2']
  expect((await parseVocabularyArchive(zipSync(entries), 'x.apkg', [], options)).words).toHaveLength(1)
})
it('rejects an expanded ZIP size bomb from metadata before inflation', async () => {
  const archive = zipSync({ 'vocabulary.json': strToU8('{}') })
  const view = new DataView(archive.buffer)
  let central = 0
  while (view.getUint32(central, true) !== 0x02014b50) central++
  view.setUint32(central + 24, 251 * 1024 * 1024, true)
  await expect(parseVocabularyArchive(archive, 'x.zip', [])).rejects.toThrow(/解压大小/)
})
it('rejects false stored and deflated ZIP sizes and duplicate central-directory aliases', async () => {
  for (const level of [0, 6] as const) {
    const archive = zipSync({ 'vocabulary.json': strToU8(exportVocabularyJSON([word])) }, { level })
    const view = new DataView(archive.buffer)
    let central = 0
    while (view.getUint32(central, true) !== 0x02014b50) central++
    view.setUint32(central + 24, 0, true)
    if (level === 6) view.setUint32(22, 0, true)
    await expect(parseVocabularyArchive(archive, 'x.zip', [])).rejects.toThrow(/大小|长度/)
  }
  const archive = zipSync({ a: strToU8('same'), b: strToU8('same') }, { level: 0 })
  const view = new DataView(archive.buffer)
  let central = 0
  while (view.getUint32(central, true) !== 0x02014b50) central++
  const second = central + 46 + view.getUint16(central + 28, true)
  archive[second + 46] = 'a'.charCodeAt(0)
  await expect(parseVocabularyArchive(archive, 'x.zip', [])).rejects.toThrow(/重复/)
})
it('shares media Blobs but rejects a cumulative referenced-media budget overflow', async () => {
  const rows = [1, 2, 3].map(i => ({ ...word, word: `word ${i}`, audio: 'media/shared.wav', chineseAudio: undefined }))
  const zip = (words: typeof rows) => zipSync({ 'vocabulary.json': strToU8(JSON.stringify({ format: 'ielts-vocabulary', version: 1, words })), 'media/shared.wav': recording })
  const budget = { maxReferencedMediaBytes: recording.length * 2 }
  const parsed = await parseVocabularyArchive(zip(rows.slice(0, 2)), 'x.zip', [], budget)
  expect(parsed.words[0].audioData).toBe(parsed.words[1].audioData)
  await expect(parseVocabularyArchive(zip(rows), 'x.zip', [], budget)).rejects.toThrow(/引用音频/)
})
it('requires audio packets after OGG codec and tags, rejecting header-only files', async () => {
  const head = new Uint8Array(19); head.set(strToU8('OpusHead')); head[8] = 1; head[9] = 1
  const tags = new Uint8Array(16); tags.set(strToU8('OpusTags'))
  const page = (packet: Uint8Array, sequence: number) => {
    const bytes = new Uint8Array(28 + packet.length)
    bytes.set(strToU8('OggS')); bytes[5] = sequence === 2 ? 4 : sequence ? 0 : 2; bytes[26] = 1; bytes[27] = packet.length
    const view = new DataView(bytes.buffer)
    view.setUint32(14, 1, true); view.setUint32(18, sequence, true)
    if (sequence === 2) view.setUint32(6, 960, true)
    bytes.set(packet, 28)
    let checksum = 0
    for (const byte of bytes) {
      checksum ^= byte << 24
      for (let bit = 0; bit < 8; bit++) checksum = checksum & 0x80000000 ? (checksum << 1) ^ 0x04c11db7 : checksum << 1
    }
    view.setUint32(22, checksum >>> 0, true)
    return bytes
  }
  await expect(parseVocabularyArchive(await apkg(page(head, 0)), 'x.apkg', [], options)).rejects.toThrow(/音频/)
  const pages = [page(head, 0), page(tags, 1), page(new Uint8Array([0xf8, 0xff, 0xfe]), 2)]
  const ogg = new Uint8Array(pages.reduce((sum, p) => sum + p.length, 0))
  let offset = 0; for (const bytes of pages) { ogg.set(bytes, offset); offset += bytes.length }
  expect((await parseVocabularyArchive(await apkg(ogg), 'x.apkg', [], options)).words[0].audioData?.type).toBe('audio/ogg')
})
it('does not attach a public Chinese clip to an explicitly different translation', async () => {
  const known: IELTSCard = { ...word, id: 'f', chapter: 1, section: '1' }
  const json = exportVocabularyJSON([{ ...word, chinese: '自定义含义', chineseAudio: undefined }])
  const result = await parseVocabularyArchive(strToU8(json), 'x.json', [known])
  expect(result.words[0].chineseAudio).toBeUndefined()
  expect(result.missingChinese).toBe(1)
  const prefixed = exportVocabularyJSON([{ ...word, chinese: '图书馆 管理员', chineseAudio: undefined }])
  expect((await parseVocabularyArchive(strToU8(prefixed), 'x.json', [known])).missingChinese).toBe(1)
})
const realArchive = 'D:/桌面/Project/Self/English Saying/deliverables/近14天易错词_2026-10-07/雅思听力高频语料库_近14天易错词_540词_2026-10-07.apkg'
it.skipIf(!existsSync(realArchive))('imports the real 540-word APKG with seven groups and all Chinese recordings', async () => {
  const known = JSON.parse(readFileSync('public/data/ielts-chinese-audio-v1.json', 'utf8')).cards as IELTSCard[]
  const result = await parseVocabularyArchive(new Uint8Array(readFileSync(realArchive)), 'recent.apkg', known, options)
  expect(result.words).toHaveLength(540)
  expect(new Set(result.words.map(w => w.groupLabel)).size).toBe(7)
  expect(result.missingChinese).toBe(0)
  expect(result.words.every(w => w.audio && !w.audioData && w.chineseAudio && w.sourceBook === 'frequency')).toBe(true)
}, 30000)
