import { db } from '@/db/schema'
import { createInitialFSRSState } from '@/lib/fsrs'
import { normalizeFSRSState } from '@/lib/fsrsState'
import { syncModuleStats } from '@/db/crud'
import type { CardImport, CardsJSON, Module, NCEBook } from '@/types'
// scheduler.yield() 是实验性 API，暂无标准类型定义
declare global {
  var scheduler: { yield: () => Promise<void> } | undefined
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/** 让出主线程，避免长时间阻塞导致 UI 冻结 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (globalThis.scheduler?.yield) {
      globalThis.scheduler.yield().then(resolve)
    } else {
      setTimeout(resolve, 0)
    }
  })
}

let onRetryProgress: ((attempt: number, total: number) => void) | null = null
let initPromise: Promise<void> | null = null
const DOWNLOAD_RETRIES = 3
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000
const MODULE_INDEX_VERSION = '2026-05-31-fast-module-index-v1'

type ModuleIndexJSON = {
  version: string
  generatedAt: string
  cardsGeneratedAt?: string
  totalCards: number
  totalModules: number
  modules: Module[]
}

type RawNCEBook = NCEBook | 'Unknown'

function normalizeNCEBook(card: Pick<CardImport, 'level' | 'book'>): NCEBook | undefined {
  if (card.level !== 'NCE') return card.book

  switch (card.book as RawNCEBook | undefined) {
    case 'Book4':
    case 'Unknown':
      return 'Book1'
    case 'Book1':
      return 'Book2'
    case 'Book2':
      return 'Book3'
    case 'Book3':
      return 'Book4'
    default:
      return card.book
  }
}

function normalizeCardImport<T extends CardImport>(card: T): T {
  const book = normalizeNCEBook(card)
  if (book === card.book) return card

  const normalizedModuleId = card.moduleId
    .replace(/^NCE_Unknown_/, `NCE_${book}_`)
    .replace(/^NCE_Book[1-4]_/, `NCE_${book}_`)

  return {
    ...card,
    book,
    moduleId: normalizedModuleId,
  }
}

function createStreamTimeout(controller: AbortController, timeoutMs: number) {
  let timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  return {
    refresh() {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    },
    clear() {
      clearTimeout(timeoutId)
    },
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = DOWNLOAD_RETRIES,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (err) {
      clearTimeout(timeoutId)
      lastError = err instanceof Error ? err : new Error(String(err))

      if (onRetryProgress && attempt < retries) {
        onRetryProgress(attempt + 1, retries + 1)
      }

      if (attempt < retries) {
        await new Promise((resolve) => {
          setTimeout(resolve, 2 ** attempt * 1000)
        })
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${retries} retries`)
}

export function setRetryProgressCallback(
  cb: (attempt: number, total: number) => void,
): void {
  onRetryProgress = cb
}

export function startBackgroundInit(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (initPromise) return initPromise

  initPromise = initializeData(onProgress).catch((err) => {
    initPromise = null
    throw err
  })

  return initPromise
}

export function getInitPromise(): Promise<void> | null {
  return initPromise
}

/**
 * 流式下载 JSON 并报告下载进度。
 * 如果 URL 以 .gz 结尾，自动解压 gzip 数据。
 * 先把整个 body 读成文本（流式累积），再分块解析。
 * 这样可以在下载阶段就报告进度，而不是等 response.json() 一次性完成。
 */
async function fetchJsonStreamingLegacy(
  url: string,
  onDownloadProgress?: (downloaded: number, total: number) => void,
): Promise<CardsJSON> {
  const response = await fetchWithRetry(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  const contentLength = Number(response.headers.get('content-length') || 0)

  // 如果浏览器不支持 ReadableStream 或没有 content-length，回退到普通解析
  if (!response.body || contentLength === 0) {
    onDownloadProgress?.(50, 100)
    const data = await response.json()
    onDownloadProgress?.(100, 100)
    return data as CardsJSON
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onDownloadProgress?.(received, contentLength)
  }

  // 合并 chunks
  const merged = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }

  const text = new TextDecoder().decode(merged)

  // 让出主线程再解析 JSON，避免解析期间 UI 冻结
  await yieldToMain()

  const data = JSON.parse(text) as CardsJSON
  return data
}

void fetchJsonStreamingLegacy

async function fetchJsonStreaming(
  url: string,
  onDownloadProgress?: (downloaded: number, total: number) => void,
): Promise<CardsJSON> {
  const retries = DOWNLOAD_RETRIES
  const timeoutMs = DOWNLOAD_TIMEOUT_MS
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const streamTimeout = createStreamTimeout(controller, timeoutMs)

    try {
      const response = await fetch(url, { signal: controller.signal })
      streamTimeout.refresh()

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`)
      }

      const contentLength = Number(response.headers.get('content-length') || 0)

      if (!response.body || contentLength === 0) {
        onDownloadProgress?.(50, 100)
        streamTimeout.refresh()
        const data = await response.json()
        streamTimeout.clear()
        onDownloadProgress?.(100, 100)
        return data as CardsJSON
      }

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0

      for (;;) {
        streamTimeout.refresh()
        const { done, value } = await reader.read()
        if (done) break
        streamTimeout.refresh()
        chunks.push(value)
        received += value.length
        onDownloadProgress?.(received, contentLength)
      }

      streamTimeout.clear()

      const merged = new Uint8Array(received)
      let offset = 0
      for (const c of chunks) {
        merged.set(c, offset)
        offset += c.length
      }

      const text = new TextDecoder().decode(merged)
      await yieldToMain()
      const data = JSON.parse(text) as CardsJSON
      return data
    } catch (err) {
      streamTimeout.clear()
      lastError = err instanceof Error ? err : new Error(String(err))

      if (onRetryProgress && attempt < retries) {
        onRetryProgress(attempt + 1, retries + 1)
      }

      if (attempt < retries) {
        await new Promise((resolve) => {
          setTimeout(resolve, 2 ** attempt * 1000)
        })
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${retries} retries`)
}

/**
 * 增量合并新数据：保留现有卡片的 FSRS 状态、拼接卡片等本地数据，
 * 只更新内容字段（文本、AI 解析等）
 */
async function incrementalMerge(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  onProgress?.(1, 100)

  const data = await fetchJsonStreaming('/data/cards.json', (downloaded, total) => {
    if (total > 0) {
      const downloadProgress = Math.round((downloaded / total) * 14) + 1
      onProgress?.(Math.min(downloadProgress, 15), 100)
    }
  })

  onProgress?.(15, 100)

  // 构建现有卡片映射（保留 fsrsMain、拼接数据等本地状态）
  const existingCards = await db.cards.toArray()
  const existingMap = new Map(existingCards.map((c) => [c.cardId, c]))

  const normalizedCards = data.cards.map(normalizeCardImport)
  const importedCardIds = new Set(normalizedCards.map((card) => card.cardId))
  const localOnlyCards = existingCards
    .filter((card) => !importedCardIds.has(card.cardId))
    .map(normalizeCardImport)
  const total = normalizedCards.length
  let loaded = 0

  const batches = chunk(normalizedCards, 2000)
  for (const batch of batches) {
    const mergedBatch = batch.map((newCard) => {
      const existing = existingMap.get(newCard.cardId)
      if (existing) {
        return {
          ...newCard,
          fsrsMain: normalizeFSRSState(existing.fsrsMain),
          aiUnlocked: existing.aiUnlocked ?? false,
          isMerged: existing.isMerged,
          mergedFrom: existing.mergedFrom,
          mergedLevel: existing.mergedLevel,
          mergedAudioFiles: existing.mergedAudioFiles,
          seq: existing.seq,
        }
      }
      return { ...newCard, fsrsMain: createInitialFSRSState() }
    })

    await db.cards.bulkPut(mergedBatch)
    loaded += batch.length
    const writeProgress = 15 + Math.round((loaded / total) * 75)
    onProgress?.(writeProgress, 100)
    await yieldToMain()
  }

  if (localOnlyCards.length > 0) {
    await db.cards.bulkPut(localOnlyCards)
  }

  // 重建模块索引（保留已学习计数）
  onProgress?.(92, 100)
  await buildModules(normalizedCards)

  await syncModuleStats()

  await db.settings.put({ key: 'dataVersion', value: EXPECTED_DATA_VERSION })
  onProgress?.(100, 100)
}

/** 当 cards.json 的 version 变化时触发增量合并 */
const EXPECTED_DATA_VERSION = '2026-05-30-nce-book-normalization-v4'
const EXPECTED_NCE_FIRST_LESSONS: Record<NCEBook, string> = {
  Book1: 'Excuse me!',
  Book2: 'A private conversation',
  Book3: 'A puma at large',
  Book4: 'Finding fossil man',
}

async function isModuleIndexReady(): Promise<boolean> {
  const nceModuleCount = await db.modules.where('level').equals('NCE').count()
  return nceModuleCount > 0
}

async function isNCEBookMappingReady(): Promise<boolean> {
  if (!await isModuleIndexReady()) return false

  for (const [book, expectedTitle] of Object.entries(EXPECTED_NCE_FIRST_LESSONS) as [NCEBook, string][]) {
    const modules = await db.modules.where('book').equals(book).toArray()
    const firstModule = modules.sort((a, b) => Number(a.lessonNum ?? 0) - Number(b.lessonNum ?? 0))[0]

    if (firstModule?.lessonNum !== '01' || firstModule.lessonTitle !== expectedTitle) {
      return false
    }
  }

  return true
}

export async function isModuleIndexInitialized(): Promise<boolean> {
  const storedVersion = await db.settings.get('moduleIndexVersion')
  return storedVersion?.value === MODULE_INDEX_VERSION && await isNCEBookMappingReady()
}

async function fetchModuleIndex(): Promise<ModuleIndexJSON> {
  const response = await fetch('/data/modules.json')
  if (!response.ok) {
    throw new Error(`Failed to fetch /data/modules.json: ${response.status}`)
  }

  return response.json() as Promise<ModuleIndexJSON>
}

export async function initializeModuleIndex(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  onProgress?.(5, 100)

  const index = await fetchModuleIndex()
  onProgress?.(50, 100)

  const existingModules = await db.modules.toArray()
  const studiedCardsByModule = new Map(
    existingModules.map((module) => [module.moduleId, module.studiedCards]),
  )

  const modules = index.modules.map((module) => ({
    ...module,
    studiedCards: studiedCardsByModule.get(module.moduleId) ?? module.studiedCards ?? 0,
  }))

  await db.transaction('rw', db.modules, db.settings, async () => {
    await db.modules.clear()
    await db.modules.bulkPut(modules)
    await db.settings.put({ key: 'moduleIndexVersion', value: MODULE_INDEX_VERSION })
  })

  onProgress?.(100, 100)
}

export async function needsDataUpgrade(): Promise<boolean> {
  const count = await db.cards.count()
  if (count === 0) return false

  const storedVersion = await db.settings.get('dataVersion')
  return !(storedVersion?.value === EXPECTED_DATA_VERSION && await isNCEBookMappingReady())
}

export async function initializeData(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const count = await db.cards.count()

  // 检查数据版本：如果版本不匹配，增量合并而非全量清空
  if (count > 0) {
    const storedVersion = await db.settings.get('dataVersion')
    if (storedVersion?.value === EXPECTED_DATA_VERSION && await isNCEBookMappingReady()) return

    if (import.meta.env.DEV) console.log('[dataLoader] Data version mismatch, incrementally merging...')
    await incrementalMerge(onProgress)
    return
  }

  onProgress?.(1, 100)

  // 阶段1：流式下载 JSON（0% ~ 15%）
  // 优先尝试加载压缩版本（从 32MB 压缩到 4.1MB）
  const data = await fetchJsonStreaming('/data/cards.json', (downloaded, total) => {
    if (total > 0) {
      const downloadProgress = Math.round((downloaded / total) * 14) + 1
      onProgress?.(Math.min(downloadProgress, 15), 100)
    }
  })

  onProgress?.(15, 100)

  const normalizedCards = data.cards.map(normalizeCardImport)
  const total = normalizedCards.length
  let loaded = 0

  // 阶段2：写入 IndexedDB（15% ~ 90%）
  // 批次增大到 2000，减少事务次数（26000条 → 13批 vs 之前的 130批）
  const batches = chunk(normalizedCards, 2000)
  for (const batch of batches) {
    await db.cards.bulkPut(
      batch.map((card) => ({
        ...card,
        fsrsMain: createInitialFSRSState(),
      })),
    )

    loaded += batch.length
    const writeProgress = 15 + Math.round((loaded / total) * 75)
    onProgress?.(writeProgress, 100)

    // 每批写入后让出主线程，保持 UI 响应
    await yieldToMain()
  }

  // 阶段3：构建模块索引（90% ~ 100%）
  onProgress?.(92, 100)
  await buildModules(normalizedCards)

  // 保存数据版本号，下次启动时用于判断是否需要重新导入
  await db.settings.put({ key: 'dataVersion', value: EXPECTED_DATA_VERSION })

  onProgress?.(100, 100)
}

async function buildModules(cards: CardImport[]): Promise<void> {
  const moduleMap = new Map<
    string,
    {
      cards: CardImport[]
      moduleId: string
    }
  >()

  for (const card of cards) {
    if (card.isTitle) continue

    if (!moduleMap.has(card.moduleId)) {
      moduleMap.set(card.moduleId, {
        moduleId: card.moduleId,
        cards: [],
      })
    }

    moduleMap.get(card.moduleId)!.cards.push(card)
  }

  const modules: Module[] = []
  for (const [, value] of moduleMap) {
    const sampleCard = value.cards[0]

    if (sampleCard.level === 'NCE') {
      modules.push({
        moduleId: value.moduleId,
        title: `Lesson ${sampleCard.lessonNum || ''}`,
        lessonTitle: sampleCard.lessonTitle,
        book: sampleCard.book,
        lessonNum: sampleCard.lessonNum,
        level: 'NCE',
        totalCards: value.cards.length,
        studiedCards: 0,
        difficulty: sampleCard.difficulty || 'basic',
      })
      continue
    }

    const parts = value.moduleId.split('_')
    const level = (parts[0] as 'CET4' | 'CET6') || 'CET6'
    const examDate = sampleCard.examDate || ''
    const section = sampleCard.section || 'A'
    const type = sampleCard.type || 'conversation'
    const titlePart = parts.slice(3).join('_')
    const title = titlePart
      .replace(/([A-Z])/g, ' $1')
      .replace(/^_/, '')
      .trim()

    modules.push({
      moduleId: value.moduleId,
      title: title || value.moduleId,
      examDate,
      section,
      type,
      level,
      totalCards: value.cards.length,
      studiedCards: 0,
      difficulty: sampleCard.difficulty || 'medium',
    })
  }

  await db.transaction('rw', db.modules, async () => {
    await db.modules.clear()
    await db.modules.bulkPut(modules)
  })
}

export async function cacheAudio(
  cardId: string,
  audioFile: string,
): Promise<void> {
  const existing = await db.audio.get(cardId)
  if (existing) return

  const response = await fetch(`/data/audio/${audioFile}`)
  if (!response.ok) {
    throw new Error(`Audio fetch failed: ${audioFile}`)
  }

  const blob = await response.blob()
  await db.audio.put({ cardId, blob })
}

export async function getCachedAudio(cardId: string): Promise<Blob | null> {
  const record = await db.audio.get(cardId)
  return record?.blob ?? null
}

export async function isDataInitialized(): Promise<boolean> {
  const count = await db.cards.count()
  return count > 0
}

export async function getInitializedCardCount(): Promise<number> {
  return db.cards.count()
}

export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.cards.clear(),
    db.audio.clear(),
    db.notebook.clear(),
    db.modules.clear(),
    db.studyLog.clear(),
    db.settings.clear(),
  ])
}
