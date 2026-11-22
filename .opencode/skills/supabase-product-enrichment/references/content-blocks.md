# Section data contract

`sections[].data` is the merged JSON of `product_sections.data` and
`product_section_translations.data` for the requested locale.

| kind | data shape | Notes |
|---|---|---|
| `hero` | `{ stats: [{label,value,unit}] }` | 4 stats taken from verified specs |
| `overview` | `{ kicker,title,body,points:[{label,value}] }` | body 2 paragraphs, `\n\n` separated |
| `feature` | `{ kicker,title,body,numbered? }` | 4 blocks, one image each |
| `applications` | `{ kicker,title,items:[{title,body,media_id}] }` | 4 cards |
| `video` | `{ kicker,title,body }` + `section.data.url` | only with model-matched video |
| `spec_table` | `{ kicker,title }` + specs join | groups from `product_specs.group_key` |
| `faq` | `{ kicker,title }` + `product_faqs` | 6 items |
| `quote` | `{ kicker,title,body,cta }` | no price fields |
| `notes` | `{ notes:[{marker,body}] }` | `*`, `**`, `***` + numbered if needed |
| `payloads` | `{ kicker,title,items:[{code,name,description,media_id?}] }` | optional |
| `comparison` | `{ kicker,title,columns:[variant_id],rows:[{label,values:[]}] }` | optional |
| `deployments` | `{ kicker,title,items:[{category,title,body}] }` | optional |

## Copy requirements

- English, B2B tone, factual. No superlatives that are not in the source.
- Hero: eyebrow `PD-<MODEL> · <category>`, headline = product English name,
  subheadline ≤ 160 chars, intro 2 short paragraphs.
- Overview: one paragraph on role, one on the numbers that matter.
- Feature titles: benefit-first, ≤ 8 words; body ≤ 40 words.
- Applications: concrete task, ≤ 20 words.
- FAQ: 6 questions covering payload, endurance/range, environment, transport,
  configuration, and how to get a quote.
- Never mention supplier, manufacturer, brand owner, or a price.
- Numbers in copy must exist in `product_specs`.

## Publishing block order

`hero → overview → feature ×4 → applications → [video] → spec_table → faq → quote → notes`

Optional `payloads` / `comparison` / `deployments` go between applications and spec_table.