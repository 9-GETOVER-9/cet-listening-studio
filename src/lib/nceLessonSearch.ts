import type { Module } from '@/types'

export function matchesNCELesson(lesson: Pick<Module, 'lessonNum' | 'lessonTitle' | 'title' | 'moduleId'>, query: string) {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return true
  const number = term.match(/^(?:lesson\s*)?0*(\d+)$/)
  if (number) return Number(lesson.lessonNum) === Number(number[1])
  return [lesson.lessonTitle, lesson.title, lesson.moduleId].some(value => value?.toLocaleLowerCase().includes(term))
}
