<script setup lang="ts">
const props = defineProps<{
  page: any
  section: any
  media: any[]
}>()

const hero = computed(() => {
  const id = props.section?.media_id
  return props.media.find((m) => m.id === id) || props.media.find((m) => m.role === 'hero') || null
})

const stats = computed(() => props.section?.data?.stats || [])
</script>

<template>
  <section class="relative isolate overflow-hidden bg-ink text-white">
    <img
      v-if="hero"
      :src="mediaSrc(hero, 1920)" :srcset="mediaSrcset(hero)" sizes="100vw"
      :alt="hero.alt || page.page.headline"
      class="absolute inset-0 h-full w-full object-cover opacity-45"
      fetchpriority="high"
    >
    <div class="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/60 to-ink" />
    <div class="container-page relative py-20 sm:py-28">
      <p class="eyebrow">{{ page.page.eyebrow }}</p>
      <h1 class="h-display mt-4 max-w-4xl">{{ page.page.headline }}</h1>
      <p class="mt-6 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">{{ page.page.subheadline }}</p>

      <div class="mt-8 flex flex-wrap gap-3">
        <a href="#quote" class="btn-primary">{{ page.page.cta?.primary || 'Request a quote' }}</a>
        <a href="#specs" class="btn-ghost">View specifications</a>
      </div>

      <dl v-if="stats.length" class="mt-14 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
        <div v-for="s in stats" :key="s.label">
          <dt class="text-xs uppercase tracking-[0.16em] text-white/50">{{ s.label }}</dt>
          <dd class="mt-2 text-2xl font-semibold sm:text-3xl">
            {{ s.value }}<span v-if="s.unit" class="ml-1 text-sm font-medium text-white/60">{{ s.unit }}</span>
          </dd>
        </div>
      </dl>

      <div v-if="page.page.intro" class="prose-copy mt-12 max-w-3xl">
        <p v-for="(para, i) in String(page.page.intro).split('\n').filter(Boolean)" :key="i" class="!text-white/70">
          {{ para }}
        </p>
      </div>
    </div>
  </section>
</template>
