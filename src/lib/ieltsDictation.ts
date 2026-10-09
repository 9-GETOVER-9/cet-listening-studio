export interface DictationResult { id: string; answer: string; passed: boolean }
export interface DictationState { queue: string[]; results: DictationResult[]; draft: string; verdict: boolean | null; finished: boolean }
export type IELTSBook = 'wanglu' | 'frequency' | 'network' | 'personal'
export interface IELTSCard { id: string; chapter: number; section: string; word: string; answers: string[]; audio: string; chinese?: string; chineseAudio?: string; sourceBook?: Exclude<IELTSBook, 'personal'>; sourceLabel?: string; chapters?: number[] }
export interface IELTSTrack { id: string; chapter: number; start: number; end: number; label: string; cardIds: string[]; audio: string }
export interface IELTSCorpus { version: string; source: string; cards: IELTSCard[]; tracks?: IELTSTrack[]; pauseAfterEnglishMs?: number; translationNote?: string; groupLabels?: Record<number, string>; chineseVoice?: { provider: string; speaker: string; name: string } }
export type DictationAction =
  | { type: 'check'; answer: string; correct: boolean }
  | { type: 'confirm'; id: string; passed: boolean }
  | { type: 'start'; queue: string[] }
  | { type: 'input'; value: string }
  | { type: 'finish' }

export const emptyDictation: DictationState = { queue: [], results: [], draft: '', verdict: null, finished: false }

function normalizeSpelling(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑–]/g, '-')
    .trim().replace(/[.!?。！？，,;；:：]+$/g, '').trim().replace(/\s+/g, ' ')
}

export function checkSpelling(input: string, answers: string[]): boolean {
  const normalized = normalizeSpelling(input)
  return normalized.length > 0 && answers.some(answer => normalizeSpelling(answer) === normalized)
}

export function dictationReducer(state: DictationState, action: DictationAction): DictationState {
  if (action.type === 'start') return { ...emptyDictation, queue: action.queue }
  if (state.finished) return state
  if (action.type === 'finish') return { ...state, finished: true }
  if (action.type === 'input') return state.verdict === null ? { ...state, draft: action.value } : state
  if (action.type === 'check') return state.verdict === null
    ? { ...state, draft: action.answer, verdict: action.correct } : state
  if (state.verdict === null || action.id !== state.queue[state.results.length]) return state
  const results = [...state.results, { id: action.id, answer: state.draft, passed: action.passed }]
  return { ...state, results, draft: '', verdict: null, finished: results.length === state.queue.length }
}

export function summarizeResults(results: DictationResult[]) {
  const passed = results.filter(result => result.passed).length
  return { answered: results.length, passed, failed: results.length - passed,
    accuracy: results.length ? Math.round(passed / results.length * 1000) / 10 : null }
}
