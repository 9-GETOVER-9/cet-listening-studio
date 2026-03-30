import Dexie, { type Table } from 'dexie'
import type { Card, NotebookItem, Module, StudyLogItem } from '@/types'

class AppDB extends Dexie {
  cards!: Table<Card>
  audio!: Table<{ cardId: string; blob: Blob }>
  notebook!: Table<NotebookItem>
  modules!: Table<Module>
  studyLog!: Table<StudyLogItem>
  settings!: Table<{ key: string; value: unknown }>

  constructor() {
    super('cet-listening-studio')

    this.version(1).stores({
      // cards: 主键 cardId，按 moduleId 查询，按 level/examDate 过滤
      // NCE 新增: book, lessonNum 索引
      cards: 'cardId, moduleId, [fsrsMain.due+moduleId], level, examDate, section, type, difficulty, book, lessonNum',
      // audio: 按 cardId 存储音频 Blob
      audio: 'cardId',
      // notebook: 难点本，按 type/createdAt 查询
      notebook: 'notebookId, type, sourceCardId, createdAt, [fsrsNotebook.due+type]',
      // modules: 模块统计缓存
      // NCE 新增: book, lessonNum 索引
      modules: 'moduleId, examDate, section, type, level, book, lessonNum',
      // studyLog: 学习日志，按时间查询
      studyLog: '++id, cardId, timestamp',
      // settings: 键值对存储
      settings: 'key',
    })
  }
}

export const db = new AppDB()
