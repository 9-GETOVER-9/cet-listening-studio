import Dexie, { type Table } from 'dexie'
import type { Card } from '@/types'
import { getLocalDateStr } from './utils'

export const LISTENING_CATEGORIES = [
  { id: 'nce1', label: '新概念 1' }, { id: 'nce2', label: '新概念 2' },
  { id: 'nce3', label: '新概念 3' }, { id: 'nce4', label: '新概念 4' },
  { id: 'cet4', label: '英语 4 级' }, { id: 'cet6', label: '英语 6 级' },
  { id: 'frequency', label: '高频语料库' }, { id: 'wanglu', label: '雅思语料库' },
] as const
export type ListeningCategory = typeof LISTENING_CATEGORIES[number]['id']
export interface ListeningSlice {
  id: string; owner: string; category: ListeningCategory
  startedAt: number; endedAt: number; seconds: number
}
export interface ListeningRecord extends ListeningSlice { day: string }
class ListeningTimeDB extends Dexie {
  slices!: Table<ListeningRecord, string>
  constructor() { super('listening-time'); this.version(1).stores({ slices: '&id, owner, [owner+day]' }) }
}
export const listeningTimeDB = new ListeningTimeDB()

export function getListeningCategory(card: Pick<Card, 'level' | 'book'>): ListeningCategory | null {
  if (card.level === 'CET4') return 'cet4'
  if (card.level === 'CET6') return 'cet6'
  const book = { Book1: 'nce1', Book2: 'nce2', Book3: 'nce3', Book4: 'nce4' } as const
  return card.level === 'NCE' && card.book ? book[card.book] : null
}

export function splitListeningSlice(slice: ListeningSlice): ListeningRecord[] {
  if (!slice.id || !slice.owner || !LISTENING_CATEGORIES.some(c => c.id === slice.category) ||
    !Number.isFinite(slice.seconds) || slice.seconds <= 0 || !Number.isFinite(slice.startedAt) ||
    !Number.isFinite(slice.endedAt) || slice.endedAt <= slice.startedAt) throw new Error('听力记录数据不完整')
  const result: ListeningRecord[] = []
  let cursor = slice.startedAt
  while (cursor < slice.endedAt) {
    const next = new Date(cursor); next.setHours(24, 0, 0, 0)
    const end = Math.min(next.getTime(), slice.endedAt)
    const day = getLocalDateStr(new Date(cursor))
    result.push({ ...slice, id: `${slice.id}:${day}`, day, startedAt: cursor, endedAt: end,
      seconds: slice.seconds * ((end - cursor) / (slice.endedAt - slice.startedAt)) })
    cursor = end
  }
  return result
}

export async function saveListeningSlice(slice: ListeningSlice): Promise<void> {
  const records = splitListeningSlice(slice)
  await listeningTimeDB.transaction('rw', listeningTimeDB.slices, async () => {
    for (const record of records) await listeningTimeDB.slices.put(record)
  })
}
export function readListeningSlices(owner: string): Promise<ListeningRecord[]> {
  return listeningTimeDB.slices.where('owner').equals(owner).toArray()
}
export function clearListeningTime(owner: string): Promise<number> {
  return listeningTimeDB.slices.where('owner').equals(owner).delete()
}
export function summarizeListeningTime(records: ListeningRecord[], startDay = '', endDay = '9999-12-31') {
  const categories = Object.fromEntries(LISTENING_CATEGORIES.map(c => [c.id, 0])) as Record<ListeningCategory, number>
  for (const record of records) {
    if (record.day >= startDay && record.day <= endDay) categories[record.category] += record.seconds
  }
  return { categories, total: Object.values(categories).reduce((a, b) => a + b, 0) }
}
export function formatListeningTime(seconds: number): string {
  const total = Math.floor(seconds)
  if (total < 60) return `${total} 秒`
  if (total < 3600) return `${Math.floor(total / 60)} 分 ${total % 60} 秒`
  return `${Math.floor(total / 3600)} 小时 ${Math.floor(total % 3600 / 60)} 分`
}
