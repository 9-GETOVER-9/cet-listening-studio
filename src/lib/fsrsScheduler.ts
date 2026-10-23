import {
  createEmptyCard,
  fsrs,
  Rating as FSRSRating,
  type CardInput,
} from 'ts-fsrs'
import { Rating, type FSRSState } from '@/types'
import { normalizeFSRSState } from '@/lib/fsrsState'
import { getFSRSOwner, getPersonalParameters } from './fsrsPreferences'
import type { OptimizationScope } from './fsrsOptimization'

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
})

export interface ScheduleContext { scope?: OptimizationScope; owner?: string }
const schedulers = new Map<string, ReturnType<typeof fsrs>>()
function schedulerFor(context: ScheduleContext = {}) {
  const profile = getPersonalParameters(context.owner ?? getFSRSOwner(), context.scope ?? 'main')
  if (!profile) return scheduler
  const key = JSON.stringify(profile.weights)
  if (!schedulers.has(key)) {
    if (schedulers.size >= 10) schedulers.clear()
    schedulers.set(key, fsrs({ ...scheduler.parameters, w: profile.weights }))
  }
  return schedulers.get(key)!
}

const ratingMap = {
  [Rating.Again]: FSRSRating.Again,
  [Rating.Hard]: FSRSRating.Hard,
  [Rating.Good]: FSRSRating.Good,
  [Rating.Easy]: FSRSRating.Easy,
} as const

function toCardInput(state: FSRSState): CardInput {
  return {
    ...state,
    due: new Date(state.due),
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  }
}

export function createInitialFSRSState(now = new Date()): FSRSState {
  const card = createEmptyCard(now)
  return normalizeFSRSState(card)
}

export function previewFSRSRatings(
  state: FSRSState,
  now = new Date(),
  context: ScheduleContext = {},
): Record<Rating, FSRSState> {
  const preview = schedulerFor(context).repeat(toCardInput(state), now)

  return {
    [Rating.Again]: normalizeFSRSState(preview[FSRSRating.Again].card),
    [Rating.Hard]: normalizeFSRSState(preview[FSRSRating.Hard].card),
    [Rating.Good]: normalizeFSRSState(preview[FSRSRating.Good].card),
    [Rating.Easy]: normalizeFSRSState(preview[FSRSRating.Easy].card),
  }
}

export function scheduleFSRSState(
  state: FSRSState,
  rating: Rating,
  now = new Date(),
  context: ScheduleContext = {},
): FSRSState {
  return normalizeFSRSState(
    schedulerFor(context).next(toCardInput(state), now, ratingMap[rating]).card,
  )
}
