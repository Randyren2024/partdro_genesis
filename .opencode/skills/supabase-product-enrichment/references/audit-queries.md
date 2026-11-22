# Audit queries and thresholds

Connection: `crawl/lib.mjs` → `runSQL(sql)` (Management API, project `hnkgricoixaptworlarg`).

## Per-page counts

```sql
select pg.slug, pg.status, pr.name_en, pr.model, pr.category,
  (select count(*) from public.media_assets m
     where m.product_id = pg.product_id and m.kind = 'image' and m.is_public) as images,
  (select count(*) from public.media_assets m
     where m.product_id = pg.product_id and m.kind = 'video') as videos,
  (select count(*) from public.product_spec_values v
     join public.product_specs s on s.id = v.spec_id
     where s.product_id = pg.product_id) as spec_values,
  (select count(*) from public.product_sections s where s.page_id = pg.id) as sections,
  (select count(*) from public.product_faqs f where f.product_id = pg.product_id) as faqs,
  (select count(*) from public.product_payloads p where p.product_id = pg.product_id) as payloads,
  (select count(*) from public.product_variants v where v.product_id = pg.product_id) as variants,
  (select count(*) from public.product_documents d where d.product_id = pg.product_id) as documents
from public.product_pages pg
join public.products pr on pr.id = pg.product_id
order by images asc;
```

## CJK in spec values

```sql
select pr.name_en, v.label, v.value
from public.product_spec_values v
join public.product_specs s on s.id = v.spec_id
join public.products pr on pr.id = s.product_id
where v.value ~ '[\u4e00-\u9fa5]';
```

## Products without a page

```sql
select pr.id, pr.name_en, pr.model, pr.category, pr.supplier_id,
       (select count(*) from public.media_assets m
          where m.product_id = pr.id and m.kind='image' and m.is_public) as images
from public.products pr
left join public.product_pages pg on pg.product_id = pr.id
where pg.id is null
order by pr.category, pr.model;
```

## Media health

```sql
-- heroes not landscape
select id, product_id, width, height, public_url
from public.media_assets
where kind='image' and role='hero' and (width < height or width < 1200);

-- images without derivatives
select count(*) from public.media_assets
where kind='image' and is_public and (derivatives = '{}'::jsonb);

-- private images that may be junk
select product_id, source_url from public.media_assets
where kind='image' and is_public = false;
```

## Thresholds

| Field | Minimum | Target |
|---|---|---|
| public images | 8 | 10–14 |
| spec values | 8 | 12–24 |
| CJK spec values | 0 | 0 |
| FAQs | 6 | 6–8 |
| sections | 8 | 9–12 |
| video | optional | 1 model-matching |
| hero | ≥1200×600, landscape | 1600–1920 wide |
| documents | optional | datasheet if available |