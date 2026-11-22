import { runSQL, sqlQuote } from './lib.mjs';

const PUBLISH = [
  'q100-agricultural-drone',
  'q20-quadcopter-platform',
  'td550-coaxial-unmanned-helicopter',
  'zmd200-heavy-lift-multirotor',
  'unilark-s6-inspection-drone',
  'm4d-tethered-lighting-drone',
  'cz100-tethered-lighting',
  'finix200m-flight-controller',
  'finix300-flight-controller',
  'finix3000-flight-controller',
  't1400-coaxial-unmanned-helicopter',
  'td220-coaxial-unmanned-helicopter',
  'unihangar-s1-automated-dock',
  'zmd10-multirotor-drone',
  'zmd30-multirotor-drone',
  'zmd60-multirotor-drone'
];

const pages = await runSQL(`
  select pg.id, pg.slug, pg.status, pg.product_id, pr.name_en, pr.supplier_id
  from public.product_pages pg join public.products pr on pr.id = pg.product_id
  order by pg.slug
`);

const sup = await runSQL(`
  select supplier_id, profile_data->'displayName' as dn, profile_data->>'legalName' as legal,
         profile_data->'brand' as brand
  from public.supplier_profiles
`);
const namesBySupplier = {};
for (const s of sup) {
  const dn = s.dn && typeof s.dn === 'object' ? Object.values(s.dn) : [];
  const brand = s.brand && typeof s.brand === 'object' ? Object.values(s.brand) : [s.brand];
  namesBySupplier[s.supplier_id] = [...dn, s.legal, ...brand].filter((x) => typeof x === 'string' && x.length > 2);
}

const report = [];
for (const p of pages) {
  const stats = await runSQL(`
    select
      (select count(*) from public.product_sections s where s.page_id = ${sqlQuote(p.id)}) sections,
      (select count(*) from public.media_assets m where m.product_id = ${sqlQuote(p.product_id)} and m.kind='image' and m.is_public) images,
      (select count(*) from public.product_specs s where s.product_id = ${sqlQuote(p.product_id)}) specs,
      (select count(*) from public.product_faqs f where f.product_id = ${sqlQuote(p.product_id)}) faqs,
      (select count(*) from public.product_spec_values v join public.product_specs s on s.id=v.spec_id
        where s.product_id = ${sqlQuote(p.product_id)}) spec_values
  `);
  const s = stats[0];
  const json = await runSQL(`select public.get_product_page(${sqlQuote(p.slug)}, 'en') as j`);
  const text = JSON.stringify(json[0].j);
  const leaks = (namesBySupplier[p.supplier_id] || []).filter((n) => text.includes(n));
  const supplierFieldLeak = /"supplier_id"|"brand"|"source_url"/.test(text);
  const pass = s.sections >= 8 && s.images >= 5 && s.spec_values >= 3 && s.faqs >= 6 && leaks.length === 0 && !supplierFieldLeak;
  report.push({ slug: p.slug, name: p.name_en, sections: s.sections, images: s.images, spec_values: s.spec_values, faqs: s.faqs, leaks, supplierFieldLeak, pass });
}

for (const r of report) console.log(JSON.stringify(r));

for (const slug of PUBLISH) {
  const r = report.find((x) => x.slug === slug);
  if (!r) { console.log('missing', slug); continue; }
  if (!r.pass) { console.log('SKIP (failed checks)', slug); continue; }
  await runSQL(`update public.product_pages set status='published', published_at=now(), updated_at=now()
    where slug=${sqlQuote(slug)}`);
  console.log('published', slug);
}

const view = await runSQL(`select slug, locale, headline from public.public_product_pages order by slug`);
console.log('PUBLIC VIEW', JSON.stringify(view));

const sample = await runSQL(`select public.get_product_page('q100-agricultural-drone','en') as j`);
console.log('SAMPLE KEYS', Object.keys(sample[0].j));
console.log('SAMPLE SECTIONS', sample[0].j.sections.map((x) => x.kind).join(','));