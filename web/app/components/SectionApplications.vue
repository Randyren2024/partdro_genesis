<script setup lang="ts">
const props = defineProps<{
  translation: any
  section: any
  media: any[]
}>()

const byId = computed(() => new Map(props.media.map((m) => [m.id, m])))
const items = computed(() => {
  const sourceItems = props.section?.data?.items || []
  const translated = props.translation?.items || []
  return translated.map((t: any, i: number) => ({
    ...t,
    image: byId.value.get(sourceItems[i]?.media_id) || null,
  }))
})
</script>

<template>
  <section class="border-t border-line bg-[#f8f9fb] py-16 sm:py-24">
    <div class="container-page">
      <p class="eyebrow">{{ translation?.kicker || 'Applications' }}</p>
      <h2 class="h-section mt-3">{{ translation?.title || 'Where it works' }}</h2>
      <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <article v-for="item in items" :key="item.title" class="overflow-hidden rounded-2xl border border-line bg-white">
          <div v-if="item.image" class="aspect-[4/3] overflow-hidden bg-[#eef1f4]">
            <img :src="mediaSrc(item.image, 640)" :srcset="mediaSrcset(item.image)" sizes="(min-width: 1024px) 25vw, 50vw" :alt="item.image.alt || item.title" loading="lazy" class="h-full w-full object-cover">
          </div>
          <div class="p-5">
            <h3 class="text-base font-semibold">{{ item.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-muted">{{ item.body }}</p>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
