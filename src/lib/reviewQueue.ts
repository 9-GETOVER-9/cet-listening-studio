import { State } from 'ts-fsrs'

export interface WaitingReview {
  cardId: string
  dueAt: number
}

export interface ReviewSession {
  ready: string[]
  waiting: WaitingReview[]
  reviewedCount: number
}

interface ScheduledCard {
  due: Date
  state: State
}

export function createReviewSession(cardIds: string[]): ReviewSession {
  return {
    ready: [...cardIds],
    waiting: [],
    reviewedCount: 0,
  }
}

export function recordScheduledCard(
  session: ReviewSession,
  cardId: string,
  scheduled: ScheduledCard,
  now = new Date(),
): ReviewSession {
  const ready = session.ready.filter((id) => id !== cardId)
  const waiting = session.waiting.filter((item) => item.cardId !== cardId)
  const dueAt = new Date(scheduled.due).getTime()
  const isShortTerm = scheduled.state === State.Learning
    || scheduled.state === State.Relearning

  if (isShortTerm) {
    if (dueAt <= now.getTime()) ready.push(cardId)
    else waiting.push({ cardId, dueAt })
  }

  return {
    ready,
    waiting: waiting.sort((a, b) => a.dueAt - b.dueAt),
    reviewedCount: session.reviewedCount + 1,
  }
}

export function advanceReviewSession(
  session: ReviewSession,
  now = new Date(),
): ReviewSession {
  const timestamp = now.getTime()
  const released = session.waiting
    .filter((item) => item.dueAt <= timestamp)
    .map((item) => item.cardId)

  return {
    ...session,
    ready: [...session.ready, ...released],
    waiting: session.waiting.filter((item) => item.dueAt > timestamp),
  }
}

export function nextDueAt(session: ReviewSession): number | undefined {
  return session.waiting[0]?.dueAt
}

export function isReviewSessionComplete(session: ReviewSession): boolean {
  return session.ready.length === 0 && session.waiting.length === 0
}
