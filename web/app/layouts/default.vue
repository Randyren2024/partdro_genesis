<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="sticky top-0 z-40 border-b border-white/10 bg-ink/95 backdrop-blur">
      <div class="container-page flex h-16 items-center justify-between">
        <NuxtLink to="/products" class="flex items-center gap-2 text-white">
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold">P</span>
          <span class="text-sm font-semibold tracking-[0.22em]">PARTDRO</span>
        </NuxtLink>
        <nav class="hidden items-center gap-8 text-sm text-white/70 md:flex">
          <NuxtLink to="/products" class="hover:text-white">Products</NuxtLink>
          <a href="/products#quote" class="hover:text-white">Contact</a>
        </nav>
        <NuxtLink to="/products" class="rounded-full border border-white/25 px-5 py-2 text-xs font-semibold text-white hover:border-white/60">
          Request a quote
        </NuxtLink>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="bg-ink text-white/70">
      <div class="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div class="mb-4 flex items-center gap-2 text-white">
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold">P</span>
            <span class="text-sm font-semibold tracking-[0.22em]">PARTDRO</span>
          </div>
          <p class="max-w-xs text-sm leading-6">
            Configured drone platforms for agriculture, logistics, inspection and emergency response.
          </p>
        </div>
        <div>
          <h3 class="mb-3 text-sm font-semibold text-white">Products</h3>
          <ul class="space-y-2 text-sm">
            <li><NuxtLink to="/products" class="hover:text-white">All products</NuxtLink></li>
            <li><NuxtLink to="/products?category=agricultural" class="hover:text-white">Agricultural</NuxtLink></li>
            <li><NuxtLink to="/products?category=logistics" class="hover:text-white">Logistics</NuxtLink></li>
            <li><NuxtLink to="/products?category=helicopter" class="hover:text-white">Unmanned helicopters</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h3 class="mb-3 text-sm font-semibold text-white">Support</h3>
          <ul class="space-y-2 text-sm">
            <li><a href="/products#quote" class="hover:text-white">Request a quote</a></li>
            <li><a href="/products#quote" class="hover:text-white">Configuration help</a></li>
          </ul>
        </div>
        <div>
          <h3 class="mb-3 text-sm font-semibold text-white">Contact</h3>
          <p class="text-sm">Send your requirements through the quote form and our team will reply within one business day.</p>
        </div>
      </div>
      <div class="border-t border-white/10 py-5">
        <div class="container-page text-xs text-white/50">
          © {{ year }} Partdro. All rights reserved. Specifications are provided by the manufacturer and subject to change.
        </div>
      </div>
    </footer>
  </div>
</template>