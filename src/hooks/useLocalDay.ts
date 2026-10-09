import { useEffect, useState } from 'react'
import { getLocalDateStr } from '@/lib/utils'

export function useLocalDay() {
  const [day, setDay] = useState(() => getLocalDateStr())
  useEffect(() => {
    const update = () => setDay(getLocalDateStr())
    const timer = window.setInterval(update, 60000)
    window.addEventListener('focus', update)
    return () => { clearInterval(timer); window.removeEventListener('focus', update) }
  }, [])
  return day
}
