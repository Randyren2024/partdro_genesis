import { runSQL, sqlQuote } from '../../../../crawl/lib.mjs';

const args = process.argv.slice(2);
const slug = args[args.indexOf('--slug') + 1];
if (!slug) { console.error('usage: validate-publish.mjs --slug <slug>'); process.exit(2); }

const rows = await runSQL(`
  select pg.id as page_id, pg.status, pg.product_id, pr.name_en, pr.supplier_id
  from public.product_pages pg join public.products pr on pr.id = pg.product_id
  where pg.slug = ${sqlQuote(slug)}
`);
if (!rows.length) { console.error('page not found'); process.exit(2); }
const p = rows[0];

const stats = await runSQL(`
  select
    (select count(*) from public.media_assets where product_id=${sqlQuote(p.product_id)} and kind='image' and is_public) images,
    (select count(*) from public.product_spec_values v join public.product_specs s on s.id=v.spec_id
      where s.product_id=${sqlQuote(p.product_id)}) specs,
    (select count(*) from public.product_spec_values v join public.product_specs s on s.id=v.spec_id
      where s.product_id=${sqlQuote(p.product_id)} and v.value ~ '[\\u4e00-\\u9fa5]') cjk,
    (select count(*) from public.product_faqs where product_id=${sqlQuote(p.product_id)}) faqs,
    (select count(*) from public.product_sections where page_id=${sqlQuote(p.page_id)} and is_visible) sections,
    (select width from public.media_assets where product_id=${sqlQuote(p.product_id)} and role='hero' and is_public limit 1) hero_w,
    (select height from public.media_assets where product_id=${sqlQuote(p.product_id)} and role='hero' and is_public limit 1) hero_h
`);
const s = stats[0];

const pageJson = await runSQL(`select public.get_product_page(${sqlQuote(slug)}, 'en') as j`);
const text = JSON.stringify(pageJson[0].j);
const prof = await runSQL(`select profile_data->'displayName' as dn, profile_data->>'legalName' as legal,
  profile_data->'brand' as brand from public.supplier_profiles where supplier_id=${sqlQuote(p.supplier_id)}`);
const names = [];
if (prof[0]) {
  const dn = prof[0].dn && typeof prof[0].dn === 'object' ? Object.values(prof[0].dn) : [];
  const br = prof[0].brand && typeof prof[0].brand === 'object' ? Object.values(prof[0].brand) : [prof[0].brand];
  names.push(...dn, prof[0].legal, ...br);
}
const leaks = names.filter((n) => typeof n === 'string' && n.length > 2 && text.includes(n));

const media = pageJson[0].j.media || [];
let broken = 0;
for (const m of media.slice(0, 8)) {
  if (!m.url) continue;
  try { const r = await fetch(m.url, { method: 'HEAD' }); if (!r.ok) broken++; } catch { broken++; }
}

const gates = [
  ['images >= 8', s.images >= 8, s.images],
  ['specs >= 8', s.specs >= 8, s.specs],
  ['cjk == 0', s.cjk === 0, s.cjk],
  ['faqs >= 6', s.faqs >= 6, s.faqs],
  ['sections >= 8', s.sections >= 8, s.sections],
  ['hero >= 1200w', !!s.hero_w && s.hero_w >= 1200, `${s.hero_w}x${s.hero_h}`],
  ['no supplier leak', leaks.length === 0, leaks.join(',') || 'clean'],
  ['no supplier field', !/"supplier_id"|"source_url"|"brand"/.test(text), 'ok'],
  ['media reachable', broken === 0, broken],
];

let failed = 0;
for (const [name, ok, value] of gates) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${value})`);
}
console.log(`status=${p.status} slug=${slug}`);
process.exit(failed ? 1 : 0);