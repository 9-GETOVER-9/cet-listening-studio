import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { REGISTERED_TRIAL_DAYS } from '@/lib/guestTrial'
import { getLocalDateStr, getYesterdayStr } from '@/lib/utils'

const DEVELOPER_EMAILS = ['2118645938@qq.com']

interface SettingsStore {
  nickname: string
  playSpeed: number
  logEnabled: boolean
  initialized: boolean
  onboardingCompleted: boolean
  isPro: boolean
  proExpiresAt: number | null

  // AI次数：从Supabase同步过来的本地缓存
  aiCredits: number
  // 签到日期：从Supabase同步过来的本地缓存（格式 'YYYY-MM-DD'）
  lastCheckinDate: string
  // 连续签到天数
  consecutiveDays: number
  // 当前登录用户id，用于区分不同账号
  currentUserId: string

  mergeCount: number
  mergeLastResetDate: string

  usedInviteCodes: string[]
  myInviteCode: string

  setNickname: (nickname: string) => void
  setPlaySpeed: (speed: number) => void
  setLogEnabled: (enabled: boolean) => void
  setInitialized: (v: boolean) => void
  setOnboardingCompleted: (v: boolean) => void
  setIsPro: (v: boolean, expiresAt?: number | null) => void
  setCurrentUserId: (userId: string) => void
  addProDays: (days: number) => void

  // 从Supabase加载当前用户的签到/AI次数状态
  loadUserState: (userId: string, emailConfirmed?: boolean) => Promise<void>
  // 签到（写入Supabase）
  signIn: () => Promise<{ success: boolean; message: string; bonus: number }>
  // 消耗AI次数（写入Supabase）
  useAiCount: () => Promise<boolean>

  useMergeCount: () => boolean
  checkMergeDailyReset: () => void

  useInviteCode: (code: string) => void
  generateMyInviteCode: (userId: string) => void
  checkDeveloperPro: (email: string) => void
}

function getTodayStr(): string {
  return getLocalDateStr()
}

const FREE_MERGE_DAILY = 3
const CHECKIN_CREDITS = 5
const NEW_USER_TRIAL_DAYS = REGISTERED_TRIAL_DAYS

