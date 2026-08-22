export function decodeHtml(str: string): string {
  if (!str) return str
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
