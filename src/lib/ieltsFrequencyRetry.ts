import { dictationReducer, emptyDictation, type DictationAction, type DictationState } from './ieltsDictation'
import type { FrequencyReason } from './ieltsFrequencyProgress'

export interface FrequencyRetryState extends DictationState {
  frequencyMode: boolean
  firstAttempt: { answer: string; passed: boolean } | null
}
export type FrequencyRetryAction = DictationAction | { type: 'retry' } | { type: 'start'; queue: string[]; frequencyMode: boolean }
export const emptyFrequencyRetry: FrequencyRetryState = { ...emptyDictation, frequencyMode: false, firstAttempt: null }
export function frequencyRetryReducer(state: FrequencyRetryState, action: FrequencyRetryAction): FrequencyRetryState {
  if (action.type === 'start') return { ...emptyFrequencyRetry, queue: action.queue,
    frequencyMode: 'frequencyMode' in action ? action.frequencyMode : state.frequencyMode }
  if (state.finished) return state
  if (!state.frequencyMode) return action.type === 'retry' ? state : dictationReducer(state, action) as FrequencyRetryState
  if (action.type === 'retry') return state.verdict === false ? { ...state, draft: '', verdict: null } : state
  if (action.type === 'check') {
    if (state.verdict !== null || !state.queue[state.results.length]) return state
    return { ...state, draft: action.answer, verdict: action.correct,
      firstAttempt: state.firstAttempt ?? { answer: action.answer, passed: action.correct } }
  }
  if (action.type === 'confirm') {
    if (state.verdict !== true || !state.firstAttempt || action.id !== state.queue[state.results.length]) return state
    const results = [...state.results, { id: action.id, ...state.firstAttempt }]
    return { ...state, results, firstAttempt: null, draft: '', verdict: null, finished: results.length === state.queue.length }
  }
  return dictationReducer(state, action) as FrequencyRetryState
}
export interface FrequencyKey {
  key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean
  repeat: boolean; isComposing: boolean; keyCode: number
  targetTagName?: string; targetIsContentEditable?: boolean; answerInput?: boolean; targetIsAuxiliaryControl?: boolean
}
export type FrequencyShortcut = { type: 'enter' } | { type: 'reason'; reason: Exclude<FrequencyReason, null> }
export function parseFrequencyShortcut(event: FrequencyKey): FrequencyShortcut | null {
  if (event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.metaKey || event.shiftKey) return null
  if (event.ctrlKey) {
    const reason = ({ '1': 'pronunciation', '2': 'spelling', '3': 'both' } as const)[event.key as '1' | '2' | '3']
    return reason ? { type: 'reason', reason } : null
  }
  if (event.key !== 'Enter' || event.targetIsAuxiliaryControl || event.targetIsContentEditable || ['TEXTAREA', 'SELECT'].includes(event.targetTagName ?? '')
    || (event.targetTagName === 'INPUT' && !event.answerInput)) return null
  return { type: 'enter' }
}
