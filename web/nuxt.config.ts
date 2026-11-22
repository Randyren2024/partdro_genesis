import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@ant-design-vue/nuxt'],
  antd: {
    extractStyle: true,
  },
  css: ['ant-design-vue/dist/reset.css', '~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    supabaseUrl: process.env.NUXT_SUPABASE_URL || 'https://hnkgricoixaptworlarg.supabase.co',
    supabaseServiceKey: process.env.NUXT_SUPABASE_SERVICE_KEY || '',
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      siteName: 'Partdro',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      titleTemplate: (t) => (t ? `${t} | Partdro` : 'Partdro'),
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0B0F14' },
      ],
      link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    },
  },
  nitro: {
    preset: 'cloudflare_module',
    compressPublicAssets: true,
  },
  routeRules: {
    '/': { redirect: { to: '/products', statusCode: 302 } },
  },
})