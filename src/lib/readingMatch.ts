import waves from './readingMatchWaves.json'

export const matchWaves: { id: string; coreWord?: string; words: string[]; meaning: string }[][] = waves
export const matchStorageKey = (owner: string) => `ielts-reading-match-v2:${owner}`

export function hasMatchProgress(owner: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(matchStorageKey(owner)) ?? 'null')
    const wave = matchWaves[saved?.round?.wave]
    return Boolean(wave && Array.isArray(saved.round.cleared) && saved.round.cleared.length < wave.length)
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
