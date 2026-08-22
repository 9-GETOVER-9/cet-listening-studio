import { describe, expect, it } from 'vitest'

import { ACTIVE_THEME } from './theme'

describe('theme configuration', () => {
  it('ships Quiet Studio as the public default', () => {
    expect(ACTIVE_THEME).toBe('quiet-studio')
  })
})
