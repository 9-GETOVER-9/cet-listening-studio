import { Suspense, useCallback, useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { ensureModuleStatsCache } from '@/db/crud'
import { InitLoader } from '@/components/InitLoader'
import { OnboardingGuide } from '@/components/OnboardingGuide'
import { RouteLoadingFallback } from '@/components/RouteErrorFallback'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { usePro } from '@/hooks/usePro'
import { useSessionGuard } from '@/hooks/useSessionGuard'
import {
  initializeModuleIndex,
  isDataInitialized,
  isModuleIndexInitialized,
  needsDataUpgrade,
  startBackgroundInit,
} from '@/lib/dataLoader'
import { syncLearningForCurrentUser } from '@/lib/learningSync'
import { supabase } from '@/lib/supabase'
import { signOutCurrentDevice } from '@/lib/sessionPolicy'
import { router } from '@/router'
import { useSettingsStore } from '@/store/settingsStore'
import { getListeningStorageError, retryListeningWrites, setListeningOwner } from '@/lib/audioTimeTracker'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

function runWhenIdle(task: () => void): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => task(), { timeout: 2000 })
    return
  }

  globalThis.setTimeout(task, 250)
}

export function AppInitializer() {
  const [appState, setAppState] = useState<'checking' | 'init' | 'ready'>('checking')
  const [initProgress, setInitProgress] = useState(0)
  const [initError, setInitError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const { onboardingCompleted, setInitialized, setOnboardingCompleted } = useSettingsStore()
  const { initInviteCode } = usePro()

  const handleSessionKicked = useCallback(async () => {
    toast.error('账号已在其他设备登录，当前设备已退出')
    await signOutCurrentDevice(supabase.auth)
    setCurrentUserId(null)
    window.location.href = '/login'
  }, [])

  useSessionGuard(currentUserId, handleSessionKicked)

  useEffect(() => {
    const notify = () => {
      if (getListeningStorageError()) toast.error('听力时长暂未保存，请保持页面打开后重试', {
        id: 'listening-time-storage', action: { label: '重试', onClick: retryListeningWrites },
      })
      else toast.dismiss('listening-time-storage')
    }
    window.addEventListener('listening-time-storage', notify)
    return () => window.removeEventListener('listening-time-storage', notify)
  }, [])

  useEffect(() => {
    let session: Session | null = null
    let cancelled = false

    const finishReadyState = (fullDataReady: boolean) => {
      if (cancelled) return

      setAppState('ready')
      setInitialized(fullDataReady)

      runWhenIdle(() => {
        void ensureModuleStatsCache().catch((err) => {
          console.warn('Module stats cache sync failed:', err)
        })
      })

      if (session?.user) {
        runWhenIdle(() => {
          void syncLearningForCurrentUser().catch((err) => {
            console.warn('Learning progress sync failed:', err)
          })
        })
      }
    }

    const runFullDataInit = (blockReady: boolean) => {
      if (blockReady) {
        setAppState('init')
        setInitProgress(1)
        setInitError(null)
      }

      startBackgroundInit((loaded) => {
        if (blockReady && !cancelled) setInitProgress(loaded)
      }).then(() => {
        if (cancelled) return

        if (blockReady) {
          setInitProgress(100)
          setTimeout(() => finishReadyState(true), 600)
          return
        }
        setInitialized(true)
      }).catch((err) => {
        console.error('Background init failed:', err)
        if (blockReady && !cancelled) {
          setInitError(err instanceof Error ? err.message : '初始化失败')
        }
        toast.error('听力材料加载失败，请刷新页面重试')
      })
    }

    const enterWithModuleIndex = async () => {
      setAppState('init')
      setInitProgress(1)
      setInitError(null)

      try {
        await initializeModuleIndex((loaded, total) => {
          if (!cancelled) setInitProgress(Math.round((loaded / total) * 100))
        })
      } catch (err) {
        console.warn('Module index init failed, falling back to full import:', err)
        runFullDataInit(true)
        return
      }

      finishReadyState(false)
      runFullDataInit(false)
    }

    const restoreSession = async () => {
      try {
        const result = await withTimeout(supabase.auth.getSession(), 5000)
        if (!result) return

        session = result.data.session ?? null
        setListeningOwner(session?.user.id ?? 'guest')

        if (session?.user) {
          setCurrentUserId(session.user.id)
          initInviteCode(session.user.id)
          void withTimeout(
            useSettingsStore.getState().loadUserState(session.user.id, Boolean(session.user.email_confirmed_at), session.user.email),
            5000,
          ).catch(() => {})
        } else {
          const settings = useSettingsStore.getState()
          settings.setCurrentUserId('')
          settings.setIsPro(false)
        }
      } catch (err) {
        console.warn('Session restore failed, continuing without auth:', err)
      }
    }

    const checkInit = async () => {
      await restoreSession()

      const hasFullData = await isDataInitialized()
      if (hasFullData) {
        const upgradeNeeded = await needsDataUpgrade()
        if (!upgradeNeeded) {
          finishReadyState(true)
          return
        }
      }

      if (await isModuleIndexInitialized()) {
        finishReadyState(false)
        runFullDataInit(false)
        return
      }

      await enterWithModuleIndex()
    }

    void checkInit()

    return () => {
      cancelled = true
    }
  }, [setInitialized, initInviteCode])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setListeningOwner(session?.user.id ?? 'guest')
      if (session?.user) {
        setCurrentUserId(session.user.id)
        initInviteCode(session.user.id)

        window.setTimeout(() => {
          void useSettingsStore.getState()
            .loadUserState(session.user.id, Boolean(session.user.email_confirmed_at), session.user.email)
            .catch((error) => {
              console.warn('User state sync after auth change failed:', error)
            })

          runWhenIdle(() => {
            void syncLearningForCurrentUser().catch((error) => {
              console.warn('Learning progress sync after auth change failed:', error)
            })
          })
        }, 0)
      } else {
        setCurrentUserId(null)
        const settings = useSettingsStore.getState()
        settings.setCurrentUserId('')
        settings.setIsPro(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [initInviteCode])

  useEffect(() => {
    const syncLearningProgress = () => {
      void syncLearningForCurrentUser().catch((error) => {
        console.warn('Learning progress sync after reconnect failed:', error)
      })
    }
    window.addEventListener('online', syncLearningProgress)
    return () => window.removeEventListener('online', syncLearningProgress)
  }, [])

  if (appState === 'checking') {
    return (
      <InitLoader
        autoStart={false}
        progress={0}
        onComplete={() => {}}
      />
    )
  }

  if (appState === 'init') {
    return (
      <InitLoader
        autoStart={false}
        progress={initProgress}
        error={initError}
        onComplete={() => {
          setAppState('ready')
          setInitialized(false)
        }}
      />
    )
  }

  return (
    <>
      <TooltipProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster position="bottom-center" />
      </TooltipProvider>
      {!onboardingCompleted && (
        <OnboardingGuide onComplete={() => setOnboardingCompleted(true)} />
      )}
    </>
  )
}
