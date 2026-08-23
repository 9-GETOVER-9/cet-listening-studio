const LIFETIME_PRO_EMAILS = ['2118645938@qq.com']

interface MembershipInput {
  email?: string | null
  profileIsPro: boolean
  profileExpiresAt: string | null
}

export function isLifetimeProEmail(email?: string | null): boolean {
  const normalizedEmail = email?.trim().toLowerCase() ?? ''
  return LIFETIME_PRO_EMAILS.includes(normalizedEmail)
}

export function resolveMembership({
  email,
  profileIsPro,
  profileExpiresAt,
}: MembershipInput): { isPro: boolean; proExpiresAt: number | null } {
  if (isLifetimeProEmail(email)) {
    return { isPro: true, proExpiresAt: null }
  }

  return {
    isPro: profileIsPro,
    proExpiresAt: profileExpiresAt ? new Date(profileExpiresAt).getTime() : null,
  }
}

export function shouldShowProReminder({
  isGuestTrial,
  isPro,
  proDaysLeft,
  proExpiresAt,
}: {
  isGuestTrial: boolean
  isPro: boolean
  proDaysLeft: number
  proExpiresAt: number | null
}): boolean {
  if (isGuestTrial || proExpiresAt === null) return false
  return !isPro || proDaysLeft <= 7
}
