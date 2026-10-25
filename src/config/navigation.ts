import { BookOpen, Home, RotateCcw, Star, User } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', icon: Home, label: '今日', index: '01', mobile: true },
  { to: '/courses', icon: BookOpen, label: '课程', index: '02', mobile: true },
  { to: '/review', icon: RotateCcw, label: '复习', index: '03', mobile: true },
  { to: '/notebook', icon: Star, label: '难点本', index: '04', mobile: true },
  { to: '/profile', icon: User, label: '我的', index: '05', mobile: true },
]

export function isNavigationActive(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  if (to === '/courses') return /^\/(courses|cet|nce|ielts|walkman|card)(\/|$)/.test(pathname)
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function isPracticePath(pathname: string) {
  return /^\/(card\/|nce\/shadowing\/|word-practice(?:\/|$)|notebook\/review\/)/.test(pathname)
}
