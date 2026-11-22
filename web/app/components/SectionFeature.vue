<script setup lang="ts">
const props = defineProps<{
  translation: any
  section: any
  media: any[]
  index: number
}>()

const image = computed(() => props.media.find((m) => m.id === props.section?.media_id) || null)
const reverse = computed(() => props.index % 2 === 1)
</script>

<template>
  <section class="border-t border-line py-14 sm:py-20">
    <div
      class="container-page grid items-center gap-10 lg:grid-cols-2"
      :class="reverse ? 'lg:[&>figure]:order-first' : ''"
    >
      <div>
        <p class="eyebrow">{{ translation?.kicker || 'Capability' }}</p>
        <h2 class="h-section mt-3 max-w-xl">{{ translation?.title }}</h2>
        <p class="prose-copy mt-5 max-w-xl text-[15px] leading-7 text-muted">{{ translation?.body }}</p>
      </div>
      <figure v-if="image" class="overflow-hidden rounded-2xl bg-[#eef1f4]">
        <img :src="mediaSrc(image, 1280)" :srcset="mediaSrcset(image)" sizes="(min-width: 1024px) 50vw, 100vw" :alt="image.alt || translation?.title" loading="lazy" class="h-full w-full object-cover">
      </figure>
    </div>
  </section>
</template>
