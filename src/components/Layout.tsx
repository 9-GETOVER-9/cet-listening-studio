import { Suspense, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { NAV_ITEMS } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { AccountSyncStatus } from '@/components/AccountSyncStatus'
import { saveLearningResume, useAccountSyncStatus } from '@/lib/accountSync'

function PageLoading() {
  return <div className="quiet-page space-y-6" role="status" aria-label="正在打开页面">
    <p className="text-sm text-[var(--app-muted)]">正在打开页面…</p>
    <div aria-hidden="true" className="space-y-4">
      <div className="h-9 w-44 rounded-lg bg-[var(--app-paper-2)]" />
      <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="h-44 rounded-[var(--app-radius)] border border-[var(--app-line)] bg-[var(--app-surface)]" />)}</div>
    </div>
  </div>
}

export function Layout() {
  const location = useLocation()
  const owner = useAccountSyncStatus(s => s.owner)
  const mobileItems = NAV_ITEMS.filter((item) => item.mobile)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [location.pathname])
  // These exercises save their current sentence; their original URL may point to an older target.
  useEffect(() => { if (!/^\/(card|nce\/shadowing)\//.test(location.pathname)) void saveLearningResume(owner, location.pathname + location.search) }, [owner, location.pathname, location.search])

  return (
    <div className="min-h-dvh bg-[var(--app-paper)] text-[var(--app-ink)] lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <a href="#content" className="fixed left-4 top-[-5rem] z-[100] bg-[var(--app-ink)] px-4 py-2 text-sm text-white focus:top-4">跳到主要内容</a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-[var(--app-line)] bg-[var(--app-surface)] px-5 py-8 lg:flex">
        <NavLink to="/" className="mb-11 flex items-center gap-3" aria-label="Listening Studio 首页">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--app-accent)] font-serif text-sm font-bold text-white">LS</span>
          <span><strong className="block font-serif text-base leading-tight">Listening Studio</strong><small className="block text-[10px] uppercase tracking-[.16em] text-[var(--app-muted)]">Quiet Edition</small></span>
        </NavLink>
        <nav aria-label="主导航" className="grid gap-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, index }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('grid min-h-12 grid-cols-[28px_1fr_auto] items-center rounded-xl px-3 text-sm font-medium text-[var(--app-muted)] transition-colors hover:bg-[var(--app-paper)] hover:text-[var(--app-ink)]', isActive && 'bg-[var(--app-accent-soft)] font-semibold text-[var(--app-accent)]')}>
              <span className="font-serif text-xs font-normal text-[var(--app-muted)]">{index}</span><span>{label}</span><Icon className="h-4 w-4" aria-hidden="true" />
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--app-line)] pt-5 text-xs text-[var(--app-muted)]">
          <AccountSyncStatus compact />
          <p className="mt-3 font-serif text-sm text-[var(--app-ink)]">今天，也听清一个细节。</p>
        </div>
      </aside>
      <main id="content" className="app-main min-w-0">
        <div className="border-b border-[var(--app-line)] bg-[var(--app-surface)] px-4 py-3 text-[var(--app-muted)] lg:hidden"><AccountSyncStatus compact /></div>
        <Suspense key={location.pathname} fallback={<PageLoading />}>
          <div className="page-enter"><Outlet /></div>
        </Suspense>
      </main>
      <nav aria-label="主导航" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }} className="mobile-nav fixed inset-x-2 z-50 grid rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-1 shadow-[var(--app-shadow)] lg:hidden">
        {mobileItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} aria-label={label} className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-[var(--app-muted)] transition-colors', isActive && 'bg-[var(--app-accent)] text-white')}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" /><span>{to === '/review' ? '复习' : label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
