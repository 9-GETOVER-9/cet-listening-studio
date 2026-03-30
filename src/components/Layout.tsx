import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, Headphones, BookOpen, Star, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: Home, label: '首页' },
  { to: '/cet', icon: Headphones, label: '四六级' },
  { to: '/nce', icon: BookOpen, label: '新概念' },
  { to: '/notebook', icon: Star, label: '难点本' },
  { to: '/profile', icon: User, label: '我的' },
]

// 页面过渡动画配置
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

const pageTransition = {
  type: 'tween' as const,
  ease: 'easeInOut' as const,
  duration: 0.2,
}

export function Layout() {
  const location = useLocation()

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      {/* 主内容区 */}
      <main className="flex-1 pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={pageVariants.initial}
            animate={pageVariants.animate}
            exit={pageVariants.exit}
            transition={pageTransition}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 底部导航栏 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-md">
        <div className="mx-auto flex max-w-lg">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                  isActive ? 'text-brand' : 'text-gray-400 hover:text-gray-600'
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
