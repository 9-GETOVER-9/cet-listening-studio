const GUEST_TRIAL_KEY = 'cet-listening:guest-trial-started-at'
const DAY_MS = 24 * 60 * 60 * 1000

export const GUEST_TRIAL_DAYS = 1
export const REGISTERED_TRIAL_DAYS = 60

export function getGuestTrialStartedAt(): number {
  if (typeof window === 'undefined') return 0

  const stored = Number(window.localStorage.getItem(GUEST_TRIAL_KEY) ?? 0)
  if (stored > 0) return stored

  const startedAt = Date.now()
  window.localStorage.setItem(GUEST_TRIAL_KEY, String(startedAt))
  return startedAt
}

export function getGuestTrialExpiresAt(startedAt = getGuestTrialStartedAt()): number {
  return startedAt + GUEST_TRIAL_DAYS * DAY_MS
}

export function isGuestTrialActive(now = Date.now()): boolean {
  return getGuestTrialExpiresAt() > now
}

export function getGuestTrialDaysLeft(now = Date.now()): number {
  return Math.max(0, Math.ceil((getGuestTrialExpiresAt() - now) / DAY_MS))
}
