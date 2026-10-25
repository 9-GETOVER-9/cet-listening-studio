import { describe, expect, it } from 'vitest'
import { isNavigationActive, isPracticePath, NAV_ITEMS } from '@/config/navigation'

describe('Learning navigation', () => {
  it('groups course destinations under one mobile entry', () => {
    expect(NAV_ITEMS.filter(item => item.mobile).map(item => item.to)).toEqual(['/', '/courses', '/review', '/notebook', '/profile'])
    for (const path of ['/cet', '/nce', '/nce/shadowing/lesson', '/ielts/listening', '/ielts/reading-538', '/walkman', '/card/test']) expect(isNavigationActive('/courses', path)).toBe(true)
    expect(isNavigationActive('/courses', '/notebook')).toBe(false)
    expect(isNavigationActive('/', '/courses')).toBe(false)
    expect(isNavigationActive('/profile', '/profile/stats')).toBe(true)
  })
  it('keeps the library navigable and frees the bottom controls during dedicated practice', () => {
    for (const path of ['/card/test', '/nce/shadowing/lesson', '/word-practice', '/notebook/review/phrase']) expect(isPracticePath(path)).toBe(true)
    for (const path of ['/', '/nce', '/ielts', '/profile', '/notebook', '/review']) expect(isPracticePath(path)).toBe(false)
  })
})
