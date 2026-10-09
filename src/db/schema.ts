import Dexie, { type Table } from 'dexie'
import type {
  Card,
  NotebookItem,
  Module,
  ListeningLogItem,
  StudyLogItem,
  SyncOutboxItem,
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
  }
}

export const db = new AppDB()
