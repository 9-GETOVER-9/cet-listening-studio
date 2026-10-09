import { db } from '@/db/schema'
import { checkSpelling, type IELTSCard, type IELTSCorpus } from './ieltsDictation'
import { frequencyDB, readFrequencyProgress, saveFrequencyOutcome, type FrequencyReason } from './ieltsFrequencyProgress'
import { scheduleFSRSState } from './fsrsScheduler'
import { Rating, type LevelType, type NotebookItem } from '@/types'

export type PracticeSource = 'wanglu' | 'frequency' | 'notebook'
export type PracticeMode = 'dictation' | 'meaning'
export type PracticeQueue = 'all' | 'mistakes' | 'due'
export interface PracticeWord {
  id: string; word: string; answers: string[]; meaning: string; source: PracticeSource; sourceLabel: string
  audio?: string; sentence?: string; sentenceAudio?: string; notebookId?: string; ieltsCard?: IELTSCard
  due?: number; wrong?: boolean; ipa?: string; partOfSpeech?: string; metadataSource?: string
  reason?: FrequencyReason
}
export interface PracticeOptions {
  source: PracticeSource; chapter: number | null; section: string; queue: PracticeQueue; mode: PracticeMode
  level?: LevelType; limit: number | null; targetId: string
}
export interface PracticeResult { id: string; answer: string; firstCorrect: boolean; finalCorrect: boolean; confirmedAt: number }
export interface PracticeSession {
  owner: string; context: string; sessionId: string; queue: PracticeWord[]; mode: PracticeMode
  position: number; draft: string; firstVerdict: boolean | null; verdict: boolean | null; results: PracticeResult[]
  finished: boolean; elapsed: number; updatedAt: number
}
export interface PracticeSettings { repeats: number; speed: number; muted: boolean; voice: string; autoNext: number; dailyTarget: number; completed: number; date: string }
export const defaultPracticeSettings: PracticeSettings = { repeats: 1, speed: 1, muted: false, voice: '', autoNext: 5, dailyTarget: 20, completed: 0, date: '' }
export function parsePracticeOptions(params: URLSearchParams): PracticeOptions {
  const source = params.get('source')
  const chapter = Number(params.get('chapter'))
  const limit = Number(params.get('limit'))
  const level = params.get('level')
  return { source: source === 'notebook' || source === 'frequency' ? source : 'wanglu',
    chapter: chapter > 0 && Number.isInteger(chapter) ? chapter : null, section: params.get('section') || 'all',
    queue: params.get('queue') === 'mistakes' || params.get('queue') === 'due' ? params.get('queue') as PracticeQueue : 'all',
    mode: params.get('mode') === 'meaning' ? 'meaning' : 'dictation', level: level === 'CET4' || level === 'CET6' || level === 'NCE' ? level : undefined,
    limit: limit > 0 && Number.isInteger(limit) ? Math.min(limit, 10000) : null, targetId: params.get('targetId') || '' }
}
export function practiceContext(options: PracticeOptions): string { return JSON.stringify(options) }
export function practiceSourceUrl(options: PracticeOptions): string {
  if (options.source === 'notebook') return '/notebook?tab=vocabulary'
  const params = new URLSearchParams({ source: options.source })
  if (options.chapter) params.set('chapter', String(options.chapter))
  params.set('section', options.section)
  params.set('limit', options.limit === null ? 'all' : String(options.limit))
  return `/ielts/listening?${params}`
}
export function selectPracticeQueue(words: PracticeWord[], queue: PracticeQueue, now = Date.now()): PracticeWord[] {
  return words.filter(word => queue === 'all' || (queue === 'mistakes' ? word.wrong : word.due !== undefined && word.due <= now))
}
export interface PracticeMetadata { source: string; words: Record<string, { meaning: string; ipa?: string; partOfSpeech?: string }> }
export function enrichPracticeWords(words: PracticeWord[], metadata: PracticeMetadata): PracticeWord[] {
  return words.map(word => {
    const entry = metadata.words[word.word.normalize('NFKC').trim().toLowerCase()]
    if (!entry) return word
    return { ...word, meaning: word.meaning || entry.meaning, ipa: word.ipa || entry.ipa, partOfSpeech: word.partOfSpeech || entry.partOfSpeech, metadataSource: metadata.source }
  })
}
export async function loadPracticeWords(owner: string, options: PracticeOptions, signal?: AbortSignal): Promise<PracticeWord[]> {
  let words: PracticeWord[]
  if (options.source === 'notebook') {
    const items = await db.notebook.where('type').equals('vocabulary').toArray()
    const cards = await db.cards.bulkGet(items.map(item => item.sourceCardId))
    const pendingIds = new Set(((await db.settings.get(`word-practice:notebook-mistakes:${owner}`))?.value || []) as string[])
    words = items.flatMap((item, index) => {
      const card = cards[index]
      if (options.level && card?.level !== options.level) return []
      const phraseMeaning = card?.aiAnalysis.phrases.find(p => p.phrase.toLowerCase() === item.content.toLowerCase())?.meaning
      // Saved vocabulary is plain word text; only real source metadata supplies meaning.
      return [{ id: item.notebookId, notebookId: item.notebookId, word: item.content, answers: [item.content], meaning: phraseMeaning || '',
        source: 'notebook' as const, sourceLabel: `${card?.level || item.sourceTag} · 词汇难点本`, sentence: item.exampleSentence || card?.englishText,
        sentenceAudio: card?.audioFile ? `/data/audio/${card.audioFile}` : undefined,
        due: new Date(item.fsrsNotebook.due).getTime(), wrong: pendingIds.has(item.notebookId) }]
    })
  } else {
    const response = await fetch(options.source === 'frequency' ? '/data/ielts-high-frequency-v1.json' : '/data/ielts-corpus-v1.json', { signal, cache: 'no-cache' })
    if (!response.ok) throw new Error('语料加载失败，请重试。')
    const corpus = await response.json() as IELTSCorpus
    if (!Array.isArray(corpus.cards) || !corpus.cards.length) throw new Error('语料数据不完整。')
    const progress = new Map((options.source === 'frequency' ? await readFrequencyProgress(owner) : []).map(p => [p.cardId, p]))
    words = corpus.cards.filter(card => (!options.chapter || card.chapter === options.chapter) && (options.section === 'all' || card.section === options.section)).map(card => ({
      id: card.id, word: card.word, answers: card.answers, meaning: card.chinese || '', audio: card.audio,
      source: options.source, sourceLabel: `${options.source === 'frequency' ? '雅思高频' : '王陆语料库'} · ${card.chapter} / ${card.section}`, ieltsCard: card,
      wrong: progress.get(card.id)?.passed === false,
      reason: progress.get(card.id)?.reason,
    }))
    if (options.source === 'wanglu') {
      const previous = await db.settings.get(`word-practice:mistakes:${owner}`)
      const ids = new Set((previous?.value || []) as string[])
      words = words.map(word => ({ ...word, wrong: ids.has(word.id) }))
    }
  }
  try {
    const response = await fetch('/data/word-practice-metadata-v1.json', { signal })
    if (response.ok) {
      const metadata = await response.json() as PracticeMetadata & { version: string }
      if (metadata.version === 'word-practice-metadata-v1' && metadata.words && metadata.source) words = enrichPracticeWords(words, metadata)
    }
  } catch { if (signal?.aborted) throw new Error('语料读取已取消。') }
  return words
}
export function createPracticeSession(owner: string, context: string, queue: PracticeWord[], mode: PracticeMode = 'dictation'): PracticeSession {
  return { owner, context, sessionId: crypto.randomUUID(), queue: structuredClone(queue), mode, position: 0, draft: '', firstVerdict: null, verdict: null,
    results: [], finished: false, elapsed: 0, updatedAt: Date.now() }
}
export type PracticeAction = { type: 'input'; value: string } | { type: 'check' | 'retry' | 'finish' } | { type: 'tick'; seconds: number }
export function practiceReducer(state: PracticeSession, action: PracticeAction): PracticeSession {
  if (state.finished) return state
  if (action.type === 'finish') return { ...state, finished: true, updatedAt: Date.now() }
  if (action.type === 'tick') return { ...state, elapsed: state.elapsed + action.seconds }
  if (action.type === 'input') return state.verdict === null ? { ...state, draft: action.value } : state
  if (action.type === 'retry') return state.verdict === false ? { ...state, verdict: null, draft: '' } : state
  const word = state.queue[state.position]
  if (!word || state.verdict !== null || !state.draft.trim()) return state
  const verdict = checkSpelling(state.draft, word.answers)
  return { ...state, verdict, firstVerdict: state.firstVerdict ?? verdict }
}
function sessionKey(owner: string, context: string) { return `word-practice:session:${owner}:${context}` }
export function practiceLocalDate(now = new Date()) { return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}` }
export async function readPracticeSession(owner: string, context: string): Promise<PracticeSession | null> {
  const canonical = await frequencyDB.practiceState.get([owner, sessionKey(owner, context)])
  const result = (canonical?.value || (await db.settings.get(sessionKey(owner, context)))?.value) as PracticeSession | undefined
  return result?.owner === owner && result.context === context ? result : null
}
export async function savePracticeSession(session: PracticeSession): Promise<void> {
  const key = sessionKey(session.owner, session.context)
  if (session.queue[0]?.source === 'frequency') await frequencyDB.practiceState.put({ owner: session.owner, key, value: session })
  else await db.settings.put({ key, value: session })
}
export type PracticeDailyProgress = Pick<PracticeSettings, 'date' | 'completed'>
export async function readPracticeDailyProgress(owner: string, now = new Date()): Promise<PracticeDailyProgress> {
  // Read each canonical receipt store outside transactions; preferences never own completion counts.
  const [local, frequency] = await Promise.all([
    db.settings.filter(row => row.key.startsWith(`word-practice:receipt:${owner}:`)).toArray(),
    frequencyDB.practiceState.where('owner').equals(owner).filter(row => row.key.startsWith(`word-practice:receipt:${owner}:`)).toArray(),
  ])
  const date = practiceLocalDate(now)
  const completed = [...local, ...frequency].filter(row => {
    const receipt = row.value as { confirmedAt: number; formal: boolean }
    return receipt.formal && practiceLocalDate(new Date(receipt.confirmedAt)) === date
  }).length
  return { date, completed }
}
export function mergePracticeDailyProgress(settings: PracticeSettings, progress: PracticeDailyProgress): PracticeSettings {
  return { ...settings, ...progress }
}
export async function readPracticeSettings(owner: string): Promise<PracticeSettings> {
  const [prefs, progress] = await Promise.all([db.settings.get(`word-practice:settings:${owner}`), readPracticeDailyProgress(owner)])
  const stored = prefs?.value as Partial<PracticeSettings> | undefined
  return mergePracticeDailyProgress({ ...defaultPracticeSettings, ...stored }, progress)
}
export async function savePracticeSettings(owner: string, settings: PracticeSettings): Promise<void> {
  const { repeats, speed, muted, voice, autoNext, dailyTarget } = settings
  await db.settings.put({ key: `word-practice:settings:${owner}`, value: { repeats, speed, muted, voice, autoNext, dailyTarget } })
}
export async function retryPracticeSave(owner: string, session: PracticeSession | null, settings: PracticeSettings): Promise<void> {
  if (session) await savePracticeSession(session)
  await savePracticeSettings(owner, settings)
}
export async function confirmPractice(session: PracticeSession, active = () => true): Promise<PracticeSession> {
  const word = session.queue[session.position]
  if (!word || session.finished || session.verdict !== true || session.firstVerdict === null) return session
  if (!active()) throw new Error('会话已切换，停止保存。')
  const confirmedAt = Date.now()
  const results = [...session.results, { id: word.id, answer: session.draft, firstCorrect: session.firstVerdict, finalCorrect: true, confirmedAt }]
  const next = { ...session, position: session.position + 1, results, draft: '', firstVerdict: null, verdict: null, finished: results.length === session.queue.length, updatedAt: confirmedAt }
  const receiptKey = `word-practice:receipt:${session.owner}:${session.sessionId}:${word.id}`
  const receipt = { confirmedAt, firstCorrect: session.firstVerdict, formal: session.mode === 'dictation' }
  if (word.source === 'frequency') {
    return await frequencyDB.transaction('rw', frequencyDB.progress, frequencyDB.receipts, frequencyDB.annotations, frequencyDB.practiceState, async () => {
      if (!active()) throw new Error('会话已切换，停止保存。')
      if (await frequencyDB.practiceState.get([session.owner, receiptKey])) {
        return (await frequencyDB.practiceState.get([session.owner, sessionKey(session.owner, session.context)]))?.value as PracticeSession || next
      }
      // The existing outcome API nests into this same database transaction. Any session or receipt
      // failure rolls back the official outcome too; there is no secondary-database grade write.
      if (session.mode === 'dictation') await saveFrequencyOutcome({ owner: session.owner, sessionId: session.sessionId, cardId: word.id, passed: session.firstVerdict!, reason: word.reason })
      await frequencyDB.practiceState.put({ owner: session.owner, key: receiptKey, value: receipt })
      await savePracticeSession(next)
      return next
    })
  }
  return await db.transaction('rw', db.settings, db.notebook, async () => {
    if (!active()) throw new Error('会话已切换，停止保存。')
    if (await db.settings.get(receiptKey)) return (await db.settings.get(sessionKey(session.owner, session.context)))?.value as PracticeSession || next
    if (word.source === 'notebook') {
      const item = await db.notebook.get(word.notebookId || word.id)
      if (!item) throw new Error('词汇已被删除，本题无法保存。')
      await db.notebook.update(item.notebookId, { fsrsNotebook: scheduleFSRSState(item.fsrsNotebook, session.firstVerdict ? Rating.Good : Rating.Again, new Date(confirmedAt)) })
      const mistakeKey = `word-practice:notebook-mistakes:${session.owner}`
      const pendingIds = new Set(((await db.settings.get(mistakeKey))?.value || []) as string[])
      if (session.firstVerdict) pendingIds.delete(item.notebookId); else pendingIds.add(item.notebookId)
      await db.settings.put({ key: mistakeKey, value: [...pendingIds] })
      if (session.owner !== 'guest') await db.settings.put({ key: `word-practice:sync:${session.owner}:${item.notebookId}`, value: {
        item: await db.notebook.get(item.notebookId), token: `${session.sessionId}:${session.position}`,
      } })
    }
    if (word.source === 'wanglu' && session.mode === 'dictation') {
      const key = `word-practice:mistakes:${session.owner}`
      const ids = new Set(((await db.settings.get(key))?.value || []) as string[])
      if (session.firstVerdict) ids.delete(word.id); else ids.add(word.id)
      await db.settings.put({ key, value: [...ids] })
    }
    await db.settings.put({ key: receiptKey, value: receipt })
    await savePracticeSession(next)
    return next
  })
}
export function practiceSummary(session: PracticeSession) {
  const answered = session.results.length
  const firstCorrect = session.results.filter(r => r.firstCorrect).length
  const finalCorrect = session.results.filter(r => r.finalCorrect).length
  return { answered, firstCorrect, finalCorrect, firstAccuracy: answered ? Math.round(firstCorrect / answered * 100) : null,
    finalAccuracy: answered ? Math.round(finalCorrect / answered * 100) : null }
}
const syncChains = new Map<string, Promise<void>>()
export async function processPracticeNotebookSync(owner: string, authenticatedOwner: () => Promise<string | null>, upload: (owner: string, item: NotebookItem) => Promise<void>, remove?: (owner: string, notebookId: string) => Promise<void>) {
  const run = (syncChains.get(owner) || Promise.resolve()).catch(() => {}).then(async () => {
    if (owner === 'guest' || await authenticatedOwner() !== owner) return
    const jobs = await db.settings.filter(row => row.key.startsWith(`word-practice:sync:${owner}:`)).toArray()
    for (const job of jobs) {
      // A pending confirmation marks work, not the authoritative notebook content. Normal
      // notebook review and deletion may have changed the row while this upload was offline.
      while (true) {
        if (await authenticatedOwner() !== owner) return
        const pending = await db.settings.get(job.key)
        if (!pending) break
        const value = pending.value as { item: NotebookItem; token: string; deleteRemote?: boolean }
        const item = await db.notebook.get(value.item.notebookId)
        if (await authenticatedOwner() !== owner) return
        if (!item) {
          if (remove) await remove(owner, value.item.notebookId)
          else if (value.deleteRemote) throw new Error('词汇已删除，云端删除需重试。')
          if (await authenticatedOwner() !== owner) return
          const settled = await db.transaction('rw', db.settings, db.notebook, async () => {
            const current = (await db.settings.get(job.key))?.value as { token: string } | undefined
            if (current?.token !== value.token || await db.notebook.get(value.item.notebookId)) return false
            await db.settings.delete(job.key); return true
          })
          if (settled) break
          continue
        }
        await upload(owner, item)
        if (await authenticatedOwner() !== owner) return
        const settled = await db.transaction('rw', db.settings, db.notebook, async () => {
          const currentJob = await db.settings.get(job.key)
          const currentValue = currentJob?.value as typeof value | undefined
          const currentItem = await db.notebook.get(item.notebookId)
          if (!currentItem) {
            // An upload may have completed after the ordinary deletion's cloud request.
            // Retain a deletion job until the corrective remote delete is acknowledged.
            await db.settings.put({ key: job.key, value: { ...(currentValue || value), deleteRemote: true } })
            return false
          }
          if (JSON.stringify(currentItem) !== JSON.stringify(item)) {
            if (!currentJob) await db.settings.put({ key: job.key, value: { item: currentItem, token: crypto.randomUUID() } })
            return false
          }
          if (currentValue && currentValue.token !== value.token) return false
          await db.settings.delete(job.key); return true
        })
        if (settled) break
      }
    }
  })
  syncChains.set(owner, run)
  try { await run } finally { if (syncChains.get(owner) === run) syncChains.delete(owner) }
}
