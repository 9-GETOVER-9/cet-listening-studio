export interface LearningResume { path: string; label: string }

export function parseLearningResume(value: unknown): LearningResume | null {
  if (!value || typeof value !== 'object') return null
  const { path, label } = value as Record<string, unknown>
  if (typeof path !== 'string' || !/^\/(card\/[^/?#]+|nce\/shadowing\/[^/?#]+|word-practice|ielts\/reading-538|ielts\/listening)(\?|$)/.test(path) || /[\\\r\n]/.test(path)) return null
  return { path, label: typeof label === 'string' && label.trim() ? label : '继续上次学习' }
}

export function resumeCourse(path: string): { name: string; image: 'ielts' | 'cet' | 'nce' } {
  if (path.startsWith('/ielts')) return { name: '雅思专项练习', image: 'ielts' }
  if (path.startsWith('/nce') || /nce/i.test(path)) return { name: '新概念英语', image: 'nce' }
  if (path.startsWith('/word-practice')) return { name: '难点词汇练习', image: 'ielts' }
  return { name: '听力精听练习', image: 'cet' }
}
