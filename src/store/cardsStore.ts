import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CardsStore {
  // 当前模块
  currentModuleId: string | null
  // 当前卡片索引
  currentCardIndex: number
  // 是否已翻转
  isFlipped: boolean
  // 复习模式
  isReviewMode: boolean

  // Actions
  setModule: (moduleId: string) => void
  setFlipped: (v: boolean) => void
  nextCard: () => void
  prevCard: () => void
  goToCard: (index: number) => void
  toggleFlipped: () => void
  setReviewMode: (v: boolean) => void
  reset: () => void
}

export const useCardsStore = create<CardsStore>()(
  persist(
    (set) => ({
      currentModuleId: null,
      currentCardIndex: 0,
      isFlipped: false,
      isReviewMode: false,

      setModule: (moduleId) =>
        set({
          currentModuleId: moduleId,
          currentCardIndex: 0,
          isFlipped: false,
          isReviewMode: false,
        }),

      setFlipped: (v) => set({ isFlipped: v }),

      nextCard: () =>
        set((s) => ({
          currentCardIndex: s.currentCardIndex + 1,
          isFlipped: false,
        })),

      prevCard: () =>
        set((s) => ({
          currentCardIndex: Math.max(0, s.currentCardIndex - 1),
          isFlipped: false,
        })),

      goToCard: (index) =>
        set({
          currentCardIndex: index,
          isFlipped: false,
        }),

      toggleFlipped: () => set((s) => ({ isFlipped: !s.isFlipped })),

      setReviewMode: (v) => set({ isReviewMode: v }),

      reset: () =>
        set({
          currentModuleId: null,
          currentCardIndex: 0,
          isFlipped: false,
          isReviewMode: false,
        }),
    }),
    {
      name: 'cet-cards-store',
      partialize: (state) => ({
        // 只持久化部分状态
        currentModuleId: state.currentModuleId,
        currentCardIndex: state.currentCardIndex,
        isReviewMode: state.isReviewMode,
      }),
    }
  )
)
