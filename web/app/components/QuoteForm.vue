<script setup lang="ts">
const props = defineProps<{
  translation: any
  productId: string | null
  pageId: string | null
  sourcePage: string
  headline: string
}>()

const state = reactive({
  name: '',
  email: '',
  phone: '',
  company: '',
  country: '',
  message: '',
  website: '',
})

const pending = ref(false)
const done = ref(false)
const error = ref<string | null>(null)

async function submit() {
  pending.value = true
  error.value = null
  try {
    await $fetch('/api/quote', {
      method: 'POST',
      body: {
        ...state,
        product_id: props.productId,
        page_id: props.pageId,
        source_page: props.sourcePage,
      },
    })
    done.value = true
    Object.assign(state, { name: '', email: '', phone: '', company: '', country: '', message: '' })
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Something went wrong. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section id="quote" class="section anchor-offset border-t border-line bg-[#f8f9fb]">
    <div class="container-page grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <p class="eyebrow">{{ translation?.kicker || 'Pricing' }}</p>
        <h2 class="h-section mt-3">{{ translation?.title || 'Request a quote' }}</h2>
        <p class="mt-4 max-w-md text-sm leading-7 text-muted">
          {{ translation?.body || 'Pricing depends on configuration, region and deployment scale. Tell us what you need and our team will come back with a tailored offer.' }}
        </p>
        <ul class="mt-6 space-y-3 text-sm text-muted">
          <li>• Configuration matched to your payload and site</li>
          <li>• Regional pricing and delivery lead times</li>
          <li>• Support with documentation and after-sales planning</li>
        </ul>
      </div>

      <form class="rounded-2xl border border-line bg-white p-6 sm:p-8" @submit.prevent="submit">
        <div v-if="done" class="py-10 text-center">
          <p class="text-lg font-semibold">Thank you — your request has been received.</p>
          <p class="mt-2 text-sm text-muted">Our team will reply within one business day.</p>
          <button type="button" class="btn-outline mt-6" @click="done = false">Send another request</button>
        </div>
        <template v-else>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="text-xs font-medium text-muted">Full name *</span>
              <input v-model="state.name" required maxlength="120" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" >
            </label>
            <label class="block">
              <span class="text-xs font-medium text-muted">Work email *</span>
              <input v-model="state.email" type="email" required maxlength="200" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" >
            </label>
            <label class="block">
              <span class="text-xs font-medium text-muted">Phone / WhatsApp</span>
              <input v-model="state.phone" maxlength="60" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" >
            </label>
            <label class="block">
              <span class="text-xs font-medium text-muted">Company</span>
              <input v-model="state.company" maxlength="160" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" >
            </label>
            <label class="block sm:col-span-2">
              <span class="text-xs font-medium text-muted">Country / region</span>
              <input v-model="state.country" maxlength="80" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" >
            </label>
            <label class="block sm:col-span-2">
              <span class="text-xs font-medium text-muted">What should the aircraft do?</span>
              <textarea v-model="state.message" rows="4" maxlength="4000" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent" />
            </label>
          </div>

          <input v-model="state.website" type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" >

          <p v-if="error" class="mt-4 text-sm text-red-600">{{ error }}</p>

          <button type="submit" class="btn-primary mt-6 w-full sm:w-auto" :disabled="pending">
            {{ pending ? 'Sending…' : 'Request a quote' }}
          </button>
          <p class="mt-3 text-xs text-muted">We use these details only to respond to this inquiry.</p>
        </template>
      </form>
    </div>
  </section>
</template>