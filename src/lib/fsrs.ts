import type { FSRSState, Rating } from '@/types'
import { supabase } from '@/lib/supabase'
import { syncNotebookItem } from '@/lib/sync'
import { commitCardRating } from '@/db/reviewRepository'
import {
  createInitialFSRSState,
  previewFSRSRatings,
  scheduleFSRSState,
} from '@/lib/fsrsScheduler'
import { isDueNow, isDueToday } from '@/lib/reviewTiming'

// 创建初始 FSRS 状态（新卡片）
export { createInitialFSRSState, previewFSRSRatings }

// ── 主听力队列 ──────────────────────────────────────────────

/**
 * 对主听力卡片评分
 * 更新 fsrsMain 字段
 */
export async function rateCard(cardId: string, rating: Rating): Promise<FSRSState> {
  const result = await commitCardRating({
    cardId,
    rating,
    operationId: crypto.randomUUID(),
    reviewedAt: new Date(),
  })
  return result.fsrsState
}

// ── 难点本队列 ──────────────────────────────────────────────

/**
 * 对难点本条目评分
 * 更新 fsrsNotebook 字段（与 fsrsMain 完全隔离）
 */
export async function rateNotebookItem(
  notebookId: string,
  rating: Rating
): Promise<void> {
  const { db } = await import('@/db/schema')
  const item = await db.notebook.get(notebookId)

  if (!item) {
    throw new Error(`Notebook item not found: ${notebookId}`)
  }

  const newFsrsState = scheduleFSRSState(item.fsrsNotebook, rating, new Date())
  await db.notebook.update(notebookId, {
    fsrsNotebook: newFsrsState,
  })

  // 后台同步到云端
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    const updatedItem = await db.notebook.get(notebookId)
    if (updatedItem) {
      void syncNotebookItem(session.user.id, updatedItem)
    }
  }
}

// ── 查询函数 ──────────────────────────────────────────────

/**
 * 获取今日到期的听力卡片（过滤 isTitle，排除标题行）
 * @param onlyStudied - 仅返回已学习过的卡片（reps > 0 或已拼接），用于复习队列
 */
export async function getTodayDueCards(
  moduleId?: string,
  level?: import('@/types').LevelType,
  onlyStudied?: boolean,
): Promise<import('@/types').Card[]> {
  const { db } = await import('@/db/schema')
  const now = new Date()

  const cards = await db.cards
    .filter((card) => {
      if (card.isTitle) return false
      if (!isDueToday(card.fsrsMain.due, now)) return false
      // 复习模式：只展示已评分或用户手动拼接的卡片，避免预拼接/未学卡片压力
      if (onlyStudied && card.fsrsMain.reps === 0 && !card.cardId.startsWith('merged_')) return false
      return true
    })
    .toArray()

  let filtered = moduleId
    ? cards.filter((c) => c.moduleId === moduleId)
    : cards

  if (level) {
    filtered = filtered.filter((c) => c.level === level)
  }

  return filtered.sort(
    (a, b) =>
      new Date(a.fsrsMain.due).getTime() - new Date(b.fsrsMain.due).getTime()
  )
}

/** 获取当前时刻已经到期的卡片，用于真正的复习队列。 */
export async function getDueCardsNow(
  moduleId?: string,
  level?: import('@/types').LevelType,
  onlyStudied = true,
): Promise<import('@/types').Card[]> {
  const { db } = await import('@/db/schema')
  const now = new Date()
  const cards = await db.cards
    .filter((card) => {
      if (card.isTitle || !isDueNow(card.fsrsMain.due, now)) return false
      if (onlyStudied && card.fsrsMain.reps === 0 && !card.cardId.startsWith('merged_')) return false
      return true
    })
    .toArray()

  return cards
    .filter((card) => !moduleId || card.moduleId === moduleId)
    .filter((card) => !level || card.level === level)
    .sort((a, b) => new Date(a.fsrsMain.due).getTime() - new Date(b.fsrsMain.due).getTime())
}

/**
 * 获取今日到期的难点本条目
 */
export async function getTodayDueNotebookItems(
  type?: import('@/types').NotebookType
): Promise<import('@/types').NotebookItem[]> {
  const { db } = await import('@/db/schema')
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const items = await db.notebook
    .filter((item) => new Date(item.fsrsNotebook.due) <= today)
    .toArray()

  const filtered = type ? items.filter((i) => i.type === type) : items

  return filtered.sort(
    (a, b) =>
      new Date(a.fsrsNotebook.due).getTime() -
      new Date(b.fsrsNotebook.due).getTime()
  )
}
