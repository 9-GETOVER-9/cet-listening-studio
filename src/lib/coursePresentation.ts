export function difficultyLabel(value: string) {
  return ({ basic: '基础', medium: '进阶', hard: '较难', advanced: '高阶' } as Record<string, string>)[value] ?? value
}

export function listeningTitle(title: string) {
  return title.replace(/News\s*Report\s*/gi, '新闻 ').replace(/Conversation\s*/gi, '对话 ').replace(/Passage\s*/gi, '短文 ').replace(/Recording\s*/gi, '讲座 ')
}
