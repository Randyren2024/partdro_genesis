# AGENTS.md

Crawl supplier websites with the Firecrawl CLI and load a product catalogue into the Supabase project `partdro_genesis` (`hnkgricoixaptworlarg`). No `package.json`, no build/test/lint, no git. Plain Node ESM scripts run directly with `node` (Node 24, global `fetch`).

## Commands

```powershell
node crawl/01_schema.mjs                  # idempotent DDL: products, crawl_pages, crawl_queue + supplier-media bucket
node crawl/02_queue.mjs                   # rebuild crawl_queue from supplier_profiles (seeds, priority)
node crawl/run.mjs --limit 10             # crawl pending+failed suppliers, 2 concurrent workers
node crawl/run.mjs --only supplier-001    # force one supplier regardless of status
node crawl/check.mjs supplier-001         # inspect one supplier's products/pages/queue + fetch a media URL
```

Order matters: `01 → 02 → run`. `run.mjs` shells out to the `firecrawl` CLI (`batch-scrape`), which must be on PATH (verified 1.30.0); it fails with `cli_exit_*`/`no_urls` otherwise.

## How it is wired

- No database driver. `crawl/lib.mjs` `runSQL(sql, ref = TARGET_REF)` posts raw SQL to the Supabase **Management API** `/v1/projects/{ref}/database/query`. `SOURCE_REF` (`uphfcvquglafkszqqxiq`) is the upstream project, readable through the same helper.
- SQL is built by string interpolation, not parameters: escape text with `lit()` / `sqlQuote()` and embed JSON with `jsonSql()` (`::jsonb` + `jsonb_to_recordset`). Follow that pattern instead of adding a pg client.
- `suppliers` and `supplier_profiles` are pre-existing tables and are **not** created here. `products.supplier_id` has an FK to `supplier_profiles`. Seed logic reads `profile_data` keys: `website`, `brand`, `category`, `sources[{url,type}]`, `productModels` / `knownProductModels` / `catalogueModels` / `catalogueProducts`.
- Queue lifecycle: `pending|needs_search → running → done|partial|failed`, plus `needs_search` when no website/seeds exist.

## Gotchas

- `run.mjs` **deletes** all `products` rows for the supplier where `crawler='firecrawl-cli'` and all its `crawl_pages` rows, then re-inserts. Never hand-edit those rows; rows with another `crawler` value survive.
- Only `pending` + `failed` are picked up. A crashed run leaves rows stuck in `running` forever — reset them to `failed` or use `--only`.
- `02_queue.mjs` only upserts queue rows still in `pending`/`needs_search`, so re-running it does not refresh `done`/`failed` suppliers' seeds.
- `--only` skips the status filter and can reprocess an already-`done` supplier.
- Hard caps in `run.mjs`: 6 seed URLs scraped per supplier, 8 images per product, 40 images per supplier run, 5 MB images / 50 MB videos, 60 specs. Missing media is often these caps, not a bug.
- Working files land in `crawl/out/<supplier_id>/` (`urls.txt`, `batch.json`); `batch.json` is deleted before each run. The database, not `crawl/out`, is the source of truth.
- Media is uploaded to the public bucket `supplier-media`; `media[].public_url` is assembled from `TARGET_URL`, so changing the project ref requires re-upload or re-crawl.
- `crawl/lib.mjs` hardcodes live credentials (management token, service-role key, Firecrawl key) for the production project. There is no `.env`; don't copy these into other files or output them.
- No tests exist. Verify changes with a `--only` run plus `node crawl/check.mjs <supplier_id>`.