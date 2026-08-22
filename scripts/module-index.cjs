const fs = require('node:fs')
const path = require('node:path')

function normalizeNCEBook(card) {
  if (card.level !== 'NCE') return card.book

  switch (card.book) {
    case 'Book4':
    case 'Unknown':
      return 'Book1'
    case 'Book1':
      return 'Book2'
    case 'Book2':
      return 'Book3'
    case 'Book3':
      return 'Book4'
    default:
      return card.book
  }
}

function normalizeCardImport(card) {
  const book = normalizeNCEBook(card)
  if (book === card.book) return card

  const normalizedModuleId = card.moduleId
    .replace(/^NCE_Unknown_/, `NCE_${book}_`)
    .replace(/^NCE_Book[1-4]_/, `NCE_${book}_`)

  return {
    ...card,
    book,
    moduleId: normalizedModuleId,
  }
}

function buildModules(cards) {
  const moduleMap = new Map()

  for (const rawCard of cards) {
    const card = normalizeCardImport(rawCard)
    if (card.isTitle) continue

    if (!moduleMap.has(card.moduleId)) {
      moduleMap.set(card.moduleId, {
        moduleId: card.moduleId,
        cards: [],
      })
    }

    moduleMap.get(card.moduleId).cards.push(card)
  }

  const modules = []
  for (const value of moduleMap.values()) {
    const sampleCard = value.cards[0]

    if (sampleCard.level === 'NCE') {
      modules.push({
        moduleId: value.moduleId,
        title: `Lesson ${sampleCard.lessonNum || ''}`,
        lessonTitle: sampleCard.lessonTitle,
        book: sampleCard.book,
        lessonNum: sampleCard.lessonNum,
        level: 'NCE',
        totalCards: value.cards.length,
        studiedCards: 0,
        difficulty: sampleCard.difficulty || 'basic',
      })
      continue
    }

    const parts = value.moduleId.split('_')
    const level = parts[0] || 'CET6'
    const examDate = sampleCard.examDate || ''
    const section = sampleCard.section || 'A'
    const type = sampleCard.type || 'conversation'
    const titlePart = parts.slice(3).join('_')
    const title = titlePart
      .replace(/([A-Z])/g, ' $1')
      .replace(/^_/, '')
      .trim()

    modules.push({
      moduleId: value.moduleId,
      title: title || value.moduleId,
      examDate,
      section,
      type,
      level,
      totalCards: value.cards.length,
      studiedCards: 0,
      difficulty: sampleCard.difficulty || 'medium',
    })
  }

  return modules
}

function buildModuleIndex(cardsJson) {
  const modules = buildModules(cardsJson.cards)
  return {
    version: cardsJson.version,
    generatedAt: new Date().toISOString(),
    cardsGeneratedAt: cardsJson.generatedAt,
    totalCards: cardsJson.totalCards,
    totalModules: modules.length,
    modules,
  }
}

function generateModuleIndex({
  inputPath = path.resolve(__dirname, '../public/data/cards.json'),
  outputPath = path.resolve(__dirname, '../public/data/modules.json'),
} = {}) {
  const cardsJson = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const index = buildModuleIndex(cardsJson)
  fs.writeFileSync(outputPath, `${JSON.stringify(index)}\n`, 'utf8')
  return index
}

if (require.main === module) {
  const index = generateModuleIndex()
  console.log(`Generated ${index.totalModules} modules from ${index.totalCards} cards`)
}

module.exports = {
  buildModuleIndex,
  generateModuleIndex,
  normalizeCardImport,
  normalizeNCEBook,
}
