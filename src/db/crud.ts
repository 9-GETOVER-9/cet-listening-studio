import { db } from './schema'
import { createInitialFSRSState } from '@/lib/fsrs'
import type { Card, NotebookItem, NotebookType, Module, StudyLogItem, LevelType, NCEBook } from '@/types'

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
    .filter((c) => !c.isTitle)
    .sortBy('seq')
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

// ── 模块操作 ──────────────────────────────────────────────

/**
 * 获取所有模块
 */
export function getAllModules(): Promise<Module[]> {
  return db.modules.toArray()
}

/**
 * 获取单个模块
 */
export function getModule(moduleId: string): Promise<Module | undefined> {
  return db.modules.get(moduleId)
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
  return db.modules.where('book').equals(book).sortBy('lessonNum')
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
export async function addNotebookItem(
  item: Omit<NotebookItem, 'notebookId' | 'fsrsNotebook' | 'createdAt'>
): Promise<NotebookItem> {
  // 生成唯一 ID
  const notebookId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  const newItem: NotebookItem = {
    ...item,
    notebookId,
    fsrsNotebook: createInitialFSRSState(),
    createdAt: Date.now(),
  }

  await db.notebook.add(newItem)
  return newItem
}

/**
 * 删除难点本条目
 */
export function deleteNotebookItem(notebookId: string): Promise<void> {
  return db.notebook.delete(notebookId)
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
  return db.cards.filter((c) => c.fsrsMain.reps > 0).count()
}

/**
 * 获取总卡片数
 */
export function getTotalCardCount(): Promise<number> {
  return db.cards.count()
}

/**
 * 获取今日复习卡片数
 */
export async function getTodayReviewCount(): Promise<number> {
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  return db.cards
    .filter((c) => new Date(c.fsrsMain.due) <= today)
    .count()
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
    const dateStr = new Date(log.timestamp).toISOString().slice(0, 10)
    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1)
  }

  return dateMap
}

/**
 * 获取当前连续学习天数（streak）
 * 今天还没学习也算（今天还没结束），从昨天往前回溯
 */
export async function getCurrentStreak(): Promise<number> {
  const allLogs = await db.studyLog.toArray()
  if (allLogs.length === 0) return 0

  // 收集所有有学习记录的日期
  const studyDates = new Set<string>()
  for (const log of allLogs) {
    studyDates.add(new Date(log.timestamp).toISOString().slice(0, 10))
  }

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  // 今天或昨天必须有记录才算 streak
  if (!studyDates.has(today) && !studyDates.has(yesterday)) return 0

  let streak = 0
  let checkDate = new Date()

  // 如果今天还没学习，从昨天开始算
  if (!studyDates.has(today)) {
    checkDate = new Date(Date.now() - 86400000)
  }

  // 从 checkDate 往前回溯
  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10)
    if (studyDates.has(dateStr)) {
      streak++
      checkDate = new Date(checkDate.getTime() - 86400000)
    } else {
      break
    }
  }

  return streak
}

/**
 * 获取今日已完成的复习数量
 */
export async function getTodayStudiedCount(): Promise<number> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  return db.studyLog
    .where('timestamp')
    .aboveOrEqual(startOfToday.getTime())
    .filter((log) => log.action === 'review')
    .count()
}
