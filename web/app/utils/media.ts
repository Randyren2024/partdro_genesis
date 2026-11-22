export function mediaSrc(m: any, prefer: 640 | 1280 | 1920 = 1280): string {
  if (!m) return ''
  const d = m.derivatives || {}
  if (prefer === 1920) return d.w1920 || d.w1280 || d.w640 || m.url
  if (prefer === 1280) return d.w1280 || d.w640 || m.url
  return d.w640 || d.w1280 || m.url
}

export function mediaSrcset(m: any): string | undefined {
  if (!m?.derivatives) return undefined
  const d = m.derivatives
  const parts: string[] = []
  if (d.w640) parts.push(`${d.w640} 640w`)
  if (d.w1280) parts.push(`${d.w1280} 1280w`)
  if (d.w1920) parts.push(`${d.w1920} 1920w`)
  return parts.length ? parts.join(', ') : undefined
}
