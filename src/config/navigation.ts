import { BookOpen, Headphones, Home, RotateCcw, Star, User } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', icon: Home, label: '首页', index: '01', mobile: true },
  { to: '/cet', icon: Headphones, label: '四六级', index: '02', mobile: true },
  { to: '/nce', icon: BookOpen, label: '新概念', index: '03', mobile: true },
  { to: '/review', icon: RotateCcw, label: '综合复习', index: '04', mobile: true },
  { to: '/notebook', icon: Star, label: '难点本', index: '05', mobile: true },
  { to: '/profile', icon: User, label: '我的', index: '06', mobile: true },
]
