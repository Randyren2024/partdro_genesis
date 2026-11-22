export default defineEventHandler(async (event) => {
  const db = adminClient()
  const { data } = await db
    .from('public_product_pages')
    .select('slug,locale')
    .eq('locale', 'en')

  const base = siteUrl()
  const urls = [`${base}/products`].concat((data || []).map((r) => `${base}/products/${r.slug}`))

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`
})