import { useSyncExternalStore } from 'react'
import { getFSRSOwner, getPersonalParameters } from '@/lib/fsrsPreferences'
import type { OptimizationScope } from '@/lib/fsrsOptimization'

function subscribe(changed: () => void) {
  window.addEventListener('storage', changed)
  window.addEventListener('fsrs-parameters-changed', changed)
  return () => {
    window.removeEventListener('storage', changed)
    window.removeEventListener('fsrs-parameters-changed', changed)
  }
}
export function useFSRSParameterKey(scope: OptimizationScope = 'main', owner?: string) {
  return useSyncExternalStore(subscribe, () =>
    JSON.stringify([owner ?? getFSRSOwner(), getPersonalParameters(owner ?? getFSRSOwner(), scope)]), () => '')
}
