<script setup lang="ts">
const props = defineProps<{
  translation: any
  specs: Array<{ group: string; label: string; value: string; unit: string | null }>
}>()

const groups = computed(() => {
  const order = ['performance', 'dimensions', 'environment', 'navigation', 'power', 'payload', 'operations', 'compatibility', 'general']
  const map = new Map<string, typeof props.specs>()
  for (const s of props.specs) {
    if (!map.has(s.group)) map.set(s.group, [])
    map.get(s.group)!.push(s)
  }
  return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
})

function titleFor(group: string) {
  const labels: Record<string, string> = {
    performance: 'Performance',
    dimensions: 'Dimensions & weight',
    environment: 'Environment',
    navigation: 'Navigation',
    power: 'Power',
    payload: 'Payload',
    operations: 'Operations',
    compatibility: 'Compatibility',
    general: 'General',
  }
  return labels[group] || group
}
</script>

<template>
  <section id="specs" class="section anchor-offset border-t border-line">
    <div class="container-page">
      <p class="eyebrow">{{ translation?.kicker || 'Specifications' }}</p>
      <h2 class="h-section mt-3">{{ translation?.title || 'Specifications' }}</h2>

      <div class="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <div v-for="[group, items] in groups" :key="group">
          <h3 class="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted">{{ titleFor(group) }}</h3>
          <dl>
            <div v-for="s in items" :key="s.label" class="spec-row">
              <dt>{{ s.label }}</dt>
              <dd>{{ s.value }}<span v-if="s.unit" class="ml-1 text-muted">{{ s.unit }}</span></dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </section>
</template>