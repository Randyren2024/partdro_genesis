import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSQL } from '../../../../crawl/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const outDir = path.join(repo, 'review');
fs.mkdirSync(outDir, { recursive: true });

const rows = await runSQL(`
  select pg.slug, pg.status, pr.id as product_id, pr.name_en, pr.model, pr.category,
    (select count(*) from public.media_assets m
      where m.product_id = pg.product_id and m.kind='image' and m.is_public) as images,
    (select count(*) from public.media_assets m
      where m.product_id = pg.product_id and m.kind in ('video','video_embed')) as videos,
    (select count(*) from public.product_spec_values v
      join public.product_specs s on s.id = v.spec_id
      where s.product_id = pg.product_id) as spec_values,
    (select count(*) from public.product_spec_values v
      join public.product_specs s on s.id = v.spec_id
      where s.product_id = pg.product_id and v.value ~ '[\\u4e00-\\u9fa5]') as cjk_values,
    (select count(*) from public.product_sections s where s.page_id = pg.id) as sections,
    (select count(*) from public.product_faqs f where f.product_id = pg.product_id) as faqs,
    (select count(*) from public.product_payloads p where p.product_id = pg.product_id) as payloads,
    (select count(*) from public.product_variants v where v.product_id = pg.product_id) as variants,
    (select count(*) from public.product_documents d where d.product_id = pg.product_id) as documents,
    (select width from public.media_assets m where m.product_id = pg.product_id and m.role='hero' and m.is_public limit 1) as hero_width,
    (select height from public.media_assets m where m.product_id = pg.product_id and m.role='hero' and m.is_public limit 1) as hero_height
  from public.product_pages pg
  join public.products pr on pr.id = pg.product_id
  order by pg.slug
`);

const orphans = await runSQL(`
  select pr.id, pr.name_en, pr.model, pr.category, pr.supplier_id,
    (select count(*) from public.media_assets m
      where m.product_id = pr.id and m.kind='image' and m.is_public) as images
  from public.products pr
  left join public.product_pages pg on pg.product_id = pr.id
  where pg.id is null
  order by pr.category, pr.model
`);

const pages = rows.map((r) => {
  const gaps = [];
  if (r.images < 8) gaps.push(`images:${r.images}<8`);
  if (r.spec_values < 8) gaps.push(`specs:${r.spec_values}<8`);
  if (r.cjk_values > 0) gaps.push(`cjk:${r.cjk_values}`);
  if (r.sections < 8) gaps.push(`sections:${r.sections}<8`);
  if (r.faqs < 6) gaps.push(`faqs:${r.faqs}<6`);
  if (!r.videos) gaps.push('video:none');
  if (!r.payloads) gaps.push('payloads:none');
  if (!r.variants) gaps.push('variants:none');
  if (!r.documents) gaps.push('documents:none');
  if (r.hero_width && r.hero_height && r.hero_width < r.hero_height) gaps.push('hero:portrait');
  if (r.hero_width && r.hero_width < 1200) gaps.push(`hero:${r.hero_width}w`);
  return { ...r, gaps, score: 100 - gaps.length * 5 };
});

const report = {
  generated_at: new Date().toISOString(),
  thresholds: { images: 8, spec_values: 8, cjk_values: 0, sections: 8, faqs: 6 },
  summary: {
    pages: pages.length,
    products: pages.length + orphans.length,
    products_without_page: orphans.length,
    pages_with_image_gap: pages.filter((p) => p.images < 8).length,
    pages_with_spec_gap: pages.filter((p) => p.spec_values < 8).length,
    pages_with_cjk: pages.filter((p) => p.cjk_values > 0).length,
    pages_without_video: pages.filter((p) => !p.videos).length,
  },
  pages,
  products_without_page: orphans,
};

fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('slug | img | vid | specs | cjk | sec | faq | gaps');
for (const p of pages) {
  console.log([p.slug, p.images, p.videos, p.spec_values, p.cjk_values, p.sections, p.faqs, p.gaps.join(',')].join(' | '));
}
console.log('\nsummary', JSON.stringify(report.summary));
console.log('written', path.join(outDir, 'audit.json'));