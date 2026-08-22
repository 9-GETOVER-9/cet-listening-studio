import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 获取本地日期字符串 YYYY-MM-DD（避免 toISOString 的 UTC 时区偏差）
 */
export function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 获取昨天的本地日期字符串 */
export function getYesterdayStr(): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return getLocalDateStr(yesterday)
}
