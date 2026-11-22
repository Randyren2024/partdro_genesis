<script setup lang="ts">
defineProps<{
  translation: any
  faqs: Array<{ q: string; a: string }>
}>()
</script>

<template>
  <section class="section border-t border-line bg-[#f8f9fb]">
    <div class="container-page max-w-4xl">
      <p class="eyebrow">{{ translation?.kicker || 'FAQ' }}</p>
      <h2 class="h-section mt-3">{{ translation?.title || 'Questions, answered' }}</h2>
      <div class="mt-8 divide-y divide-line border-y border-line">
        <details v-for="(f, i) in faqs" :key="i" class="group py-4" :open="i === 0">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium">
            {{ f.q }}
            <span class="text-accent transition group-open:rotate-45">+</span>
          </summary>
          <p class="mt-3 text-sm leading-7 text-muted">{{ f.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>