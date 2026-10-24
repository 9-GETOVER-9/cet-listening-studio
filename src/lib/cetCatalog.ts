import type { Module } from '@/types'

export const CET_CATALOG_BATCH_SIZE = 24
export interface CETCatalogFilters { level: string; examDate: string; section: string; type: string }
export interface CETCatalogState { filters: CETCatalogFilters; visibleCount: number }
export const initialCETCatalog: CETCatalogState = {
  filters: { level: 'all', examDate: 'all', section: 'all', type: 'all' },
  visibleCount: CET_CATALOG_BATCH_SIZE,
}
export type CETCatalogAction =
  | { type: 'filter'; key: keyof CETCatalogFilters; value: string }
  | { type: 'more'; total: number }
  | { type: 'reset' }

export function cetCatalogReducer(state: CETCatalogState, action: CETCatalogAction): CETCatalogState {
  if (action.type === 'reset') return initialCETCatalog
  if (action.type === 'filter') return state.filters[action.key] === action.value ? state : {
    filters: { ...state.filters, [action.key]: action.value }, visibleCount: CET_CATALOG_BATCH_SIZE,
  }
  return { ...state, visibleCount: Math.min(action.total, state.visibleCount + CET_CATALOG_BATCH_SIZE) }
}

export function filterCETCatalog(modules: Module[], filters: CETCatalogFilters): Module[] {
  return modules.filter(module =>
    (filters.level === 'all' || module.level === filters.level)
    && (filters.examDate === 'all' || module.examDate === filters.examDate)
    && (filters.section === 'all' || module.section === filters.section)
    && (filters.type === 'all' || module.type === filters.type))
}
