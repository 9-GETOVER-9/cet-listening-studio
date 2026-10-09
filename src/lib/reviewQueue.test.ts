import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import {
  advanceReviewSession,
  createReviewSession,
  isReviewSessionComplete,
  nextDueAt,
  recordScheduledCard,
  removeCardFromReviewSession,
} from './reviewQueue'

describe('reviewQueue', () => {
  it('moves a short-term Again result into waiting instead of ready', () => {
    const now = new Date('2026-08-16T00:00:00.000Z')
    const session = createReviewSession(['card-1'])

    const next = recordScheduledCard(session, 'card-1', {
      due: new Date('2026-08-16T00:01:00.000Z'),
      state: State.Learning,
    }, now)

    expect(next.ready).toEqual([])
    expect(next.waiting).toEqual([{
      cardId: 'card-1',
      dueAt: new Date('2026-08-16T00:01:00.000Z').getTime(),
    }])
  })

  it('keeps waiting cards before due and releases them exactly at due', () => {
    const due = new Date('2026-08-16T00:01:00.000Z')
    const waiting = recordScheduledCard(
      createReviewSession(['card-1']),
      'card-1',
      { due, state: State.Learning },
      new Date('2026-08-16T00:00:00.000Z'),
    )

    const beforeDue = advanceReviewSession(
      waiting,
      new Date('2026-08-16T00:00:59.999Z'),
    )
    expect(beforeDue.ready).toEqual([])
    expect(beforeDue.waiting).toHaveLength(1)
    expect(nextDueAt(beforeDue)).toBe(due.getTime())

    const atDue = advanceReviewSession(waiting, due)
    expect(atDue.ready).toEqual(['card-1'])
    expect(atDue.waiting).toEqual([])
  })

  it('is complete only when both ready and waiting are empty', () => {
    expect(isReviewSessionComplete(createReviewSession(['card-1']))).toBe(false)
    expect(isReviewSessionComplete({
      ready: [],
      waiting: [{ cardId: 'card-1', dueAt: 1 }],
      reviewedCount: 1,
    })).toBe(false)
    expect(isReviewSessionComplete({
      ready: [],
      waiting: [],
      reviewedCount: 1,
    })).toBe(true)
  })

  it('removes a deleted card from ready and waiting queues', () => {
    const session = {
      ready: ['card-1', 'card-2'],
      waiting: [
        { cardId: 'card-2', dueAt: 100 },
        { cardId: 'card-3', dueAt: 200 },
      ],
      reviewedCount: 4,
    }

    expect(removeCardFromReviewSession(session, 'card-2')).toEqual({
      ready: ['card-1'],
      waiting: [{ cardId: 'card-3', dueAt: 200 }],
      reviewedCount: 4,
    })
  })
})
