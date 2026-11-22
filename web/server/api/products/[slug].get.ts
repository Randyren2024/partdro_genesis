export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug || !/^[a-z0-9-]{2,120}$/i.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid product slug' })
  }

  const db = adminClient()
  const { data, error } = await db.rpc('get_product_page', {
    p_slug: slug,
    p_locale: 'en',
  })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const page = data as Record<string, any> | null
  if (!page || !page.available) {
    throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  }

  const { data: row } = await db
    .from('product_pages')
    .select('id,product_id')
    .eq('slug', slug)
    .maybeSingle()
  page.ids = { page_id: row?.id ?? null, product_id: row?.product_id ?? null }
  return page
})