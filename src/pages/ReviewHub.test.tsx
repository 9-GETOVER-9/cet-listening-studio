import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import ReviewHub from './ReviewHub'

describe('ReviewHub', () => {
  it('offers separate regular and Jiufen review destinations', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ReviewHub /></MemoryRouter>)
    expect(html).toContain('常规到期复习')
    expect(html).toContain('href="/review/session"')
    expect(html).toContain('九分错句复习')
    expect(html).toContain('href="/jiufen"')
  })
})
