import { describe, expect, it } from 'vitest'
import { resolveIELTSEntry } from './ieltsEntry'

describe('IELTS direct entry', () => {
  it('opens the requested listening mode without resuming a dictation queue', () => {
    expect(resolveIELTSEntry(new URLSearchParams('source=frequency&mode=walkman'))).toEqual({ book: 'frequency', mode: 'walkman', resume: false })
    expect(resolveIELTSEntry(new URLSearchParams('mode=walkman'))).toEqual({ book: 'wanglu', mode: 'walkman', resume: false })
  })
  it('resumes saved dictation by default and ignores unsupported modes', () => {
    expect(resolveIELTSEntry(new URLSearchParams('source=frequency'))).toEqual({ book: 'frequency', mode: 'dictation', resume: true })
    expect(resolveIELTSEntry(new URLSearchParams('mode=unknown'))).toEqual({ book: 'wanglu', mode: 'dictation', resume: true })
  })
})
