import type { State } from 'ts-fsrs'

// ── 基础类型 ──────────────────────────────────────────────
export type Difficulty = 'basic' | 'medium' | 'hard' | 'advanced'
export type NotebookType = 'phrase' | 'vocabulary' | 'pronunciation' | 'terminology'
export type SectionType = 'A' | 'B' | 'C'
export type ContentType = 'news' | 'conversation' | 'passage'
export type LevelType = 'CET4' | 'CET6' | 'NCE'
export type NCEBook = 'Book1' | 'Book2' | 'Book3' | 'Book4'

// FSRS Rating（1-4，对应 Again/Hard/Good/Easy）
// 重新定义以避免与 ts-fsrs 冲突
export const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const

export type Rating = (typeof Rating)[keyof typeof Rating]

// ── FSRS 状态 ──────────────────────────────────────────────
export interface FSRSState {
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: State
  last_review?: Date
}

// ── AI 解析 ──────────────────────────────────────────────
export interface AIPhrase {
  phrase: string
  meaning: string
}

export interface AIPronunciation {
  type: '连读' | '弱读' | '失爆' | '同化' | '侵入音'
  example: string
}

export interface AIGrammar {
  structure: string
  note: string
}

export interface AIAnalysis {
  phrases: AIPhrase[]
  pronunciation: AIPronunciation[]
  grammar: AIGrammar[]
}

// ── 卡片 ──────────────────────────────────────────────
export interface Card {
  cardId: string
  moduleId: string
  audioFile: string
  englishText: string
  chineseText: string
  tags: string[]
  difficulty: Difficulty
  aiAnalysis: AIAnalysis
  // FSRS 字段（首次导入时由 createInitialFSRSState() 生成）
  fsrsMain: FSRSState
  // 通用字段
  level: LevelType

  // CET 专用
  examDate?: string
  section?: SectionType
  type?: ContentType
  title?: string

  // NCE 专用
  isTitle?: boolean     // true = 标题行，不进复习队列
  book?: NCEBook
  lessonNum?: string
  lessonTitle?: string
  seq?: number
}

// cards.json 中导入时的卡片类型（不含 fsrsMain）
export type CardImport = Omit<Card, 'fsrsMain'>

// ── 难点本条目 ──────────────────────────────────────────────
export interface NotebookItem {
  notebookId: string
  type: NotebookType
  content: string
  exampleSentence: string
  sourceCardId: string
  sourceTag: string
  fsrsNotebook: FSRSState
  createdAt: number
}

// ── 模块（用于内容选择页）─────────────────────────────────────────────
export interface Module {
  moduleId: string
  title: string
  level: LevelType
  totalCards: number
  studiedCards: number
  difficulty: Difficulty
  // CET 专用
  examDate?: string
  section?: SectionType
  type?: ContentType
  // NCE 专用
  book?: NCEBook
  lessonNum?: string
  lessonTitle?: string
}

// ── 学习日志 ──────────────────────────────────────────────
export interface StudyLogItem {
  id?: number
  cardId: string
  action: 'review' | 'bookmark' | 'merge'
  rating?: Rating
  timestamp: number
}

// ── cards.json 根结构 ──────────────────────────────────────────────
export interface CardsJSON {
  version: string
  generatedAt: string
  totalCards: number
  cards: CardImport[]
}

// ── App 设置 ──────────────────────────────────────────────
export interface AppSettings {
  nickname: string
  playSpeed: number
  logEnabled: boolean
  initialized: boolean
  isPro: boolean
}
