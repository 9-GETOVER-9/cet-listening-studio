import Dexie from 'dexie'
import { db } from './schema'
import { createInitialFSRSState } from '@/lib/fsrs'
import { getLocalDateStr } from '@/lib/utils'
import { syncNotebookItem, deleteNotebookItemSync } from '@/lib/sync'
import { supabase } from '@/lib/supabase'
import type { Card, NotebookItem, NotebookType, Module, StudyLogItem, LevelType, NCEBook } from '@/types'

type ModuleStats = {
  total: number
  studied: number
  rate: number
}

export type TodayTaskStats = {
  total: number
  completed: number
  remaining: number
}

const MODULE_STATS_CACHE_VERSION = 1

function createEmptyModuleStats(): ModuleStats {
  return {
    total: 0,
    studied: 0,
    rate: 0,
  }
}

function getStartOfToday(): Date {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start
}

function getDayDiff(laterDateStr: string, earlierDateStr: string): number {
  const later = new Date(`${laterDateStr}T00:00:00`)
  const earlier = new Date(`${earlierDateStr}T00:00:00`)
  return Math.round((later.getTime() - earlier.getTime()) / 86400000)
}

// ── 卡片操作 ──────────────────────────────────────────────

/**
 * 获取单个卡片
 */
export function getCard(cardId: string): Promise<Card | undefined> {
  return db.cards.get(cardId)
}

/**
 * 获取某个模块的所有卡片（排除 isTitle 标题行）
 */
export function getModuleCards(moduleId: string): Promise<Card[]> {
  return db.cards
    .where('moduleId')
    .equals(moduleId)
    .toArray()
    .then((cards) => {
      // 先给没有 seq 的卡片按 cardId 字典序分配临时 seq
      // 这样拼接卡的 seq（位置*1000+500）能正确插入
      const withTempSeq = cards.map(c => ({
        card: c,
        sortKey: c.seq != null ? c.seq : null,
        cardId: c.cardId,
      }))

      // 把没有 seq 的卡按 cardId 排，分配 0,1,2,3... * 1000
      const noSeq = withTempSeq.filter(x => x.sortKey == null)
        .sort((a, b) => a.cardId < b.cardId ? -1 : 1)
      noSeq.forEach((x, i) => { x.sortKey = i * 1000 })

      // 统一按 sortKey 排序
      return withTempSeq
        .sort((a, b) => a.sortKey! - b.sortKey!)
        .map(x => x.card)
    })
}

/**
 * 获取所有卡片
 */
export function getAllCards(): Promise<Card[]> {
  return db.cards.toArray()
}

/**
 * 批量获取卡片
 */
export function getCardsByIds(cardIds: string[]): Promise<Card[]> {
  return db.cards.where('cardId').anyOf(cardIds).toArray()
}

/**
 * 合并卡片（拼接相邻句子）
 * @param cardIds 要合并的卡片ID列表（必须按顺序传入）
 * @returns 新合并的卡片
 */
