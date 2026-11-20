import { expect, it } from 'vitest'
import { checkSelection, matchWaves, migrateMatchRound, waveTiles } from './readingMatch'

it('uses the source group in wave two and preserves unrelated progress', () => {
  expect(matchWaves[1].find(group => group.id === 'example-original')?.words).toEqual(['original', 'initial', 'first'])
  expect(matchWaves.flat().find(group => group.coreWord === 'fundamental')?.words).toEqual(['fundamental', 'rudimentary', 'preliminary', 'basic'])
  const old = { wave: 1, order: ['assess:0', 'early:0'], cleared: ['assess', 'early'], score: 200, missed: ['early', 'assess'] }
  expect(migrateMatchRound(old)).toEqual({ wave: 1, order: ['assess:0', 'example-original:0'], cleared: ['assess'], score: 100, missed: ['assess'] })
})

it('preserves all reference waves and avoids duplicate labels within a wave', () => {
  expect(matchWaves).toHaveLength(84)
  expect(matchWaves.slice(5).flat()).toHaveLength(376)
  for (const [wave] of matchWaves.entries()) {
    const tiles = waveTiles(wave)
    expect(new Set(tiles.map(tile => tile.id)).size).toBe(tiles.length)
    expect(new Set(tiles.map(tile => tile.text.trim().toLowerCase())).size).toBe(tiles.length)
  }
})

it('requires every tile in the group and rejects a tile from another group', () => {
  const tiles = waveTiles(0)
  const group = tiles.filter(tile => tile.group === tiles[0].group).map(tile => tile.id)
  const outsider = tiles.find(tile => tile.group !== tiles[0].group)!
  expect(checkSelection(tiles, group.slice(0, -1))).toBe('partial')
  expect(checkSelection(tiles, [...group.slice(0, -1), outsider.id])).toBe('wrong')
  expect(checkSelection(tiles, group)).toBe('complete')
})
