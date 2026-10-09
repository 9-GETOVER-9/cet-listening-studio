import { describe, expect, it } from 'vitest'

import { NAV_ITEMS } from '@/config/navigation'

describe('Quiet Studio navigation', () => {
  it('keeps every primary destination available', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      '首页',
      '四六级',
      '新概念',
      '雅思',
      '综合复习',
      '难点本',
      '我的',
    ])
  })

  it('keeps every primary destination in the mobile navigation', () => {
    expect(NAV_ITEMS.filter((item) => item.mobile).map((item) => item.to)).toEqual([
      '/',
      '/cet',
      '/nce',
      '/ielts',
      '/review',
      '/notebook',
      '/profile',
    ])
  })
})
