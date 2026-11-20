import waves from './readingMatchWaves.json'
import { isRetiredMatchGroup } from './readingMatchReview'

export const matchWaves: { id: string; coreWord?: string; words: string[]; meaning: string }[][] = waves
export const matchStorageKey = (owner: string) => `ielts-reading-match-v2:${owner}`

export function migrateMatchRound<T extends { wave: number; order: string[]; cleared: string[]; score: number; missed?: string[] }>(round: T): T {
  const retiredTile = (id: string) => isRetiredMatchGroup(id.split(':')[0])
  if (round.wave >= 4 || !round.order.some(retiredTile)) return round
  const order = round.order.filter(id => !retiredTile(id))
  const cleared = round.cleared.filter(id => !isRetiredMatchGroup(id))
  return {
    ...round,
    order: [...order, ...waveTiles(round.wave).map(tile => tile.id).filter(id => !order.includes(id))],
    cleared,
    missed: round.missed?.filter(id => !isRetiredMatchGroup(id)),
    score: Math.max(0, round.score - 100 * (round.cleared.length - cleared.length)),
  }
}

export function matchRelationNote(coreWord?: string) {
  switch (coreWord) {
    case 'and': return '并列结构：这些表达用于连接或补充信息，需结合句式判断。'
    case 'rather than': return '转折与对比结构：表达的逻辑作用相近，不能逐词互换。'
    case 'thanks to': return '因果结构：注意表达连接的是原因还是结果，以及它的语气。'
    case 'that': return '指代关系：要结合上下文判断代词指向什么。'
    case 'fertiliser': return '真题语境对应：这些词在相关语境中可作为线索，不是 fertiliser 的同义词。'
    case 'exchange': return '真题语境对应：这些表达需结合原句判断，不能直接互换。'
    case 'principle':
    case 'potential': return '原书转录的对应栏有粘连，当前拆分待原页核实。'
    default: return ''
  }
}

export function hasMatchProgress(owner: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(matchStorageKey(owner)) ?? 'null')
    const wave = matchWaves[saved?.round?.wave]
    return Boolean(wave && migrateMatchRound(saved.round).cleared.length < wave.length)
  } catch {
    return false
  }
}

export type Tile = { id: string; group: string; text: string; core: boolean }

export function waveTiles(wave: number): Tile[] {
  return matchWaves[wave].flatMap(group => group.words.map((text, index) => ({
    id: `${group.id}:${index}`, group: group.id, text, core: group.coreWord === text,
  })))
}

export function checkSelection(tiles: Tile[], selected: string[]) {
  const group = tiles.find(tile => tile.id === selected[0])?.group
  if (!group || selected.some(id => !tiles.some(tile => tile.id === id && tile.group === group))) return 'wrong'
  return tiles.every(tile => tile.group !== group || selected.includes(tile.id)) ? 'complete' : 'partial'
}
