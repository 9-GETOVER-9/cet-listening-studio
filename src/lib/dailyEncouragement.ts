const sentences = [
  '今天多听懂一句，就是向更好的自己迈出一步。',
  '不必一下走得很远，只要今天继续向前。',
  '你认真听过的每一句，都会慢慢成为你的底气。',
  '进步藏在每天的小小坚持里，今天也算数。',
  '允许自己慢一点，但别忘了为坚持的自己鼓掌。',
  '从听不懂到听懂，靠的是一次又一次不放弃。',
  '把今天的一点努力，存成明天的一份自信。',
  '学习没有白走的路，每一次重复都在扎根。',
  '你不需要每天完美，只需要每天愿意再试一次。',
  '让耳朵多熟悉一点，让梦想更靠近一点。',
  '今天的你愿意开始，这就是值得肯定的进步。',
  '坚持不是一直很有动力，而是没动力时也走一小步。',
]
export function getDailyEncouragement(date = new Date()): string {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
  return sentences[((day % sentences.length) + sentences.length) % sentences.length]
}
