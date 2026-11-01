import { describe, expect, it } from 'vitest'
import { matchesNCELesson } from './nceLessonSearch'

describe('新概念课次查找', () => {
  const lesson = { lessonNum: '01', lessonTitle: 'Excuse me!', title: 'Lesson 01', moduleId: 'NCE_Book1_Lesson01' }
  it('matches lesson numbers with or without leading zero and titles case insensitively', () => {
    expect(matchesNCELesson(lesson, '1')).toBe(true)
    expect(matchesNCELesson(lesson, 'Lesson 01')).toBe(true)
    expect(matchesNCELesson(lesson, 'EXCUSE')).toBe(true)
    expect(matchesNCELesson(lesson, '3')).toBe(false)
    expect(matchesNCELesson(lesson, '')).toBe(true)
  })
})
