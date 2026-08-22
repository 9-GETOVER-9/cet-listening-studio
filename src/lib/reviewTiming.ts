type DateValue = Date | string | number

function timestamp(value: DateValue): number {
  return new Date(value).getTime()
}

export function isDueNow(due: DateValue, now = new Date()): boolean {
  return timestamp(due) <= now.getTime()
}

export function isDueToday(due: DateValue, now = new Date()): boolean {
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  return timestamp(due) <= endOfToday.getTime()
}
