<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const { data: page, error } = await useFetch(`/api/products/${slug}`)

if (error.value || !page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Product not found', fatal: true })
}

const doc = page.value as any
const site = useRuntimeConfig().public.siteUrl

const sections = computed(() => (doc.sections || []).filter((s: any) => s.is_visible !== false))
const media = computed(() => doc.media || [])

const featureIndex = computed(() => {
  let n = 0
  return sections.value.map((s: any) => (s.kind === 'feature' ? n++ : -1))
})

const specCount = computed(() => (doc.specs || []).length)
const hasQuote = computed(() => sections.value.some((s: any) => s.kind === 'quote'))

useSeoMeta({
  title: doc.page?.seo?.title || doc.page?.headline,
  description: doc.page?.seo?.description || doc.page?.subheadline,
  ogTitle: doc.page?.seo?.title || doc.page?.headline,
  ogDescription: doc.page?.seo?.description || doc.page?.subheadline,
  ogType: 'website',
})

useHead({
  link: [{ rel: 'canonical', href: `${site}/products/${slug}` }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: doc.page?.headline,
        description: doc.page?.seo?.description,
        category: doc.product?.category,
        brand: { '@type': 'Brand', name: 'Partdro' },
      }),
    },
  ],
})
</script>

<template>
  <div>
    <nav class="sticky top-16 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div class="container-page flex items-center gap-6 overflow-x-auto py-3 text-sm">
        <a href="#overview" class="whitespace-nowrap text-muted hover:text-ink">Overview</a>
        <a href="#specs" class="whitespace-nowrap text-muted hover:text-ink">Specifications</a>
        <a v-if="hasQuote" href="#quote" class="whitespace-nowrap text-muted hover:text-ink">Quote</a>
        <span class="ml-auto hidden text-xs text-muted sm:block">{{ doc.product?.name_en || doc.product?.name }}</span>
      </div>
    </nav>

    <template v-for="(section, i) in sections" :key="section.id || i">
      <SectionHero v-if="section.kind === 'hero'" :page="doc" :section="section" :media="media" />

      <SectionOverview
        v-else-if="section.kind === 'overview'"
        :translation="section.data"
        :section="section"
        :media="media"
      />

      <SectionFeature
        v-else-if="section.kind === 'feature'"
        :translation="section.data"
        :section="section"
        :media="media"
        :index="featureIndex[i]"
      />

      <SectionApplications
        v-else-if="section.kind === 'applications'"
        :translation="section.data"
        :section="section"
        :media="media"
      />

      <SectionVideo
        v-else-if="section.kind === 'video'"
        :translation="section.data"
        :section="section"
      />

      <SectionSpecs
        v-else-if="section.kind === 'spec_table'"
        :translation="section.data"
        :specs="doc.specs"
      />

      <SectionFaq
        v-else-if="section.kind === 'faq'"
        :translation="section.data"
        :faqs="doc.faqs"
      />

      <QuoteForm
        v-else-if="section.kind === 'quote'"
        :translation="section.data"
        :product-id="doc.ids?.product_id || null"
        :page-id="doc.ids?.page_id || null"
        :source-page="`/products/${slug}`"
        :headline="doc.page?.headline"
      />

      <SectionNotes
        v-else-if="section.kind === 'notes'"
        :translation="section.data"
        :notes="doc.notes"
      />
    </template>
  </div>
</template>