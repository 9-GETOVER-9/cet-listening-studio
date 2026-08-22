const assert = require('node:assert/strict')

const { buildModuleIndex } = require('./module-index.cjs')

const fixture = {
  version: 'test-version',
  generatedAt: '2026-05-31T00:00:00.000Z',
  totalCards: 4,
  cards: [
    {
      cardId: 'raw-book4-lesson01-card01',
      moduleId: 'NCE_Book4_Lesson01',
      level: 'NCE',
      book: 'Book4',
      lessonNum: '01',
      lessonTitle: 'Excuse me!',
      difficulty: 'basic',
      isTitle: false,
    },
    {
      cardId: 'raw-book1-lesson01-card01',
      moduleId: 'NCE_Book1_Lesson01',
      level: 'NCE',
      book: 'Book1',
      lessonNum: '01',
      lessonTitle: 'A private conversation',
      difficulty: 'basic',
      isTitle: false,
    },
    {
      cardId: 'raw-book2-lesson01-card01',
      moduleId: 'NCE_Book2_Lesson01',
      level: 'NCE',
      book: 'Book2',
      lessonNum: '01',
      lessonTitle: 'A puma at large',
      difficulty: 'medium',
      isTitle: false,
    },
    {
      cardId: 'raw-book3-lesson01-card01',
      moduleId: 'NCE_Book3_Lesson01',
      level: 'NCE',
      book: 'Book3',
      lessonNum: '01',
      lessonTitle: 'Finding fossil man',
      difficulty: 'advanced',
      isTitle: false,
    },
  ],
}

const index = buildModuleIndex(fixture)
const nceFirstLessons = Object.fromEntries(
  index.modules
    .filter((module) => module.level === 'NCE' && module.lessonNum === '01')
    .map((module) => [module.book, module.lessonTitle]),
)

assert.equal(nceFirstLessons.Book1, 'Excuse me!')
assert.equal(nceFirstLessons.Book2, 'A private conversation')
assert.equal(nceFirstLessons.Book3, 'A puma at large')
assert.equal(nceFirstLessons.Book4, 'Finding fossil man')
assert.equal(index.totalModules, 4)

console.log('module-index tests passed')
