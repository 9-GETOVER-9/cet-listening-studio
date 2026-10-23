import { validateWeights, type OptimizationScope } from './fsrsOptimization'

export interface PersonalParameters { model: 'FSRS-6'; weights: number[]; savedAt: number }
const prefix = 'fsrs-personal-v1:'
let currentOwner: string | undefined
export const getFSRSOwner = () => currentOwner
function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('fsrs-parameters-changed'))
}
export function setFSRSOwner(owner: string | undefined) {
  if (currentOwner === owner) return
  currentOwner = owner; notify()
}
const key = (owner: string, scope: OptimizationScope) => prefix + JSON.stringify([owner, scope])

export function getPersonalParameters(owner: string | undefined, scope: OptimizationScope): PersonalParameters | null {
  if (!owner || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key(owner, scope))
    if (!raw) return null
    const value = JSON.parse(raw) as PersonalParameters
    return value?.model === 'FSRS-6' && validateWeights(value.weights) && Number.isFinite(value.savedAt) ? value : null
  } catch { return null }
}
export function savePersonalParameters(owner: string, scope: OptimizationScope, weights: number[]) {
  if (!owner || !validateWeights(weights)) throw new Error('FSRS-6 参数无效')
  // setItem is atomic; no in-memory activation before persistence succeeds.
  localStorage.setItem(key(owner, scope), JSON.stringify({ model: 'FSRS-6', weights, savedAt: Date.now() }))
  notify()
}
export function resetPersonalParameters(owner: string, scope: OptimizationScope) {
  localStorage.removeItem(key(owner, scope))
  notify()
}
export function clearPersonalParameters() {
  if (typeof localStorage === 'undefined') return
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const name = localStorage.key(i)
    if (name?.startsWith(prefix)) localStorage.removeItem(name)
  }
  notify()
}
