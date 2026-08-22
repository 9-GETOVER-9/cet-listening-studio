import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Headphones, Home, RotateCcw, Star, User } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: Home, label: '首页', index: '01', mobile: true },
  { to: '/cet', icon: Headphones, label: '四六级', index: '02', mobile: true },
  { to: '/nce', icon: BookOpen, label: '新概念', index: '03', mobile: true },
  { to: '/review', icon: RotateCcw, label: '综合复习', index: '04', mobile: true },
  { to: '/notebook', icon: Star, label: '难点本', index: '05', mobile: true },
  { to: '/profile', icon: User, label: '我的', index: '06', mobile: false },
]

const pageVariants = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } }

export function Layout() {
  const location = useLocation()
  const mobileItems = navItems.filter((item) => item.mobile)

  return (
    <div className="min-h-dvh bg-[var(--app-paper)] text-[var(--app-ink)] lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <a href="#content" className="fixed left-4 top-[-5rem] z-[100] bg-[var(--app-ink)] px-4 py-2 text-sm text-white focus:top-4">跳到主要内容</a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-[var(--app-line)] bg-[color-mix(in_srgb,var(--app-paper)_94%,transparent)] px-[22px] py-[30px] backdrop-blur-xl lg:flex">
        <NavLink to="/" className="mb-11 flex items-center gap-3" aria-label="Listening Studio 首页">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-full border border-[var(--app-ink)] font-serif text-xs font-bold">LS</span>
          <span><strong className="block font-serif text-base leading-tight">Listening Studio</strong><small className="block text-[10px] uppercase tracking-[.16em] text-[var(--app-muted)]">Quiet Edition</small></span>
        </NavLink>
        <nav aria-label="主导航" className="grid gap-1">
          {navItems.map(({ to, icon: Icon, label, index }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('grid min-h-12 grid-cols-[28px_1fr_auto] items-center rounded-[var(--app-radius)] px-2.5 text-sm font-semibold text-[var(--app-muted)] transition-colors hover:bg-white/40 hover:text-[var(--app-ink)]', isActive && 'bg-[var(--app-surface)] text-[var(--app-ink)] shadow-[inset_2px_0_var(--app-accent)]')}>
              <span className="font-serif text-xs font-normal text-[var(--app-muted)]">{index}</span><span>{label}</span><Icon className="h-4 w-4" aria-hidden="true" />
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--app-line)] pt-5 text-xs text-[var(--app-muted)]">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#4e7b58] shadow-[0_0_0_4px_rgba(78,123,88,.1)]" />学习记录保存在本机</div>
          <p className="mt-3 font-serif text-sm text-[var(--app-ink)]">今天，也听清一个细节。</p>
        </div>
      </aside>
      <main id="content" className="min-w-0 pb-20 lg:pb-0">
        <AnimatePresence mode="wait"><motion.div key={location.pathname} initial={pageVariants.initial} animate={pageVariants.animate} exit={pageVariants.exit} transition={{ type: 'tween', ease: 'easeOut', duration: 0.24 }}><Outlet /></motion.div></AnimatePresence>
      </main>
      <nav aria-label="主导航" className="fixed inset-x-2 bottom-2 z-50 grid grid-cols-5 border border-[var(--app-line)] bg-[color-mix(in_srgb,var(--app-surface)_94%,transparent)] p-1 shadow-[var(--app-shadow)] backdrop-blur-xl lg:hidden">
        {mobileItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] text-[var(--app-muted)]', isActive && 'bg-[var(--app-ink)] text-white')}>
            <Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
