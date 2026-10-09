export function canPracticeAutoNext(state: { hidden: boolean; editing: boolean; composing: boolean; preview: boolean; saving: boolean; error: boolean; verdict: boolean | null; finished: boolean }) {
  return state.verdict === true && !state.hidden && !state.editing && !state.composing && !state.preview && !state.saving && !state.error && !state.finished
}
export function practiceEnterAllowed(event: { key: string; answerInput: boolean; repeat: boolean; isComposing: boolean; keyCode: number; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  return event.key === 'Enter' && event.answerInput && !event.repeat && !event.isComposing && event.keyCode !== 229 && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
}
export interface WordNotesDraft { draft: { note?: string; reason?: FrequencyReason }; saving: boolean; error: string; saved: boolean }
export interface WordNotesStatus { dirty: boolean; saving: boolean; error: string }
export const emptyWordNotesDraft: WordNotesDraft = { draft: {}, saving: false, error: '', saved: false }
export type WordNotesAction = { type: 'patch'; patch: WordNotesDraft['draft'] } | { type: 'begin' | 'saved' | 'discard' } | { type: 'failed'; error: string }
export function wordNotesReducer(state: WordNotesDraft, action: WordNotesAction): WordNotesDraft {
  if (action.type === 'begin') return { ...state, saving: true, error: '', saved: false }
  if (action.type === 'saved') return { ...emptyWordNotesDraft, saved: true }
  if (action.type === 'failed') return { ...state, saving: false, error: action.error }
  if (state.saving) return state
  if (action.type === 'discard') return { ...emptyWordNotesDraft }
  return action.type === 'patch' ? { ...state, draft: { ...state.draft, ...action.patch }, saved: false } : state
}
export function wordNotesStatus(state: WordNotesDraft): WordNotesStatus {
  return { dirty: state.draft.note !== undefined || state.draft.reason !== undefined, saving: state.saving, error: state.error }
}
export function shouldBlockPracticeNavigation(notes: WordNotesStatus, session?: { saving: boolean; error: boolean; draftPending: boolean; settingsPending?: boolean }): boolean {
  return notes.dirty || notes.saving || !!notes.error || !!session?.saving || !!session?.error || !!session?.draftPending || !!session?.settingsPending
}
export interface PracticeCountdown { key: string; remaining: number }
export function stepPracticeCountdown(state: PracticeCountdown, key: string, seconds: number): PracticeCountdown {
  return { key, remaining: Math.max(0, (state.key === key ? state.remaining : seconds) - 1) }
}
import type { FrequencyReason } from './ieltsFrequencyProgress'
