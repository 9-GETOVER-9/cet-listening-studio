import { describe, expect, it } from 'vitest'
import { resolveMembership, shouldShowProReminder } from './membershipPolicy'

describe('membership policy', () => {
  it('keeps a developer account on lifetime Pro even when the stored profile is expired', () => {
    expect(resolveMembership({
      email: '2118645938@qq.com',
      profileIsPro: false,
      profileExpiresAt: '2026-01-01T00:00:00.000Z',
    })).toEqual({ isPro: true, proExpiresAt: null })
  })

  it('preserves a regular lifetime membership from the profile', () => {
    expect(resolveMembership({
      email: 'member@example.com',
      profileIsPro: true,
      profileExpiresAt: null,
    })).toEqual({ isPro: true, proExpiresAt: null })
  })

  it('never shows an expiry reminder for a guest trial or lifetime membership', () => {
    expect(shouldShowProReminder({ isGuestTrial: true, isPro: true, proDaysLeft: 1, proExpiresAt: Date.now() })).toBe(false)
    expect(shouldShowProReminder({ isGuestTrial: false, isPro: true, proDaysLeft: 0, proExpiresAt: null })).toBe(false)
  })
})
