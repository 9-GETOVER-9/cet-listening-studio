import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsStore {
  // 用户昵称
  nickname: string
  // 播放速度
  playSpeed: number
  // 是否启用学习日志
  logEnabled: boolean
  // 是否已完成初始化
  initialized: boolean
  // 是否已完成首次引导
  onboardingCompleted: boolean
  // 是否为 PRO 会员
  isPro: boolean

  // Actions
  setNickname: (nickname: string) => void
  setPlaySpeed: (speed: number) => void
  setLogEnabled: (enabled: boolean) => void
  setInitialized: (v: boolean) => void
  setOnboardingCompleted: (v: boolean) => void
  setIsPro: (v: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      nickname: '',
      playSpeed: 1.0,
      logEnabled: true,
      initialized: false,
      onboardingCompleted: false,
      isPro: false,

      setNickname: (nickname) => set({ nickname }),
      setPlaySpeed: (playSpeed) => set({ playSpeed }),
      setLogEnabled: (logEnabled) => set({ logEnabled }),
      setInitialized: (initialized) => set({ initialized }),
      setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
      setIsPro: (isPro) => set({ isPro }),
    }),
    {
      name: 'cet-settings-store',
    }
  )
)
