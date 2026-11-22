<script setup lang="ts">
const route = useRoute()

const { data, error } = await useFetch('/api/products')

if (error.value) {
  throw createError({ statusCode: 500, statusMessage: 'Unable to load products' })
}

const active = ref<string>((route.query.category as string) || 'all')

const products = computed(() => {
  const list = data.value?.products || []
  return active.value === 'all' ? list : list.filter((p) => p.category === active.value)
})

function selectCategory(slug: string) {
  active.value = slug
  navigateTo({ query: slug === 'all' ? {} : { category: slug } }, { replace: true })
}

useSeoMeta({
  title: 'Drones & unmanned systems',
  description: 'Configured drone platforms for agriculture, logistics, inspection, emergency response and heavy lift.',
  ogTitle: 'Drones & unmanned systems | Partdro',
  ogDescription: 'Configured drone platforms for agriculture, logistics, inspection, emergency response and heavy lift.',
})
</script>

<template>
  <div>
    <section class="bg-ink text-white">
      <div class="container-page py-16 sm:py-24">
        <p class="eyebrow">Product catalogue</p>
        <h1 class="h-display mt-4 max-w-3xl">Drones and unmanned systems, configured for the mission.</h1>
        <p class="mt-6 max-w-2xl text-base leading-7 text-white/70">
          Multi-rotors, coaxial helicopters, tethered platforms and flight control systems — supplied with configuration,
          documentation and regional support.
        </p>
      </div>
    </section>

    <section class="section">
      <div class="container-page">
        <div class="mb-8 flex flex-wrap items-center gap-2">
          <button
            class="rounded-full border px-4 py-2 text-sm font-medium transition"
            :class="active === 'all' ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:border-ink/40'"
            @click="selectCategory('all')"
          >
            All
          </button>
          <button
            v-for="c in data?.categories || []"
            :key="c.slug"
            class="rounded-full border px-4 py-2 text-sm font-medium transition"
            :class="active === c.slug ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:border-ink/40'"
            @click="selectCategory(c.slug)"
          >
            {{ c.name }}
          </button>
        </div>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ProductCard v-for="p in products" :key="p.slug" :product="p" />
        </div>

        <p v-if="!products.length" class="py-16 text-center text-sm text-muted">
          No products in this category.
        </p>
      </div>
    </section>

    <section id="quote" class="bg-[#f6f7f9]">
      <div class="container-page flex flex-col items-start gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="eyebrow">Next step</p>
          <h2 class="h-section mt-3">Tell us what the aircraft has to do.</h2>
          <p class="mt-3 max-w-xl text-sm leading-6 text-muted">
            Payload, endurance, site conditions and region are enough to start. Our team replies with a configuration and
            lead time.
          </p>
        </div>
        <a href="/products#quote" class="btn-primary">Request a quote</a>
      </div>
    </section>
  </div>
</template>