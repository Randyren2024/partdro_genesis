const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.slice(0, max)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)

  // honeypot: real users never fill this
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { ok: true }
  }

  const name = clip(body.name, 120)
  const email = clip(body.email, 200)
  const phone = clip(body.phone, 60)
  const company = clip(body.company, 160)
  const country = clip(body.country, 80)
  const message = clip(body.message, 4000)
  const productId = clip(body.product_id, 40)
  const pageId = clip(body.page_id, 40)
  const sourcePage = clip(body.source_page, 200)

  if (!name || name.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Please provide your name' })
  }
  if (!email || !EMAIL.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Please provide a valid email' })
  }

  const ip =
    getRequestHeader(event, 'cf-connecting-ip') ||
    getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    getRequestIP(event, { xForwardedFor: true }) ||
    'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  const ipHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)

  const db = adminClient()
  const { data: allowed, error: rateError } = await db.rpc('consume_quote_rate_limit', {
    p_key: ipHash,
    p_limit: 3,
    p_window: '1 minute',
  })
  if (rateError) throw createError({ statusCode: 500, statusMessage: rateError.message })
  if (!allowed) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests, please try again later' })
  }

  const { error } = await db.from('quote_requests').insert({
    product_id: productId,
    page_id: pageId,
    name,
    email,
    phone,
    company,
    country,
    message,
    locale: 'en',
    source_page: sourcePage,
    ip_hash: ipHash,
    user_agent: clip(getRequestHeader(event, 'user-agent'), 300),
  })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})