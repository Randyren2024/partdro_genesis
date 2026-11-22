# Publish gates

A page may move to `status='published'` only when every gate passes.

## Gates

| Gate | Rule |
|---|---|
| images | ≥8 public images |
| hero | landscape, width ≥1200 |
| specs | ≥8 values, `unit` present where numeric |
| CJK | 0 spec values containing `[\u4e00-\u9fa5]` |
| faqs | ≥6 |
| sections | ≥8 visible |
| media | every `public_url` returns HTTP 200 |
| leaks | no supplier display name, legal name, brand, `supplier-`, or `source_url` |
| copy | no price strings, no "manufacturer/supplier" references |
| alt | no image uses the bare product name as alt |

## Leak scan

Build the JSON with `get_product_page(slug,'en')`, stringify it, then check against:

```sql
select supplier_id, profile_data->'displayName' as dn,
       profile_data->>'legalName' as legal, profile_data->'brand' as brand
from public.supplier_profiles;
```

Also reject `"supplier_id"`, `"source_url"`, `"brand"` keys in the public payload.

## Commands

```bash
node .opencode/skills/supabase-product-enrichment/scripts/audit.mjs
node .opencode/skills/supabase-product-enrichment/scripts/validate-publish.mjs --slug <slug>
```

`validate-publish.mjs` exits non-zero on failure and prints one line per failed gate.