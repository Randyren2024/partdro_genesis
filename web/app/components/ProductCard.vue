<script setup lang="ts">
defineProps<{
  product: {
    slug: string
    headline: string
    subheadline: string | null
    categoryName: string
    hero: { url: string; alt: string | null } | null
  }
}>()
</script>

<template>
  <NuxtLink :to="`/products/${product.slug}`" class="card group flex flex-col">
    <div class="relative aspect-[4/3] overflow-hidden bg-[#eef1f4]">
      <img
        v-if="product.hero"
        :src="product.hero.url"
        :alt="product.hero.alt || product.headline"
        loading="lazy"
        class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      >
      <div v-else class="flex h-full items-center justify-center text-sm text-muted">No image</div>
    </div>
    <div class="flex flex-1 flex-col p-5">
      <p class="eyebrow mb-2">{{ product.categoryName }}</p>
      <h3 class="text-lg font-semibold leading-snug">{{ product.headline }}</h3>
      <p v-if="product.subheadline" class="mt-2 line-clamp-3 text-sm leading-6 text-muted">
        {{ product.subheadline }}
      </p>
      <span class="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
        View details
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </div>
  </NuxtLink>
</template>