export default defineEventHandler((event) => {
  const base = siteUrl()
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`
})