export async function mergeCards(cardIds: string[]): Promise<Card> {
  if (cardIds.length < 2) {
    throw new Error('至少需要2张卡片才能合并')
  }

  if (cardIds.length > 4) {
    throw new Error('最多只能合并4张卡片')
  }

  // 获取所有源卡片
  const sourceCards = await getCardsByIds(cardIds)
  if (sourceCards.length !== cardIds.length) {
    throw new Error('部分卡片不存在')
  }

  // 按传入顺序排序（确保正确合并）
  const sortedCards = cardIds
    .map(id => sourceCards.find(c => c.cardId === id))
    .filter((c): c is Card => c !== undefined)

  // 检查是否已达到拼接数量限制（计算最终拼接卡片包含的原始句子数量）
  let totalSentences = 0
  for (const card of sortedCards) {
    totalSentences += (card.isMerged && card.mergedFrom)
      ? card.mergedFrom.length
      : 1
  }

  if (totalSentences > 4) {
    throw new Error(`拼接后将包含${totalSentences}个句子，超过最大限制4个`)
  }

  // ✅ 展开已拼接卡片的 mergedFrom，存原始卡片ID
  const expandedCardIds: string[] = []
  for (const card of sortedCards) {
    if (card.isMerged && card.mergedFrom && card.mergedFrom.length > 0) {
      expandedCardIds.push(...card.mergedFrom)
    } else {
      expandedCardIds.push(card.cardId)
    }
  }

  // ✅ 用展开后的原始卡片获取 aiAnalysis，避免重复
  const originalCards = await getCardsByIds(expandedCardIds)
  const orderedOriginalCards = expandedCardIds
    .map(id => originalCards.find(c => c.cardId === id))
    .filter((c): c is Card => c !== undefined)

  const firstCard = sortedCards[0]

  // ✅ 收集各句音频文件名（优先用已拼接卡片的 mergedAudioFiles，避免查不存在的原始卡片）
  const mergedAudioFiles: string[] = []
  for (const card of sortedCards) {
    if (card.isMerged && Array.isArray(card.mergedAudioFiles)) {
      // 过滤掉无效的音频文件（null、undefined、空字符串）
      const validFiles = card.mergedAudioFiles.filter(
        (f): f is string => typeof f === 'string' && f.length > 0
      )
      mergedAudioFiles.push(...validFiles)
    } else if (card.audioFile) {
      mergedAudioFiles.push(card.audioFile)
    } else {
      // 记录警告帮助调试
      console.warn(`[mergeCards] Card ${card.cardId} has no audio files`)
    }
  }

  // ✅ 不变量检查：确保收集到预期数量的音频文件
  if (mergedAudioFiles.length === 0) {
    throw new Error('No audio files found for merged card')
  }
  if (mergedAudioFiles.length !== totalSentences) {
    console.warn(
      `[mergeCards] Audio file count mismatch: expected ${totalSentences}, got ${mergedAudioFiles.length}`
    )
  }

  // 生成新卡片ID
  const newCardId = `merged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // ✅ 计算拼接卡的正确 seq：找到 firstCard 在模块中的实际位置
  // 对 CET 卡片（无 seq）也能正确插入，而不是排到末尾
  let mergedSeq: number | undefined
  if (firstCard.seq != null) {
    // NCE：直接用 seq + 0.5
    mergedSeq = firstCard.seq + 0.5
  } else {
    // CET：查模块完整列表，用位置索引 * 1000 + 500 作为 seq
    const allModuleCards = await db.cards
      .where('moduleId')
      .equals(firstCard.moduleId)
      .filter(c => !c.isTitle)
      .toArray()
    // 按 cardId 字典序排（和 getModuleCards 对CET的排序一致）
    allModuleCards.sort((a, b) => a.cardId < b.cardId ? -1 : 1)
    const pos = allModuleCards.findIndex(c => c.cardId === firstCard.cardId)
    // pos * 1000 给每张卡留出插入空间，+500 插在 firstCard 后面
    mergedSeq = (pos >= 0 ? pos : allModuleCards.length) * 1000 + 500
  }

  // 合并内容
  const mergedCard: Card = {
    cardId: newCardId,
    moduleId: firstCard.moduleId,
    audioFile: firstCard.audioFile, // 主音频，后续连续播放
    englishText: sortedCards.map(c => c.englishText).join(' '),
    chineseText: sortedCards.map(c => c.chineseText).join(' '),
    tags: orderedOriginalCards.flatMap(c => c.tags),
    difficulty: firstCard.difficulty,
    aiAnalysis: {
      phrases: orderedOriginalCards.flatMap(c => c.aiAnalysis.phrases),
      pronunciation: orderedOriginalCards.flatMap(c => c.aiAnalysis.pronunciation),
      grammar: orderedOriginalCards.flatMap(c => c.aiAnalysis.grammar),
    },
    fsrsMain: createInitialFSRSState(),
    level: firstCard.level,
    // 继承 CET 字段
    examDate: firstCard.examDate,
    section: firstCard.section,
    type: firstCard.type,
    title: firstCard.title,
    // 继承 NCE 字段
    isTitle: firstCard.isTitle,
    book: firstCard.book,
    lessonNum: firstCard.lessonNum,
    lessonTitle: firstCard.lessonTitle,
    seq: mergedSeq,
    // 拼接专用字段
    isMerged: true,
    mergedFrom: expandedCardIds,
    mergedLevel: totalSentences,
    mergedAudioFiles,
  }

  await db.transaction('rw', db.cards, db.modules, db.studyLog, async () => {
    // 保存到数据库
    await db.cards.add(mergedCard)

    // ✅ 删除所有源卡片（含中间拼接卡），解决冗余和面板重叠问题
    await db.cards.bulkDelete(cardIds)

    // 记录学习日志
    await addStudyLog({
      cardId: newCardId,
      action: 'merge',
      timestamp: Date.now(),
    })

    await refreshModuleStats(firstCard.moduleId)
  })

  return mergedCard
}

/**
 * 获取相邻卡片（用于拼接）
 * @param cardId 当前卡片ID
 * @param moduleId 模块ID
 * @returns 上一张和下一张卡片
 */
export async function getAdjacentCards(cardId: string, moduleId: string): Promise<{
  prev: Card | null
  next: Card | null
}> {
  const cards = await getModuleCards(moduleId)
  const currentIndex = cards.findIndex(c => c.cardId === cardId)

  return {
    prev: currentIndex > 0 ? cards[currentIndex - 1] : null,
    next: currentIndex < cards.length - 1 ? cards[currentIndex + 1] : null,
  }
}

/**
 * 删除卡片
 */
export async function deleteCard(cardId: string): Promise<void> {
  const card = await db.cards.get(cardId)
  await db.cards.delete(cardId)

  if (card) {
    await refreshModuleStats(card.moduleId)
  }
}

// ── 模块操作 ──────────────────────────────────────────────

/**
 * 获取所有模块
 */
export function getAllModules(): Promise<Module[]> {
  return db.modules.toArray()
}

/**
 * 获取所有 CET 模块（排除 NCE）
 */
export function getCETModules(): Promise<Module[]> {
  return db.modules.where('level').anyOf(['CET4', 'CET6']).toArray()
}

/**
 * 获取单个模块
 */
export function getModule(moduleId: string): Promise<Module | undefined> {
  return db.modules.get(moduleId)
}

export async function syncModuleStats(moduleIds?: string[]): Promise<Record<string, ModuleStats>> {
  const modules = moduleIds?.length
    ? await db.modules.where('moduleId').anyOf(moduleIds).toArray()
    : await db.modules.toArray()

  if (modules.length === 0) {
    return {}
  }

  const ids = modules.map((module) => module.moduleId)
  const statsByModule = Object.fromEntries(
    ids.map((id) => [id, createEmptyModuleStats()])
  ) as Record<string, ModuleStats>

  const cards = await db.cards.where('moduleId').anyOf(ids).toArray()
  for (const card of cards) {
    if (card.isTitle) continue

    const stats = statsByModule[card.moduleId] ?? createEmptyModuleStats()
    stats.total += 1
    if (card.fsrsMain.reps > 0) {
      stats.studied += 1
    }
    statsByModule[card.moduleId] = stats
  }

  const updatedModules = modules.map((module) => {
    const stats = statsByModule[module.moduleId] ?? createEmptyModuleStats()
    stats.rate = stats.total > 0 ? stats.studied / stats.total : 0

    return {
      ...module,
      totalCards: stats.total,
      studiedCards: stats.studied,
    }
  })

  await db.modules.bulkPut(updatedModules)
  return statsByModule
}

export async function refreshModuleStats(moduleId: string): Promise<ModuleStats> {
  const statsByModule = await syncModuleStats([moduleId])
  return statsByModule[moduleId] ?? createEmptyModuleStats()
}

export async function ensureModuleStatsCache(): Promise<void> {
  const versionEntry = await db.settings.get('moduleStatsCacheVersion')
  if (versionEntry?.value === MODULE_STATS_CACHE_VERSION) {
    return
  }

  const hasStudyLogs = await db.studyLog.limit(1).count()
  if (hasStudyLogs > 0) {
    await syncModuleStats()
  }

  await db.settings.put({
    key: 'moduleStatsCacheVersion',
    value: MODULE_STATS_CACHE_VERSION,
  })
}

/**
 * 获取模块统计信息（排除 isTitle 卡片）
 */
export async function getModuleStats(moduleId: string): Promise<{
  total: number
  studied: number
  rate: number
}> {
  const total = await db.cards
    .where('moduleId')
    .equals(moduleId)
    .filter((c) => !c.isTitle)
    .count()
  const studied = await db.cards
    .where('moduleId')
    .equals(moduleId)
    .filter((c) => !c.isTitle && c.fsrsMain.reps > 0)
    .count()

  return {
    total,
    studied,
    rate: total > 0 ? studied / total : 0,
  }
}

/**
 * 更新模块的学习进度（排除 isTitle 卡片）
 */
export async function updateModuleStudiedCount(moduleId: string): Promise<void> {
  const studied = await db.cards
    .where('moduleId')
    .equals(moduleId)
    .filter((c) => !c.isTitle && c.fsrsMain.reps > 0)
    .count()

  await db.modules.update(moduleId, { studiedCards: studied })
}

/**
 * 按考试日期获取模块
 */
export function getModulesByExamDate(examDate: string): Promise<Module[]> {
  return db.modules.where('examDate').equals(examDate).toArray()
}

/**
 * 按级别获取模块（支持 CET4/CET6/NCE）
 */
export function getModulesByLevel(level: LevelType): Promise<Module[]> {
  return db.modules.where('level').equals(level).toArray()
}

/**
 * NCE 按册获取模块（按 lessonNum 排序）
 */
export function getNCEModulesByBook(book: NCEBook): Promise<Module[]> {
  return db.modules
    .where('book')
    .equals(book)
    .toArray()
    .then((modules) =>
      modules.sort((a, b) => Number(a.lessonNum ?? 0) - Number(b.lessonNum ?? 0)),
    )
}

/**
 * NCE Book3/4 权限检查
 */
export function isNCEBookAccessible(book: NCEBook, isPro: boolean): boolean {
  return book === 'Book1' || book === 'Book2' || isPro
}

/**
 * 获取 NCE 某册的学习统计
 */
export async function getNCEBookStats(book: NCEBook): Promise<{
  totalModules: number
  totalCards: number
  studiedCards: number
}> {
  const modules = await getNCEModulesByBook(book)
  const totalModules = modules.length
  let totalCards = 0
  let studiedCards = 0

  for (const mod of modules) {
    const stats = await getModuleStats(mod.moduleId)
    totalCards += stats.total
    studiedCards += stats.studied
  }

  return { totalModules, totalCards, studiedCards }
}

// ── 难点本操作 ──────────────────────────────────────────────

/**
 * 按类型获取难点本条目
 */
export function getNotebookByType(type: NotebookType): Promise<NotebookItem[]> {
  return db.notebook
    .where('type')
    .equals(type)
    .reverse()
    .sortBy('createdAt')
}

/**
 * 获取所有难点本条目
 */
export function getAllNotebookItems(): Promise<NotebookItem[]> {
  return db.notebook.toArray()
}

/**
 * 添加难点本条目
 */
const FREE_NOTEBOOK_LIMIT = 20

export async function addNotebookItem(
  item: Omit<NotebookItem, 'notebookId' | 'fsrsNotebook' | 'createdAt'>,
  isProActive = false
): Promise<NotebookItem> {
  if (!isProActive) {
    const count = await db.notebook.count()
    if (count >= FREE_NOTEBOOK_LIMIT) {
      throw new Error('NOTEBOOK_LIMIT_EXCEEDED')
    }
  }

  const notebookId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  const newItem: NotebookItem = {
    ...item,
    notebookId,
    fsrsNotebook: createInitialFSRSState(),
    createdAt: Date.now(),
  }

  await db.notebook.add(newItem)

  // 后台同步到云端
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    void syncNotebookItem(session.user.id, newItem)
  }

  return newItem
}

/**
 * 删除难点本条目
 */
export async function deleteNotebookItem(notebookId: string): Promise<void> {
  await db.notebook.delete(notebookId)

  // 后台同步删除到云端
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    void deleteNotebookItemSync(session.user.id, notebookId)
  }
}

/**
 * 清空某个类型的难点本条目
 */
export function clearNotebookByType(type: NotebookType): Promise<number> {
  return db.notebook.where('type').equals(type).delete()
}

/**
 * 清空所有难点本条目
 */
export function clearAllNotebook(): Promise<void> {
  return db.notebook.clear()
}

/**
 * 获取难点本条目数量
 */
export function getNotebookCount(): Promise<number> {
  return db.notebook.count()
}

/**
 * 按类型获取难点本条目数量
 */
export async function getNotebookCountByType(
  type: NotebookType
): Promise<number> {
  return db.notebook.where('type').equals(type).count()
}

/**
 * 检查卡片是否已被收藏
 */
export async function isCardBookmarked(
  cardId: string,
  content: string
): Promise<boolean> {
  const existing = await db.notebook
    .where('sourceCardId')
    .equals(cardId)
    .filter((item) => item.content === content)
    .first()

  return !!existing
}

// ── 学习日志 ──────────────────────────────────────────────

/**
 * 添加学习日志
 */
export function addStudyLog(
  log: Omit<StudyLogItem, 'id'>
): Promise<number> {
  return db.studyLog.add(log as StudyLogItem)
}

/**
 * 获取近期学习日志
 */
export function getRecentLogs(days = 7): Promise<StudyLogItem[]> {
  const since = Date.now() - days * 24 * 3600 * 1000
  return db.studyLog
    .where('timestamp')
    .aboveOrEqual(since)
    .reverse()
    .sortBy('timestamp')
}

/**
 * 获取卡片的学习日志
 */
export function getCardLogs(cardId: string): Promise<StudyLogItem[]> {
  return db.studyLog.where('cardId').equals(cardId).toArray()
}

// ── 统计 ──────────────────────────────────────────────

/**
 * 获取总学习卡片数（reps > 0）
 */
export function getTotalStudiedCount(): Promise<number> {
  return db.modules.toArray().then((modules) =>
    modules.reduce((sum, module) => sum + module.studiedCards, 0)
  )
}

/**
 * 获取总卡片数
 */
export function getTotalCardCount(): Promise<number> {
  return db.modules.toArray().then((modules) =>
    modules.reduce((sum, module) => sum + module.totalCards, 0)
  )
}

/**
 * 获取今日复习卡片数
 */
export async function getTodayReviewCount(): Promise<number> {
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  return db.cards
    .where('[fsrsMain.due+moduleId]')
    .between([Dexie.minKey, Dexie.minKey], [today, Dexie.maxKey], true, true)
    .filter((c) => !c.isTitle)
    .count()
}

/**
 * 获取第一个有待复习卡片的模块（用于"开始复习"按钮跳转）
 */
export async function getFirstDueModule(): Promise<Module | null> {
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const firstDueCard = await db.cards
    .where('[fsrsMain.due+moduleId]')
    .between([Dexie.minKey, Dexie.minKey], [today, Dexie.maxKey], true, true)
    .filter((card) => !card.isTitle)
    .first()

  if (!firstDueCard) return null
  return getModule(firstDueCard.moduleId).then((module) => module ?? null)
}

export async function getTodayTaskStats(): Promise<TodayTaskStats> {
  const startOfToday = getStartOfToday()
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const [dueCards, reviewedLogs] = await Promise.all([
    db.cards
      .where('[fsrsMain.due+moduleId]')
      .between([Dexie.minKey, Dexie.minKey], [endOfToday, Dexie.maxKey], true, true)
      .filter((card) => !card.isTitle && (card.fsrsMain.reps > 0 || card.cardId.startsWith('merged_')))
      .toArray(),
    db.studyLog
      .where('timestamp')
      .aboveOrEqual(startOfToday.getTime())
      .filter((log) => log.action === 'review')
      .toArray(),
  ])

  const dueCardIds = new Set(dueCards.map((card) => card.cardId))
  const reviewedCardIds = new Set(reviewedLogs.map((log) => log.cardId))
  let completed = 0

  for (const cardId of reviewedCardIds) {
    if (!dueCardIds.has(cardId)) {
      completed += 1
    }
  }

  return {
    total: dueCards.length + completed,
    completed,
    remaining: dueCards.length,
  }
}

// ── 设置 ──────────────────────────────────────────────

/**
 * 获取设置
 */
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const record = await db.settings.get(key)
  return record ? (record.value as T) : defaultValue
}

/**
 * 保存设置
 */
export function setSetting(key: string, value: unknown): Promise<string> {
  return db.settings.put({ key, value })
}

/**
 * 删除设置
 */
export function deleteSetting(key: string): Promise<void> {
  return db.settings.delete(key)
}

// ── 学习激励：Streak / 热力图 ──────────────────────────────────

/**
 * 获取指定日期范围内每天的学习条数
 * 返回 Map<YYYY-MM-DD, count>
 */
export async function getStudyDatesInRange(
  startDate: Date,
  endDate: Date
): Promise<Map<string, number>> {
  const startTs = startDate.getTime()
  const endTs = endDate.getTime()

  const logs = await db.studyLog
    .where('timestamp')
    .between(startTs, endTs, true, true)
    .toArray()

  const dateMap = new Map<string, number>()
  for (const log of logs) {
    const dateStr = getLocalDateStr(new Date(log.timestamp))
    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1)
  }

  return dateMap
}

/**
 * 获取当前连续学习天数（streak）
 * 今天还没学习也算（今天还没结束），从昨天往前回溯
 */
export async function getCurrentStreak(): Promise<number> {
  const today = getLocalDateStr()
  const yesterday = getLocalDateStr(new Date(Date.now() - 86400000))
  const uniqueDates: string[] = []
  const seenDates = new Set<string>()
  const chunkSize = 200
  let offset = 0
  let shouldStop = false

  while (!shouldStop) {
    const logs = await db.studyLog
      .orderBy('timestamp')
      .reverse()
      .offset(offset)
      .limit(chunkSize)
      .toArray()

    if (logs.length === 0) break

    for (const log of logs) {
      const dateStr = getLocalDateStr(new Date(log.timestamp))
      if (seenDates.has(dateStr)) continue

      seenDates.add(dateStr)
      uniqueDates.push(dateStr)

      if (uniqueDates.length === 1 && dateStr !== today && dateStr !== yesterday) {
        return 0
      }

      if (uniqueDates.length >= 2) {
        const prevDate = uniqueDates[uniqueDates.length - 2]
        const diff = getDayDiff(prevDate, dateStr)
        if (diff > 1) {
          shouldStop = true
          break
        }
      }
    }

    offset += logs.length
  }

  if (uniqueDates.length === 0) return 0

  let streak = 1
  for (let i = 1; i < uniqueDates.length; i++) {
    const diff = getDayDiff(uniqueDates[i - 1], uniqueDates[i])
    if (diff !== 1) break
    streak += 1
  }

  return streak
}

/**
 * 获取今日已完成的复习数量
 */
export async function getTodayStudiedCount(): Promise<number> {
  const startOfToday = getStartOfToday()

  const logs = await db.studyLog
    .where('timestamp')
    .aboveOrEqual(startOfToday.getTime())
    .filter((log) => log.action === 'review')
    .toArray()

  return new Set(logs.map((log) => log.cardId)).size
}
