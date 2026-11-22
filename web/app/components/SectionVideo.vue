<script setup lang="ts">
const props = defineProps<{
  translation: any
  section: any
}>()

const url = computed(() => props.section?.data?.url || null)
const isEmbed = computed(() => !!url.value && /youtube|youtu\.be|bilibili|vimeo|ixigua|douyin/i.test(url.value))
</script>

<template>
  <section v-if="url" class="border-t border-line py-14 sm:py-20">
    <div class="container-page">
      <p class="eyebrow">{{ translation?.kicker || 'Video' }}</p>
      <h2 class="h-section mt-3">{{ translation?.title || 'See it in operation' }}</h2>
      <div class="mt-8 overflow-hidden rounded-2xl bg-ink">
        <iframe
          v-if="isEmbed"
          :src="url"
          class="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        />
        <video v-else :src="url" class="aspect-video w-full" controls playsinline preload="metadata" />
      </div>
    </div>
  </section>
</template>