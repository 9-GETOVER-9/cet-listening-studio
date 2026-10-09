import { describe, expect, it } from 'vitest'
import { summarizeResults } from './ieltsDictation'
import * as retry from './ieltsFrequencyRetry'

describe('frequency retry session', () => {
  it('keeps the first wrong answer and accuracy through repeated retries', () => {
    let state = retry.frequencyRetryReducer(retry.emptyFrequencyRetry, { type: 'start', queue: ['a', 'b'], frequencyMode: true })
    state = retry.frequencyRetryReducer(state, { type: 'check', answer: 'abilty', correct: false })
    expect(state.firstAttempt).toEqual({ answer: 'abilty', passed: false })
    const wrong = state
    expect(retry.frequencyRetryReducer(wrong, { type: 'confirm', id: 'a', passed: true })).toBe(wrong)
    for (const answer of ['abillity', 'ability']) {
      state = retry.frequencyRetryReducer(state, { type: 'retry' })
      expect(state).toMatchObject({ draft: '', verdict: null, results: [], finished: false })
      expect(state.queue[state.results.length]).toBe('a')
      expect(retry.frequencyRetryReducer(state, { type: 'retry' })).toBe(state)
      state = retry.frequencyRetryReducer(state, { type: 'check', answer, correct: answer === 'ability' })
    }
    const corrected = state
    // A failed save dispatches no confirmation: all question state stays intact.
    expect(corrected).toMatchObject({ draft: 'ability', verdict: true, firstAttempt: { answer: 'abilty', passed: false } })
    expect(retry.frequencyRetryReducer(corrected, { type: 'check', answer: 'changed', correct: false })).toBe(corrected)
    state = retry.frequencyRetryReducer(state, { type: 'confirm', id: 'a', passed: true })
    expect(state.results).toEqual([{ id: 'a', answer: 'abilty', passed: false }])
    expect(summarizeResults(state.results).accuracy).toBe(0)
    expect(state).toMatchObject({ draft: '', verdict: null, firstAttempt: null, finished: false })
    expect(retry.frequencyRetryReducer(state, { type: 'confirm', id: 'a', passed: true })).toBe(state)
  })

  it('records a first correct answer as passed and rejects redundant retry', () => {
    let state = retry.frequencyRetryReducer(retry.emptyFrequencyRetry, { type: 'start', queue: ['a'], frequencyMode: true })
    state = retry.frequencyRetryReducer(state, { type: 'check', answer: 'ability', correct: true })
    expect(retry.frequencyRetryReducer(state, { type: 'retry' })).toBe(state)
    state = retry.frequencyRetryReducer(state, { type: 'confirm', id: 'a', passed: false })
    expect(state.finished).toBe(true)
    expect(summarizeResults(state.results).accuracy).toBe(100)
    expect(retry.frequencyRetryReducer(state, { type: 'check', answer: '', correct: false })).toBe(state)
  })

  it('keeps Wanglu manual confirmation and unrevealed guards intact', () => {
    let state = retry.frequencyRetryReducer(retry.emptyFrequencyRetry, { type: 'start', queue: ['a'], frequencyMode: false })
    expect(retry.frequencyRetryReducer(state, { type: 'confirm', id: 'a', passed: true })).toBe(state)
    state = retry.frequencyRetryReducer(state, { type: 'check', answer: 'wrong', correct: false })
    expect(retry.frequencyRetryReducer(state, { type: 'retry' })).toBe(state)
    state = retry.frequencyRetryReducer(state, { type: 'confirm', id: 'a', passed: true })
    expect(state.results).toEqual([{ id: 'a', answer: 'wrong', passed: true }])
  })
})

describe('frequency shortcuts', () => {
  const key = { key: 'Enter', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, isComposing: false, keyCode: 13 }
  it('uses plain Enter for the main action and only Ctrl+1/2/3 for reasons', () => {
    expect(retry.parseFrequencyShortcut(key)).toEqual({ type: 'enter' })
    for (const [digit, reason] of [['1', 'pronunciation'], ['2', 'spelling'], ['3', 'both']]) {
      expect(retry.parseFrequencyShortcut({ ...key, key: digit, ctrlKey: true })).toEqual({ type: 'reason', reason })
      expect(retry.parseFrequencyShortcut({ ...key, key: digit })).toBeNull()
    }
    expect(retry.parseFrequencyShortcut({ ...key, ctrlKey: true })).toBeNull()
  })
  it('ignores held keys, IME composition, legacy 229 and extra modifiers', () => {
    for (const patch of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
      expect(retry.parseFrequencyShortcut({ ...key, ...patch })).toBeNull()
      expect(retry.parseFrequencyShortcut({ ...key, key: '3', ctrlKey: true, ...patch })).toBeNull()
    }
  })
  it('leaves editable notes and native select Enter alone but supports reason buttons', () => {
    for (const target of [{ targetTagName: 'TEXTAREA' }, { targetTagName: 'SELECT' }, { targetIsContentEditable: true }, { targetTagName: 'INPUT' }]) {
      expect(retry.parseFrequencyShortcut({ ...key, ...target })).toBeNull()
    }
    expect(retry.parseFrequencyShortcut({ ...key, targetTagName: 'INPUT', answerInput: true })).toEqual({ type: 'enter' })
    expect(retry.parseFrequencyShortcut({ ...key, targetTagName: 'BUTTON' })).toEqual({ type: 'enter' })
  })
  it('leaves auxiliary button Enter to its native action without disabling reason shortcuts', () => {
    const auxiliary = { ...key, targetTagName: 'BUTTON', targetIsAuxiliaryControl: true }
    expect(retry.parseFrequencyShortcut(auxiliary)).toBeNull()
    expect(retry.parseFrequencyShortcut({ ...auxiliary, targetTagName: 'svg' })).toBeNull()
    expect(retry.parseFrequencyShortcut({ ...auxiliary, key: '3', ctrlKey: true })).toEqual({ type: 'reason', reason: 'both' })
  })
})
