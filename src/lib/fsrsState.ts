import type { State } from 'ts-fsrs'
import type { FSRSState } from '@/types'

type PersistedFSRSState = Omit<FSRSState, 'due' | 'last_review' | 'learning_steps'> & {
  due: Date | string | number
  last_review?: Date | string | number
  learning_steps?: number
  state: State
}

export function normalizeFSRSState(state: PersistedFSRSState): FSRSState {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    reps: state.reps,
    lapses: state.lapses,
    learning_steps: state.learning_steps ?? 0,
    state: state.state,
    last_review: state.last_review == null ? undefined : new Date(state.last_review),
  }
}
