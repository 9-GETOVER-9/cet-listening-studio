import { describe, expect, it } from 'vitest'

import { shouldActivateRating } from '@/lib/ratingActivation'

describe('shouldActivateRating', () => {
  it('does not activate a rating on pointer down', () => {
    expect(shouldActivateRating('pointerdown')).toBe(false)
  })

  it('activates a rating on a completed click', () => {
    expect(shouldActivateRating('click')).toBe(true)
  })
})
