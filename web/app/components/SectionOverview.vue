<script setup lang="ts">
const props = defineProps<{
  translation: any
  section: any
  media: any[]
}>()

const image = computed(() => props.media.find((m) => m.id === props.section?.media_id) || null)
const body = computed(() => String(props.translation?.body || '').split('\n').filter(Boolean))
</script>

<template>
  <section id="overview" class="section anchor-offset">
    <div class="container-page grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <p class="eyebrow">{{ translation?.kicker || 'Overview' }}</p>
        <h2 class="h-section mt-3">{{ translation?.title || 'Overview' }}</h2>
        <div class="prose-copy mt-6">
          <p v-for="(para, i) in body" :key="i">{{ para }}</p>
        </div>
        <dl v-if="translation?.points?.length" class="mt-8 grid grid-cols-2 gap-4">
          <div v-for="p in translation.points" :key="p.label" class="rounded-xl border border-line px-4 py-3">
            <dt class="text-xs text-muted">{{ p.label }}</dt>
            <dd class="mt-1 text-sm font-semibold">{{ p.value }}</dd>
          </div>
        </dl>
      </div>
      <div v-if="image" class="overflow-hidden rounded-2xl bg-[#eef1f4]">
        <img :src="mediaSrc(image, 1280)" :srcset="mediaSrcset(image)" sizes="(min-width: 1024px) 50vw, 100vw" :alt="image.alt || translation?.title" loading="lazy" class="h-full w-full object-cover">
      </div>
    </div>
  </section>
</template>
