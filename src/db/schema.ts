import Dexie, { type Table } from 'dexie'
import type {
  Card,
  NotebookItem,
  Module,
  ListeningLogItem,
  StudyLogItem,
  SyncOutboxItem,
  NotebookReviewLog,
} from '@/types'
import { normalizeFSRSState } from '@/lib/fsrsState'

class AppDB extends Dexie {
  cards!: Table<Card>
  audio!: Table<{ cardId: string; blob: Blob }>
  notebook!: Table<NotebookItem>
  modules!: Table<Module>
  studyLog!: Table<StudyLogItem>
  listeningLog!: Table<ListeningLogItem>
  syncOutbox!: Table<SyncOutboxItem>
  settings!: Table<{ key: string; value: unknown }>
  notebookReviews!: Table<NotebookReviewLog>

  constructor() {
    super('cet-listening-studio')

    this.version(1).stores({
      cards: 'cardId, moduleId, [fsrsMain.due+moduleId], level, examDate, section, type, difficulty, book, lessonNum, aiUnlocked',
      audio: 'cardId',
      notebook: 'notebookId, type, sourceCardId, createdAt, [fsrsNotebook.due+type]',
      modules: 'moduleId, examDate, section, type, level, book, lessonNum',
      studyLog: '++id, cardId, timestamp',
      settings: 'key',
    })

    this.version(2).stores({
      cards: 'cardId, moduleId, [fsrsMain.due+moduleId], level, examDate, section, type, difficulty, book, lessonNum, aiUnlocked',
      audio: 'cardId',
      notebook: 'notebookId, type, sourceCardId, createdAt, [fsrsNotebook.due+type]',
      modules: 'moduleId, examDate, section, type, level, book, lessonNum',
      studyLog: '++id, &operationId, cardId, timestamp',
      syncOutbox: '&operationId, cardId, kind, nextAttemptAt, createdAt',
      settings: 'key',
    }).upgrade(async (transaction) => {
      await transaction.table('cards').toCollection().modify((card) => {
        if (card.fsrsMain) card.fsrsMain = normalizeFSRSState(card.fsrsMain)
      })
      await transaction.table('notebook').toCollection().modify((item) => {
        if (item.fsrsNotebook) item.fsrsNotebook = normalizeFSRSState(item.fsrsNotebook)
      })
    })

    this.version(3).stores({
      cards: 'cardId, moduleId, [fsrsMain.due+moduleId], level, examDate, section, type, difficulty, book, lessonNum, aiUnlocked',
      audio: 'cardId',
      notebook: 'notebookId, type, sourceCardId, createdAt, [fsrsNotebook.due+type]',
      modules: 'moduleId, examDate, section, type, level, book, lessonNum',
      studyLog: '++id, &operationId, cardId, timestamp',
      listeningLog: '++id, cardId, timestamp',
      syncOutbox: '&operationId, cardId, kind, nextAttemptAt, createdAt',
      settings: 'key',
    })
    this.version(4).stores({
      notebookReviews: '&operationId, notebookId, owner, timestamp',
    })
    this.version(5).stores({
      cards: 'cardId, moduleId, [fsrsMain.due+moduleId], level, examDate, section, type, difficulty, book, lessonNum, aiUnlocked, cloudTracked',
    }).upgrade(async transaction => {
      await transaction.table('cards').toCollection().modify(card => {
        card.cloudTracked = card.fsrsMain?.reps > 0 || card.aiUnlocked || card.cardId.startsWith('merged_') ? 1 : 0
      })
    })
    this.cards.hook('creating', (_key, card) => {
      card.cloudTracked = card.fsrsMain?.reps > 0 || card.aiUnlocked || card.cardId.startsWith('merged_') ? 1 : 0
    })
    this.cards.hook('updating', (mods, _key, card) => {
      const patch = mods as Partial<Card> & { 'fsrsMain.reps'?: number }
      const reps = patch['fsrsMain.reps'] ?? patch.fsrsMain?.reps ?? card.fsrsMain?.reps ?? 0
      return { cloudTracked: reps > 0 || (patch.aiUnlocked ?? card.aiUnlocked) || card.cardId.startsWith('merged_') ? 1 : 0 }
    })
  }
}

export const db = new AppDB()
