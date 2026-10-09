import { expect, it } from 'vitest'
const modules = import.meta.glob('./wordPracticeInteraction.ts')
async function api() {
  expect(modules['./wordPracticeInteraction.ts']).toBeDefined()
  return await modules['./wordPracticeInteraction.ts']() as typeof import('./wordPracticeInteraction')
}
it('pauses automatic continuation for hidden, note editing, composition, preview or persistence errors', async () => {
  const p = await api()
  const ready = { hidden: false, editing: false, composing: false, preview: false, saving: false, error: false, verdict: true, finished: false }
  expect(p.canPracticeAutoNext(ready)).toBe(true)
  for (const key of ['hidden', 'editing', 'composing', 'preview', 'saving', 'error', 'finished'] as const) expect(p.canPracticeAutoNext({ ...ready, [key]: true })).toBe(false)
  expect(p.canPracticeAutoNext({ ...ready, verdict: false })).toBe(false)
})
it('handles Enter only in answer input and never modified or composition events', async () => {
  const p = await api()
  const event = { key: 'Enter', answerInput: true, repeat: false, isComposing: false, keyCode: 13, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }
  expect(p.practiceEnterAllowed(event)).toBe(true)
  expect(p.practiceEnterAllowed({ ...event, answerInput: false })).toBe(false)
  expect(p.practiceEnterAllowed({ ...event, keyCode: 229 })).toBe(false)
  expect(p.practiceEnterAllowed({ ...event, repeat: true })).toBe(false)
})
it('retains unsaved notes and reason through save failure until successful retry or explicit discard', async () => {
  const p = await api()
  expect(p.wordNotesReducer).toBeDefined()
  let state = p.wordNotesReducer(p.emptyWordNotesDraft, { type: 'patch', patch: { note: 'draft', reason: 'spelling' } })
  state = p.wordNotesReducer(state, { type: 'begin' })
  state = p.wordNotesReducer(state, { type: 'failed', error: 'quota' })
  expect(state).toMatchObject({ draft: { note: 'draft', reason: 'spelling' }, error: 'quota' })
  expect(p.wordNotesStatus(state)).toMatchObject({ dirty: true, saving: false, error: 'quota' })
  state = p.wordNotesReducer(state, { type: 'begin' }); state = p.wordNotesReducer(state, { type: 'saved' })
  expect(p.wordNotesStatus(state)).toMatchObject({ dirty: false, error: '' })
  state = p.wordNotesReducer(state, { type: 'patch', patch: { note: 'new' } })
  state = p.wordNotesReducer(state, { type: 'discard' })
  expect(state.draft).toEqual({})
})
it('resumes the remaining countdown after pause and resets only for a new question or setting', async () => {
  const p = await api()
  expect(p.stepPracticeCountdown).toBeDefined()
  let state = { key: '', remaining: 0 }
  state = p.stepPracticeCountdown(state, 'round:0:5', 5)
  expect(state.remaining).toBe(4)
  state = p.stepPracticeCountdown(state, 'round:0:5', 5)
  expect(state.remaining).toBe(3)
  // Hidden, composing or note-editing intervals do not tick. Resume this same state.
  state = p.stepPracticeCountdown(state, 'round:0:5', 5)
  expect(state.remaining).toBe(2)
  expect(p.stepPracticeCountdown(state, 'round:1:5', 5).remaining).toBe(4)
  expect(p.stepPracticeCountdown(state, 'round:0:10', 10).remaining).toBe(9)
})
it('blocks every router navigation or unload only for actual dirty, saving or failed notes', async () => {
  const p = await api()
  expect(p.shouldBlockPracticeNavigation).toBeDefined()
  const clean = { dirty: false, saving: false, error: '' }
  expect(p.shouldBlockPracticeNavigation(clean)).toBe(false)
  expect(p.shouldBlockPracticeNavigation({ ...clean, dirty: true })).toBe(true)
  expect(p.shouldBlockPracticeNavigation({ ...clean, saving: true })).toBe(true)
  expect(p.shouldBlockPracticeNavigation({ ...clean, error: 'quota' })).toBe(true)
  const savedSession = { saving: false, error: false, draftPending: false }
  expect(p.shouldBlockPracticeNavigation(clean, savedSession)).toBe(false)
  expect(p.shouldBlockPracticeNavigation(clean, { ...savedSession, saving: true })).toBe(true)
  expect(p.shouldBlockPracticeNavigation(clean, { ...savedSession, draftPending: true })).toBe(true)
  expect(p.shouldBlockPracticeNavigation(clean, { ...savedSession, error: true })).toBe(true)
  expect(p.shouldBlockPracticeNavigation(clean, { ...savedSession, settingsPending: true })).toBe(true)
  const state = p.wordNotesReducer(p.emptyWordNotesDraft, { type: 'patch', patch: { note: 'keep' } })
  const saving = p.wordNotesReducer(state, { type: 'begin' })
  expect(p.wordNotesReducer(saving, { type: 'discard' })).toBe(saving)
  expect(p.shouldBlockPracticeNavigation(p.wordNotesStatus(p.wordNotesReducer(state, { type: 'discard' })))).toBe(false)
})
