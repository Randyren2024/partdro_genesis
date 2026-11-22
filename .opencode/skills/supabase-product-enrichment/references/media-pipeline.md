# Media pipeline

## Intake filters

Reject when any is true:

- URL matches `logo|icon|sprite|placeholder|qrcode|qr_code|weixin|wechat|avatar|candan|close|search|arrow|banner|line\.png`
- `naturalWidth < 800` or `naturalHeight < 400`
- content-type is not `image/*`, or is SVG
- bytes `< 20000` or `> 5MB`
- duplicate `sha256` within the same product

Cap: 14 public images per product, 40 image downloads per run.

## Role rules

| Role | Rule |
|---|---|
| `hero` | largest landscape image, aspect 1.2–2.4, width ≥1200; fallback to largest |
| `overview` | second-best landscape image |
| `feature` | one per feature section, 4 total |
| `application` | one per application card, 4 total |
| `gallery` | remaining accepted images |
| `package` / `payload` | only when matched to a variant/payload |
| `logo` | never public |

Reassigning roles must also update `product_sections.media_id` for `hero` and `overview`.

## Storage

```
supplier-media/products/{product_id}/{role}/{sha16}.{ext}
```

`public_url = https://<ref>.supabase.co/storage/v1/object/public/supplier-media/<path>`

The public path must never contain `supplier-<id>`.

## Derivatives

Generate webp at 640, 1280, 1920 (skip widths ≥ original width) with quality 78.
Store in `media_assets.derivatives`:

```json
{ "w640": "...-w640.webp", "w1280": "...-w1280.webp", "w1920": "...-w1920.webp" }
```

Frontend picks `w640` for cards, `w1280` for sections, `w1920` for hero.

## Alt text

Pattern: `"{product name} — {role or subject}"`.

Examples:

- hero: `Q100 Agricultural Drone — aircraft in flight over a field`
- feature: `Q100 Agricultural Drone — folded for transport`
- application: `Q100 Agricultural Drone — orchard spraying`

Never reuse the bare product name for every image. Record alt in `alt_i18n.en`.

## Video

- Direct `mp4/webm` → download (≤50MB) → `products/{id}/videos/{sha16}.{ext}`
- YouTube/Bilibili/Vimeo → store as `kind='video_embed'`, URL only
- Reject when the URL/heading does not contain the product model
- Only one video section per page

## Cleanup

When a media item is replaced, set the old row `is_public=false` instead of deleting, so
the change is reversible.