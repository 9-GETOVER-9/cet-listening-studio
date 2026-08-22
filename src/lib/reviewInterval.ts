const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY

export function formatReviewInterval(due: Date, now = new Date()): string {
  const interval = Math.max(0, new Date(due).getTime() - now.getTime())

  if (interval < MINUTE) return '<1分钟'
  if (interval < HOUR) return `${Math.round(interval / MINUTE)}分钟`
  if (interval < DAY) return `${Math.round(interval / HOUR)}小时`
  if (interval < MONTH) return `${Math.round(interval / DAY)}天`
  return `${Math.round(interval / MONTH)}个月`
}
