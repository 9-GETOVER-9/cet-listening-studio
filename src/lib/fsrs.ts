import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs'
import type { CardInput } from 'ts-fsrs'
import type { State } from 'ts-fsrs'
import type { FSRSState, Rating } from '@/types'

// 初始化 FSRS（最大间隔 100 年）
const f = fsrs(generatorParameters({ maximum_interval: 36500 }))

// 将 ts-fsrs 的 Card 转换为我们的 FSRSState
function toFSRSState(card: {
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  state: State
  last_review?: Date
}): FSRSState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review,
  }
}

// 创建初始 FSRS 状态（新卡片）
export function createInitialFSRSState(): FSRSState {
  return toFSRSState(createEmptyCard())
}

// Rating 到 Grade 的映射（ts-fsrs 使用 Grade，1-4）
const RATING_TO_GRADE: Record<Rating, 1 | 2 | 3 | 4> = {
  1: 1, // Again
  2: 2, // Hard
  3: 3, // Good
  4: 4, // Easy
}

// ── 主听力队列 ──────────────────────────────────────────────

/**
 * 对主听力卡片评分
 * 更新 fsrsMain 字段
 */
export async function rateCard(cardId: string, rating: Rating): Promise<void> {
  const { db } = await import('@/db/schema')
  const card = await db.cards.get(cardId)

  if (!card) {
    throw new Error(`Card not found: ${cardId}`)
  }

  const now = new Date()
  const fsrsCard: CardInput = {
    due: new Date(card.fsrsMain.due),
    stability: card.fsrsMain.stability,
    difficulty: card.fsrsMain.difficulty,
    elapsed_days: card.fsrsMain.elapsed_days,
    scheduled_days: card.fsrsMain.scheduled_days,
    reps: card.fsrsMain.reps,
    lapses: card.fsrsMain.lapses,
    learning_steps: 0,
    state: card.fsrsMain.state,
    last_review: card.fsrsMain.last_review,
  }

  const result = f.next(fsrsCard, now, RATING_TO_GRADE[rating])
  await db.cards.update(cardId, { fsrsMain: toFSRSState(result.card) })
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

  const now = new Date()
  const fsrsCard: CardInput = {
    due: new Date(item.fsrsNotebook.due),
    stability: item.fsrsNotebook.stability,
    difficulty: item.fsrsNotebook.difficulty,
    elapsed_days: item.fsrsNotebook.elapsed_days,
    scheduled_days: item.fsrsNotebook.scheduled_days,
    reps: item.fsrsNotebook.reps,
    lapses: item.fsrsNotebook.lapses,
    learning_steps: 0,
    state: item.fsrsNotebook.state,
    last_review: item.fsrsNotebook.last_review,
  }

  const result = f.next(fsrsCard, now, RATING_TO_GRADE[rating])
  await db.notebook.update(notebookId, {
    fsrsNotebook: toFSRSState(result.card),
  })
}

// ── 查询函数 ──────────────────────────────────────────────

/**
 * 获取今日到期的听力卡片（过滤 isTitle，排除标题行）
 */
export async function getTodayDueCards(
  moduleId?: string,
  level?: import('@/types').LevelType
): Promise<import('@/types').Card[]> {
  const { db } = await import('@/db/schema')
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const cards = await db.cards
    .filter((card) => !card.isTitle && new Date(card.fsrsMain.due) <= today)
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
