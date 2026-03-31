import { db } from '@/db/schema'
import { createInitialFSRSState } from '@/lib/fsrs'
import type { CardsJSON, Module, CardImport } from '@/types'

// 分批写入，避免阻塞主线程
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * 初始化数据
 * 首次启动时从 cards.json 导入数据到 IndexedDB
 */
export async function initializeData(
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const count = await db.cards.count()
  if (count > 0) {
    return // 已初始化，跳过
  }

  const response = await fetch('https://xntvurmmuiairvhfzeys.supabase.co/storage/v1/object/public/audio2/data/cards.json')
  if (!response.ok) {
    throw new Error('Failed to fetch cards.json')
  }

  const data: CardsJSON = await response.json()
  const total = data.cards.length
  let loaded = 0

  // 分批写入 cards（200条/批）
  const batches = chunk(data.cards, 200)
  for (const batch of batches) {
    await db.cards.bulkPut(
      batch.map((card) => ({
        ...card,
        fsrsMain: createInitialFSRSState(),
      }))
    )
    loaded += batch.length
    onProgress?.(loaded, total)
  }

  // 构建模块统计（过滤 isTitle）
  await buildModules(data.cards)
}

/**
 * 构建模块统计（排除 isTitle 标题行）
 */
async function buildModules(cards: CardImport[]): Promise<void> {
  // 按 moduleId 分组，排除 isTitle 标题行
  const moduleMap = new Map<
    string,
    {
      cards: CardImport[]
      moduleId: string
    }
  >()

  for (const card of cards) {
    if (card.isTitle) continue // 跳过标题行，不计入模块
    if (!moduleMap.has(card.moduleId)) {
      moduleMap.set(card.moduleId, {
        moduleId: card.moduleId,
        cards: [],
      })
    }
    moduleMap.get(card.moduleId)!.cards.push(card)
  }

  // 转换为 Module 数组
  const modules: Module[] = []
  for (const [, value] of moduleMap) {
    const sampleCard = value.cards[0]

    // 判断是 CET 还是 NCE
    if (sampleCard.level === 'NCE') {
      // NCE 模块
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
    } else {
      // CET 模块：从 moduleId 解析信息（如 CET6_2024.06.01_SectionA_Conversation1）
      const parts = value.moduleId.split('_')
      const level = (parts[0] as 'CET4' | 'CET6') || 'CET6'
      const examDate = sampleCard.examDate || ''
      const section = sampleCard.section || 'A'
      const type = sampleCard.type || 'conversation'

      // 解析标题（如 SectionA_Conversation1 -> Conversation 1）
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
  }

  await db.modules.bulkPut(modules)
}

/**
 * 下载并缓存单个音频文件到 IndexedDB
 */
export async function cacheAudio(
  cardId: string,
  audioFile: string
): Promise<void> {
  const existing = await db.audio.get(cardId)
  if (existing) {
    return // 已缓存
  }

  const response = await fetch(`/data/audio/${audioFile}`)
  if (!response.ok) {
    throw new Error(`Audio fetch failed: ${audioFile}`)
  }

  const blob = await response.blob()
  await db.audio.put({ cardId, blob })
}

/**
 * 获取已缓存的音频 Blob
 */
export async function getCachedAudio(
  cardId: string
): Promise<Blob | null> {
  const record = await db.audio.get(cardId)
  return record?.blob ?? null
}

/**
 * 检查数据是否已初始化
 */
export async function isDataInitialized(): Promise<boolean> {
  const count = await db.cards.count()
  return count > 0
}

/**
 * 获取已初始化的卡片数量
 */
export async function getInitializedCardCount(): Promise<number> {
  return db.cards.count()
}

/**
 * 清除所有数据（用于重置）
 */
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
