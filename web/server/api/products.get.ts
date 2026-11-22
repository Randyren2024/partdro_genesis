export default defineEventHandler(async () => {
  const db = adminClient()

  const [pagesRes, catsRes] = await Promise.all([
    db.from('public_product_pages').select('page_id,product_id,slug,headline,subheadline,category,name,name_en,model,locale'),
    db.from('product_categories').select('slug,name_i18n,position').order('position'),
  ])

  if (pagesRes.error) throw createError({ statusCode: 500, statusMessage: pagesRes.error.message })
  if (catsRes.error) throw createError({ statusCode: 500, statusMessage: catsRes.error.message })

  const rows = (pagesRes.data || []).filter((r) => r.locale === 'en')
  const productIds = rows.map((r) => r.product_id)

  let heroes: Record<string, { url: string; alt: string | null }> = {}
  if (productIds.length) {
    const { data: media } = await db
      .from('media_assets')
      .select('product_id,public_url,alt_i18n,role,sort_order,derivatives')
      .in('product_id', productIds)
      .eq('kind', 'image')
      .eq('is_public', true)
      .order('sort_order')
    for (const m of media || []) {
      if (m.role !== 'hero' || !m.product_id || heroes[m.product_id]) continue
      heroes[m.product_id] = { url: m.derivatives?.w640 || m.public_url, alt: m.alt_i18n?.en ?? null }
    }
  }

  const cats = (catsRes.data || []).map((c) => ({
    slug: c.slug,
    name: c.name_i18n?.en || c.slug,
    position: c.position,
  }))

  const products = rows
    .map((r) => ({
      slug: r.slug,
      headline: r.headline,
      subheadline: r.subheadline,
      category: r.category,
      categoryName: cats.find((c) => c.slug === r.category)?.name || r.category,
      model: r.model,
      hero: heroes[r.product_id] || null,
    }))
    .sort((a, b) => {
      const pa = cats.find((c) => c.slug === a.category)?.position ?? 999
      const pb = cats.find((c) => c.slug === b.category)?.position ?? 999
      return pa - pb || a.headline.localeCompare(b.headline)
    })

  const categories = cats
    .map((c) => ({ ...c, count: products.filter((p) => p.category === c.slug).length }))
    .filter((c) => c.count > 0)

  return { categories, products }
})

