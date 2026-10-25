import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ owner: 'guest', snapshot: undefined as unknown }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => state.snapshot }))
vi.mock('@/lib/accountSync', () => ({ useAccountSyncStatus: (selector: (value: { owner: string }) => unknown) => selector({ owner: state.owner }) }))
import { useLearningResume } from './useLearningResume'

function Probe() { const resume = useLearningResume(); return <span>{resume?.path ?? 'none'}</span> }
describe('Resume account boundary', () => {
  beforeEach(() => { state.owner = 'guest'; state.snapshot = undefined })
  it('does not render the previous account resume while a new query is pending', () => {
    state.snapshot = { owner: 'account-a', resume: { path: '/card/account-a-card', label: 'previous' } }
    state.owner = 'account-b'
    expect(renderToStaticMarkup(<Probe />)).toBe('<span>none</span>')
    state.snapshot = { owner: 'account-b', resume: { path: '/card/account-b-card', label: 'current' } }
    expect(renderToStaticMarkup(<Probe />)).toBe('<span>/card/account-b-card</span>')
  })
  it('renders the no-resume state before the account query resolves', () => {
    expect(renderToStaticMarkup(<Probe />)).toBe('<span>none</span>')
  })
})
