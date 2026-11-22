---
name: supabase-product-enrichment
description: Enrich the partdro_genesis Supabase catalogue (products, media_assets, product_specs, product_sections, FAQs) from supplier websites using Kimi WebBridge first and Firecrawl as a capped fallback. Produces a review package instead of writing to the database unless explicitly approved. Use when asked to "enrich product data", "补规格/补图/补视频", "让落地页数据更丰富", "audit product data quality", or "build product landing page data" for the Partdro catalogue.
---

# Supabase Product Enrichment

Repeatable workflow for making the Partdro catalogue data complete enough for
production landing pages: images, videos, specifications and page blocks, written to
Supabase (`hnkgricoixaptworlarg`) with quality gates.

## When to use

- "丰富产品数据 / 把数据做厚"
- "补规格 / 补图片 / 补视频"
- "这个产品页太空了"
- "audit 一下产品数据质量"
- preparing data for a new landing page

## Non-negotiables

1. No prices, no supplier name / manufacturer name / `supplier-` path, no `source_url` in public data.
2. Only model-matching videos. Global banners and other models are rejected.
3. Images: public ≤14/product, file ≤5MB, reject logo/icon/banner/QR/watermark.
4. Specs must carry units and be verifiable. Never invent numbers.
5. Copy numbers must match the spec table; footnotes must map to body claims.
6. **Default is review-only.** Write to Supabase only after the human approves the review package (`--apply`).
7. `--dry-run` is mandatory for any write pass.

## Credentials and tooling

- DB access: `crawl/lib.mjs` (`runSQL`, `storageUpload`, `TARGET_URL`, `sqlQuote`, `jsonSql`).
  Do not copy tokens into new files.
- Browser extraction: `crawl/bridge.mjs` (Kimi WebBridge daemon on `127.0.0.1:10086`).
  Health check: `~/.kimi-webbridge/bin/kimi-webbridge status`.
- Image processing: `sharp` from `crawl/node_modules` (resize + webp derivatives).
- Firecrawl CLI: fallback only. Check `firecrawl --status` first. Budget: ≤2 credits per
  product, ≤300 per run.

## Workflow

### 1. Audit

```bash
node .opencode/skills/supabase-product-enrichment/scripts/audit.mjs
```

Writes `review/audit.json` and prints a per-product gap table:

- public images < 8
- spec values < 8, or spec values containing CJK
- sections < 8
- no model-matching video
- missing payload / variant / document blocks
- hero/overview missing or portrait
- products without a page

Gap thresholds live in `references/audit-queries.md`.

### 2. Source discovery

For a product, use in order:

1. `products.source_url` (product detail page)
2. supplier product list / category page
3. sitemap (`/sitemap.xml`) via WebBridge or Firecrawl `map` (1 credit)

Never crawl the whole site. Cap at 6 pages per product.

### 3. Extract (WebBridge)

Use `references/webridge-extraction.md` for the DOM script. Capture:

- images: `currentSrc`, `srcset`, `<picture><source>`, `data-src`, CSS background
- videos: `<video>`, `<source>`, iframes (YouTube/Bilibili/Vimeo)
- specs: `<table>` rows, `<dl>`, heading→value pairs
- documents: `a[href$=".pdf"]`
- section text: h2/h3 + paragraphs (for feature/application copy)

Write raw output to `review/raw/{product_id}.json`.

### 4. Normalize

- Image filters: width ≥800, height ≥400, bytes ≥20KB, reject `BAD_IMAGE` patterns.
- Deduplicate by `sha256` and normalized URL; keep the largest variant.
- Hero selection: aspect 1.1–2.4 preferred, largest area wins; portrait only as last resort.
- Specs: map Chinese labels to English via `references/spec-normalization.md`; strip
  phone/address/service-time noise; split value/unit.
- Videos: keep only if filename or surrounding title contains the product model.

### 5. Media plan

Use `references/media-pipeline.md`:

- storage path `products/{product_id}/{role}/{sha16}.{ext}`
- roles: `hero`, `overview`, `feature`, `application`, `package`, `payload`, `gallery`
- derivatives: 640 / 1280 / 1920 webp (skip if original smaller)
- alt text: `"{product name} — {role description}"`, not the bare product name

### 6. Compose page blocks

`references/content-blocks.md` defines the data contract for all section kinds and the
copy requirements. Every published page needs:

`hero, overview, feature ×4, applications, spec_table, faq, quote, notes`
(plus `video`, `payloads`, `comparison`, `deployments` when data exists)

### 7. Review package (default output)

```bash
node .opencode/skills/supabase-product-enrichment/scripts/review-package.mjs \
  --products finix300,finix3000,unilark-s6-inspection-drone
```

Produces:

- `review/packages/{slug}.json` — proposed media uploads, spec updates, alt text, video
- `review/SUMMARY.md` — one table of changes per product with risk notes

Nothing is written to Supabase. Present the package and wait for approval.

### 8. Apply (only after approval)

```bash
node .opencode/skills/supabase-product-enrichment/scripts/apply-package.mjs \
  --products <slug,slug,...>            # dry run (default)
node .opencode/skills/supabase-product-enrichment/scripts/apply-package.mjs \
  --products <slug,slug,...> --apply    # write
```

Review the dry run, then add `--apply`. Applying:

1. downloads + uploads images, generates derivatives, upserts `media_assets`
   (images are skipped when the product already has ≥8 public images)
2. updates `product_specs` / `product_spec_values`
3. updates `product_sections` media_id + section translations
4. writes `product_payloads` / `product_variants` / `product_documents` when present
5. never sets `status='published'`; publishing is a separate manual gate

After applying, run `scripts/fix-specs.mjs` for curated English overrides where
crawled values are Chinese or garbled. It is idempotent and only touches the
products listed in its `CURATED` map.

### 9. Publish gate

`references/publish-gates.md`. Run:

```bash
node .opencode/skills/supabase-product-enrichment/scripts/validate-publish.mjs --slug <slug>
```

Publish only when: images ≥8, specs ≥8, CJK spec values 0, FAQs ≥6, sections ≥8,
zero supplier/brand/source leaks, every media URL returns 200.

Supplier asset ceiling: some suppliers (Efy, Zhonghangzhi) expose only 3–7 unique
product visuals, with responsive `-640/-1280` variants of the same files. Do not
pad the gallery with duplicates or unrelated site banners. Keep the page published
with a `needs_assets` note instead.

## Output contract

Media item:

```json
{
  "type": "image",
  "role": "hero",
  "storage_path": "products/<uuid>/hero/<sha16>.jpg",
  "public_url": "https://<ref>.supabase.co/storage/v1/object/public/supplier-media/...",
  "source_url": "https://supplier.example/…",
  "bytes": 482113,
  "width": 1920,
  "height": 960,
  "sha256": "…",
  "alt_i18n": { "en": "Q100 Agricultural Drone — field spraying" },
  "is_public": true,
  "sort_order": 0
}
```

Section kinds: `hero|overview|feature|applications|video|spec_table|faq|quote|notes|payloads|comparison|deployments|gallery`.

## Failure handling

- WebBridge unavailable → `references/operations.md` in the kimi-webbridge skill; do not guess fixes.
- Site blocks automation → skip product, record `blocked` in the review package.
- Firecrawl credits exhausted → stop, report remaining gaps, do not switch tools silently.
- Extraction yields <4 usable images → mark `needs_assets` and continue; never pad with icons.