import { describe, expect, it } from 'vitest'
import { checkSpelling, dictationReducer, summarizeResults, type DictationState } from './ieltsDictation'

describe('IELTS dictation', () => {
  it('accepts case, whitespace and terminal punctuation without accepting spelling mistakes', () => {
    expect(checkSpelling('  NEW   YEAR’S EVE party. ', ["New Year's Eve party"])).toBe(true)
    expect(checkSpelling('balaned diet', ['balanced diet'])).toBe(false)
    expect(checkSpelling('', ['ability'])).toBe(false)
    expect(checkSpelling('check', ['cheque', 'check'])).toBe(true)
  })

  it('counts a confirmed question once even when the button is pressed twice', () => {
    const start: DictationState = { queue: ['a', 'b'], results: [], draft: '', verdict: null, finished: false }
    const checked = dictationReducer(start, { type: 'check', answer: 'ability', correct: true })
    const recorded = dictationReducer(checked, { type: 'confirm', id: 'a', passed: true })
    expect(dictationReducer(recorded, { type: 'confirm', id: 'a', passed: true })).toEqual(recorded)
    expect(recorded.results).toEqual([{ id: 'a', answer: 'ability', passed: true }])
    expect(recorded.verdict).toBeNull()
  })

  it('includes dont-know answers and manual corrections in the final accuracy', () => {
    let state: DictationState = { queue: ['a', 'b'], results: [], draft: '', verdict: null, finished: false }
    state = dictationReducer(state, { type: 'check', answer: '', correct: false })
    state = dictationReducer(state, { type: 'confirm', id: 'a', passed: false })
    state = dictationReducer(state, { type: 'check', answer: 'research assistant', correct: false })
    state = dictationReducer(state, { type: 'confirm', id: 'b', passed: true })
    expect(state.finished).toBe(true)
    expect(summarizeResults(state.results)).toEqual({ answered: 2, passed: 1, failed: 1, accuracy: 50 })
    expect(summarizeResults([]).accuracy).toBeNull()
  })

  it('cannot confirm an unrevealed question or submit after finishing', () => {
    const state: DictationState = { queue: ['a'], results: [], draft: '', verdict: null, finished: false }
    expect(dictationReducer(state, { type: 'confirm', id: 'a', passed: true })).toEqual(state)
    const finished = { ...state, finished: true }
    expect(dictationReducer(finished, { type: 'check', answer: 'a', correct: true })).toEqual(finished)
  })
})
