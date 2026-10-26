export type CoverBookLike = {
  name?: string
}

const escapeSvgText = (text: string) =>
  text.replace(/[&<>"']/g, char => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[char]
  })

const truncateSvgText = (text: string, maxLength: number) => {
  const chars = Array.from(text.trim())
  return chars.length > maxLength
    ? `${chars.slice(0, maxLength).join('')}…`
    : chars.join('')
}

export const getPlaceholderCover = (book: CoverBookLike, subtitle = '本地书籍') => {
  const safeName = book.name || '阅读'
  const title = escapeSvgText(truncateSvgText(safeName, 8))
  const safeSubtitle = escapeSvgText(truncateSvgText(subtitle, 12))
  const initial = escapeSvgText(Array.from(safeName)[0] ?? '书')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="224" viewBox="0 0 168 224"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d7a1"/><stop offset="1" stop-color="#7aa7d9"/></linearGradient></defs><rect width="168" height="224" rx="12" fill="url(#g)"/><text x="84" y="92" text-anchor="middle" font-size="48" font-family="serif" fill="#fff">${initial}</text><text x="84" y="142" text-anchor="middle" font-size="17" font-family="sans-serif" font-weight="700" fill="#fff">${title}</text><text x="84" y="172" text-anchor="middle" font-size="12" font-family="sans-serif" fill="rgba(255,255,255,.82)">${safeSubtitle}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
