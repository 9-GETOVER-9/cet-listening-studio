import { useEffect, useState } from 'react'
import { isDataInitialized } from '@/lib/dataLoader'
import { useSettingsStore } from '@/store/settingsStore'
import { InitLoader } from '@/components/InitLoader'
import { OnboardingGuide } from '@/components/OnboardingGuide'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { supabase } from '@/lib/supabase'

/**
 * App 初始化器
 * 检查数据是否已初始化，决定显示加载页或主应用
 */
export function AppInitializer() {
  const [appState, setAppState] = useState<'loading' | 'init' | 'ready'>('loading')

  const { onboardingCompleted, setInitialized, setOnboardingCompleted } = useSettingsStore()

  // 检查数据是否已初始化 + 恢复 auth session
  useEffect(() => {
    const checkInit = async () => {
      // 恢复 Supabase session
      await supabase.auth.getSession()

      const initialized = await isDataInitialized()
      if (initialized) {
        setAppState('ready')
        setInitialized(true)
      } else {
        setAppState('init')
      }
    }

    checkInit()
  }, [setInitialized])

  // 初始化完成回调
  const handleInitComplete = () => {
    setAppState('ready')
    setInitialized(true)
  }

  // 显示加载页
  if (appState === 'loading') {
    return <InitLoader onComplete={handleInitComplete} />
  }

  if (appState === 'init') {
    return <InitLoader onComplete={handleInitComplete} />
  }

  // 已初始化，显示主应用
  return (
    <>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-center" />
      </TooltipProvider>
      {!onboardingCompleted && (
        <OnboardingGuide onComplete={() => setOnboardingCompleted(true)} />
      )}
    </>
  )
}
