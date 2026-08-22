import { useCallback, useEffect, useState } from 'react'
import { getGuestTrialDaysLeft, getGuestTrialExpiresAt, isGuestTrialActive } from '@/lib/guestTrial'
import { getLocalDateStr } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'

export function usePro() {
  const isPro = useSettingsStore((state) => state.isPro)
  const proExpiresAt = useSettingsStore((state) => state.proExpiresAt)
  const aiCredits = useSettingsStore((state) => state.aiCredits)
  const lastCheckinDate = useSettingsStore((state) => state.lastCheckinDate)
  const myInviteCode = useSettingsStore((state) => state.myInviteCode)
  const usedInviteCodes = useSettingsStore((state) => state.usedInviteCodes)
  const currentUserId = useSettingsStore((state) => state.currentUserId)
  const checkMergeDailyReset = useSettingsStore((state) => state.checkMergeDailyReset)
  const signIn = useSettingsStore((state) => state.signIn)
  const consumeAiCredit = useSettingsStore((state) => state.useAiCount)
  const generateMyInviteCode = useSettingsStore((state) => state.generateMyInviteCode)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    checkMergeDailyReset()
  }, [checkMergeDailyReset])

  useEffect(() => {
    const updateNow = () => setNow(Date.now())
    updateNow()

    const timer = window.setInterval(updateNow, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const isAccountProActive = isPro && (proExpiresAt === null || proExpiresAt > now)
  const isGuestTrial = !currentUserId && isGuestTrialActive(now)
  const isProActive = isAccountProActive || isGuestTrial
  const isLifetimePro = isAccountProActive && proExpiresAt === null
  const accountProDaysLeft = proExpiresAt
    ? Math.max(0, Math.ceil((proExpiresAt - now) / (24 * 60 * 60 * 1000)))
    : 0
  const proDaysLeft = isAccountProActive ? accountProDaysLeft : getGuestTrialDaysLeft(now)

  const todaySignedIn = lastCheckinDate === getLocalDateStr()
  const canViewAi = isProActive || aiCredits > 0
  const aiRemaining = isProActive ? -1 : Math.max(0, aiCredits)

  const handleSignIn = useCallback(async () => {
    return signIn()
  }, [signIn])

  const consumeAi = useCallback(async () => {
    if (!canViewAi) return false
    return consumeAiCredit()
  }, [canViewAi, consumeAiCredit])

  const initInviteCode = useCallback((userId: string) => {
    generateMyInviteCode(userId)
  }, [generateMyInviteCode])

  return {
    isPro: isProActive,
    isProEver: isPro,
    isGuestTrial,
    isLifetimePro,
    proDaysLeft,
    proExpiresAt: isAccountProActive ? proExpiresAt : getGuestTrialExpiresAt(),
    canViewAi,
    aiRemaining,
    aiCredits,
    todaySignedIn,
    lastCheckinDate,
    handleSignIn,
    myInviteCode,
    invitedCount: usedInviteCodes.length,
    initInviteCode,
    consumeAi,
  }
}