type ProfileState = {
  ai_credits: number | null
  last_checkin_date: string | null
  consecutive_days: number | null
  is_pro: boolean | null
  pro_expires_at: string | null
  trial_started_at: string | null
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      nickname: '',
      playSpeed: 1.0,
      logEnabled: true,
      initialized: false,
      onboardingCompleted: false,
      isPro: false,
      proExpiresAt: null,

      aiCredits: 0,
      lastCheckinDate: '',
      consecutiveDays: 0,
      currentUserId: '',

      mergeCount: FREE_MERGE_DAILY,
      mergeLastResetDate: '',

      usedInviteCodes: [],
      myInviteCode: '',

      setNickname: (nickname) => set({ nickname }),
      setPlaySpeed: (playSpeed) => set({ playSpeed }),
      setLogEnabled: (logEnabled) => set({ logEnabled }),
      setInitialized: (initialized) => set({ initialized }),
      setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
      setIsPro: (isPro, expiresAt = null) => set({ isPro, proExpiresAt: expiresAt }),
      setCurrentUserId: (currentUserId) => set({ currentUserId }),

      addProDays: (days) => {
        const state = get()
        const now = Date.now()
        const currentExpiry = state.proExpiresAt || now
        const newExpiry = Math.max(currentExpiry, now) + days * 24 * 60 * 60 * 1000
        set({ isPro: true, proExpiresAt: newExpiry })
      },

      // 切换账号时调用：从Supabase读取该用户的签到状态和AI次数
      loadUserState: async (userId: string, emailConfirmed = false) => {
        const state = get()
        if (state.currentUserId !== userId) {
          set({ aiCredits: 0, lastCheckinDate: '', consecutiveDays: 0, currentUserId: userId })
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('ai_credits, last_checkin_date, consecutive_days, is_pro, pro_expires_at, trial_started_at')
          .eq('id', userId)
          .maybeSingle()

        let profile = data as ProfileState | null

        if (!profile && !error) {
          const trialStartedAt = emailConfirmed ? new Date() : null
          const trialExpiresAt = trialStartedAt
            ? new Date(trialStartedAt.getTime() + NEW_USER_TRIAL_DAYS * 24 * 60 * 60 * 1000)
            : null

          const { data: createdProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              ai_credits: 0,
              last_checkin_date: null,
              consecutive_days: 0,
              is_pro: Boolean(trialStartedAt),
              pro_expires_at: trialExpiresAt?.toISOString() ?? null,
              trial_started_at: trialStartedAt?.toISOString() ?? null,
            })
            .select('ai_credits, last_checkin_date, consecutive_days, is_pro, pro_expires_at, trial_started_at')
            .single()

          if (!createError) {
            profile = createdProfile as ProfileState
          }
        }

        if (error || !profile) return

        let isPro = profile.is_pro ?? false
        let proExpiresAt = profile.pro_expires_at

        if (emailConfirmed && !profile.trial_started_at) {
          const trialStartedAt = new Date()
          const trialExpiresAt = new Date(trialStartedAt.getTime() + NEW_USER_TRIAL_DAYS * 24 * 60 * 60 * 1000)

          const { data: trialData, error: trialError } = await supabase
            .from('profiles')
            .update({
              trial_started_at: trialStartedAt.toISOString(),
              is_pro: true,
              pro_expires_at: trialExpiresAt.toISOString(),
            })
            .eq('id', userId)
            .is('trial_started_at', null)
            .select('is_pro, pro_expires_at')
            .maybeSingle()

          if (!trialError && trialData) {
            isPro = trialData.is_pro ?? true
            proExpiresAt = trialData.pro_expires_at
          }
        }

        set({
          aiCredits: profile.ai_credits ?? 0,
          lastCheckinDate: profile.last_checkin_date ?? '',
          consecutiveDays: profile.consecutive_days ?? 0,
          currentUserId: userId,
          isPro,
          proExpiresAt: proExpiresAt
            ? new Date(proExpiresAt).getTime()
            : null,
        })
      },

      // 签到：连续签到奖励递增，写入Supabase
      signIn: async () => {
        const state = get()
        const today = getTodayStr()

        if (state.lastCheckinDate === today) {
          return { success: false, message: '今天已签到', bonus: 0 }
        }

        // 计算连续天数：昨天签过则+1，否则从1开始
        const yesterday = getYesterdayStr()
        const newConsecutiveDays = state.lastCheckinDate === yesterday
          ? state.consecutiveDays + 1
          : 1

        // 连续签到奖励阶梯
        const bonusTiers: [number, number, string][] = [
          [30, 50, '\u{1F3C6} 连续 30 天！奖励 +50 次'],
          [14, 30, '\u{1F48E} 连续 14 天！奖励 +30 次'],
          [7, 20, '⭐ 连续 7 天！奖励 +20 次'],
          [3, 10, '\u{1F525} 连续 3 天！奖励 +10 次'],
          [1, 5, '\u{1F381} 签到成功 +5 次'],
        ]

        const tier = bonusTiers.find(([days]) => newConsecutiveDays >= days)
        const bonus = tier ? tier[1] : CHECKIN_CREDITS
        const message = tier ? tier[2] : `\u{1F381} 签到成功 +${bonus} 次`

        const newCredits = state.aiCredits + bonus

        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: state.currentUserId,
            ai_credits: newCredits,
            last_checkin_date: today,
            consecutive_days: newConsecutiveDays,
          }, { onConflict: 'id' })

        if (error) {
          console.error('签到写入失败', error)
          return { success: false, message: '签到失败，请重试', bonus: 0 }
        }

        set({ aiCredits: newCredits, lastCheckinDate: today, consecutiveDays: newConsecutiveDays })
        return { success: true, message, bonus }
      },

      // 消耗AI次数：本地-1，同步写Supabase
      useAiCount: async () => {
        const state = get()
        const isProActive = state.isPro && (state.proExpiresAt === null || state.proExpiresAt > Date.now())
        if (isProActive) return true
        if (state.aiCredits <= 0) return false

        const newCredits = state.aiCredits - 1
        set({ aiCredits: newCredits })

        // 异步写Supabase，失败不影响本地使用体验
        supabase
          .from('profiles')
          .update({ ai_credits: newCredits })
          .eq('id', state.currentUserId)
          .then(({ error }) => {
            if (error) console.error('AI次数同步失败', error)
          })

        return true
      },

      useMergeCount: () => {
        const state = get()
        const isProActive = state.isPro && (state.proExpiresAt === null || state.proExpiresAt > Date.now())
        if (isProActive) return true
        if (state.mergeCount <= 0) return false
        set({ mergeCount: state.mergeCount - 1 })
        return true
      },

      checkMergeDailyReset: () => {
        const state = get()
        const today = getTodayStr()
        if (state.mergeLastResetDate !== today) {
          set({ mergeCount: FREE_MERGE_DAILY, mergeLastResetDate: today })
        }
      },

      useInviteCode: (code) => {
        const state = get()
        if (state.usedInviteCodes.includes(code)) return
        set({ usedInviteCodes: [...state.usedInviteCodes, code] })
      },

      generateMyInviteCode: (userId) => {
        const state = get()
        if (state.myInviteCode) return
        const code = 'CET' + userId.slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
        set({ myInviteCode: code })
      },

      checkDeveloperPro: (email) => {
        const normalizedEmail = email.toLowerCase().trim()
        if (DEVELOPER_EMAILS.includes(normalizedEmail)) {
          set({ isPro: true, proExpiresAt: null })
        }
      },
    }),
    { name: 'cet-settings-store' }
  )
)
