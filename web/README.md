# Partdro web

Nuxt 4 storefront for the Partdro product catalogue. Product data comes from Supabase
(`public_product_pages` view and `get_product_page` RPC); quote requests are written to
`quote_requests`.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

Environment (`web/.env`):

```
NUXT_SUPABASE_URL=https://<project-ref>.supabase.co
NUXT_SUPABASE_SERVICE_KEY=<service_role key>   # server only
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

The service key is only read by server routes (`server/api/*`), never sent to the browser.

## Build and preview

```bash
npm run build
npx wrangler dev .output/server/index.mjs --assets .output/public
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put NUXT_SUPABASE_SERVICE_KEY
npx wrangler secret put NUXT_SUPABASE_URL
npx wrangler deploy
```

`wrangler.jsonc` uses the `cloudflare_module` Nitro preset with static assets.

## Routes

| Route | Purpose |
|---|---|
| `/` | 302 → `/products` |
| `/products` | Published catalogue with category filters |
| `/products/[slug]` | Landing page rendered from `get_product_page` |
| `/api/products` | Catalogue cards (server-side Supabase) |
| `/api/products/[slug]` | Full page JSON |
| `/api/quote` | Quote form submission (rate limited, honeypot) |
| `/sitemap.xml`, `/robots.txt` | Generated from published pages |