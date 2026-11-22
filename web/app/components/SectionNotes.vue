<script setup lang="ts">
defineProps<{
  translation: any
  notes: Array<{ marker: string; body: string }>
}>()
</script>

<template>
  <section class="border-t border-line py-10">
    <div class="container-page">
      <ul class="space-y-2 text-xs leading-6 text-muted">
        <li v-for="(n, i) in notes" :key="i">
          <span class="mr-2 font-semibold text-ink">{{ n.marker }}</span>{{ n.body }}
        </li>
      </ul>
    </div>
  </section>
</template>