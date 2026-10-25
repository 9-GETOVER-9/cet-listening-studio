import { describe, expect, it } from 'vitest'
import type { Module } from '@/types'
import { cetCatalogReducer, filterCETCatalog, sortCETCatalog, initialCETCatalog } from './cetCatalog'

const modules: Module[] = Array.from({ length: 575 }, (_, index) => ({
  moduleId: `module-${index}`, title: `Module ${index}`, level: index % 2 ? 'CET6' : 'CET4',
  examDate: index % 3 ? '2024.12.01' : '2016.06.01', section: index % 2 ? 'B' : 'A',
  type: index % 2 ? 'conversation' : 'news', totalCards: 20, studiedCards: index % 10, difficulty: 'medium',
}))

describe('CET catalog progressive display', () => {
  it('bounds the initial render but retains every module and the original order across loading', () => {
    const matches = filterCETCatalog(modules, initialCETCatalog.filters)
    let state = initialCETCatalog
    expect(matches).toHaveLength(575)
    expect(matches.slice(0, state.visibleCount)).toHaveLength(24)
    state = cetCatalogReducer(state, { type: 'more', total: matches.length })
    expect(matches.slice(0, state.visibleCount)).toEqual(modules.slice(0, 48))
    while (state.visibleCount < matches.length) state = cetCatalogReducer(state, { type: 'more', total: matches.length })
    expect(state.visibleCount).toBe(575)
    expect(matches.slice(0, state.visibleCount)).toEqual(modules)
    expect(cetCatalogReducer(state, { type: 'more', total: 575 }).visibleCount).toBe(575)
  })

  it('resets expansion when a filter changes, including when returning to the full catalog', () => {
    let state = cetCatalogReducer(initialCETCatalog, { type: 'more', total: 575 })
    for (const [key, value] of [['level', 'CET4'], ['examDate', '2016.06.01'], ['section', 'A'], ['type', 'news']] as const) {
      state = cetCatalogReducer(state, { type: 'filter', key, value })
      expect(state.visibleCount).toBe(24)
      state = cetCatalogReducer(state, { type: 'more', total: filterCETCatalog(modules, state.filters).length })
      expect(state.visibleCount).toBe(48)
    }
    const matches = filterCETCatalog(modules, state.filters)
    expect(matches.length).toBeGreaterThan(48)
    expect(matches.every(module => module.level === 'CET4' && module.examDate === '2016.06.01' && module.section === 'A' && module.type === 'news')).toBe(true)
    expect(matches.map(module => module.moduleId)).toEqual(modules.filter((_, index) => index % 6 === 0).map(module => module.moduleId))
    state = cetCatalogReducer(state, { type: 'reset' })
    expect(state.visibleCount).toBe(24)
    expect(filterCETCatalog(modules, state.filters)).toHaveLength(575)
  })

  it('handles short and empty result sets without losing the remaining items', () => {
    expect(cetCatalogReducer(initialCETCatalog, { type: 'more', total: 25 }).visibleCount).toBe(25)
    expect(cetCatalogReducer(initialCETCatalog, { type: 'more', total: 0 }).visibleCount).toBe(0)
    const empty = cetCatalogReducer(initialCETCatalog, { type: 'filter', key: 'examDate', value: 'unavailable' })
    expect(filterCETCatalog(modules, empty.filters)).toEqual([])
    expect(modules).toHaveLength(575)
  })
})

describe('CET chronology', () => {
  it('orders newest or oldest first without mutating query results or losing filtered rows', () => {
    const original = [...modules]
    const latest = sortCETCatalog(modules, 'latest')
    expect(latest[0].examDate).toBe('2024.12.01')
    expect(latest.at(-1)?.examDate).toBe('2016.06.01')
    expect(sortCETCatalog(modules, 'oldest')[0].examDate).toBe('2016.06.01')
    expect(modules).toEqual(original)
    expect(new Set(latest.map(module => module.moduleId))).toEqual(new Set(modules.map(module => module.moduleId)))
    const filtered = filterCETCatalog(modules, { ...initialCETCatalog.filters, level: 'CET6' })
    expect(sortCETCatalog(filtered, 'latest')).toHaveLength(filtered.length)
  })
})
