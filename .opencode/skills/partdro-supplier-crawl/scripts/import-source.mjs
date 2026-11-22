import { runSQL, lit, log, has, arg } from './_shared.mjs';
import { SOURCE_REF } from '../../../../crawl/lib.mjs';
import { productSlug, sha16, clean } from '../../../../crawl/parse.mjs';

const APPLY = has('apply');
const INCLUDE_ARCHIVED = has('include-archived');
const LIMIT = Number(arg('limit', 0)) || 0;
const ONLY = arg('only', null);
const PAGE = 150;

const FIELDS = `id, supplier_id, slug, name, name_en, model, brand, category, product_type,
  summary, description, specifications, features, applications, media, documents,
  source_url, source_urls, source_type, verification_status, status, language,
  source_verified_at, crawled_at`;

async function fetchSource() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const where = [`status <> 'archived'`];
    if (INCLUDE_ARCHIVED) where.pop();
    if (ONLY) where.push(`supplier_id = ${lit(ONLY)}`);
    const part = await runSQL(`
      select ${FIELDS} from public.products
      where ${where.join(' and ')}
      order by id
      limit ${PAGE} offset ${offset}
    `, SOURCE_REF);
    rows.push(...part);
    if (part.length < PAGE) break;
    if (LIMIT && rows.length >= LIMIT) break;
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

function normalizeMedia(arr, pageUrl) {
  if (!Array.isArray(arr)) return [];
  return arr.map((m) => {
    if (typeof m === 'string') return { type: 'image', public_url: m, source_url: pageUrl };
    if (!m) return null;
    const url = m.public_url || m.url || m.storage_path;
    if (!url) return null;
    return {
      type: m.type || 'image',
      public_url: url,
      source_url: m.source_url || pageUrl,
      alt: m.alt || null,
      attribution: m.attribution || null
    };
  }).filter(Boolean);
}

function normalizeDocs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((d) => {
    if (typeof d === 'string') return { type: 'pdf', url: d };
    if (!d) return null;
    const url = d.url || d.public_url;
    return url ? { type: d.type || 'pdf', url, label: d.label || null } : null;
  }).filter(Boolean);
}

function normalizeFeatures(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).map(clean);
  if (v && typeof v === 'object') return Object.entries(v).map(([k, val]) => `${k}: ${clean(String(val))}`);
  return [];
}

function normalizeApplications(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).map(clean);
  if (v && typeof v === 'object') return Object.values(v).filter((x) => typeof x === 'string').map(clean);
  return [];
}

const score = (r) =>
  (r.status === 'published' ? 100 : 0) +
  (r.specifications && Object.keys(r.specifications || {}).length ? 20 : 0) +
  (Array.isArray(r.media) && r.media.length ? 10 : 0) +
  ((r.description || '').length > 80 ? 5 : 0) +
  (r.name_en ? 2 : 0);

const rows = await fetchSource();
log(`source rows: ${rows.length}${INCLUDE_ARCHIVED ? ' (archived included)' : ' (archived skipped)'}`);

const byKey = new Map();
for (const r of rows) {
  const key = r.model
    ? `m:${r.supplier_id}|${String(r.model).toLowerCase()}`
    : `n:${r.supplier_id}|${String(r.name || '').toLowerCase()}`;
  const cur = byKey.get(key);
  if (!cur || score(r) > score(cur)) byKey.set(key, r);
}
const deduped = [...byKey.values()];

const target = await runSQL(`select id, slug, supplier_id, model, name from public.products`);
const tModel = new Set(target.filter((r) => r.model).map((r) => `${r.supplier_id}|${String(r.model).toLowerCase()}`));
const tName = new Set(target.map((r) => `${r.supplier_id}|${String(r.name || '').toLowerCase()}`));
const tSlug = new Set(target.map((r) => r.slug).filter(Boolean));
const planned = new Set();
const plannedSlug = new Set();

let conflict = 0;
const inserts = [];
for (const r of deduped) {
  const mk = r.model ? `${r.supplier_id}|${String(r.model).toLowerCase()}` : null;
  const nk = `${r.supplier_id}|${String(r.name || '').toLowerCase()}`;
  if (mk && tModel.has(mk)) { conflict++; continue; }
  if (!mk && tName.has(nk)) { conflict++; continue; }
  if (planned.has(mk || `n:${nk}`)) { conflict++; continue; }

  const desc = clean(r.description || '');
  const summary = clean(r.summary || '') || desc.slice(0, 300) || null;
  let slug = r.slug || productSlug(r.supplier_id, r.model || r.name, r.source_url || r.id);
  if (tSlug.has(slug) || plannedSlug.has(slug)) slug = `${slug}-${sha16(r.id).slice(0, 6)}`;
  if (tSlug.has(slug) || plannedSlug.has(slug)) { conflict++; continue; }
  planned.add(mk || `n:${nk}`);
  plannedSlug.add(slug);

  inserts.push({
    supplier_id: r.supplier_id,
    slug,
    name: clean(r.name) || r.model || 'Unnamed product',
    name_en: clean(r.name_en || '') || null,
    model: clean(r.model || '') || null,
    brand: clean(r.brand || '') || null,
    category: clean(r.category || '') || null,
    product_type: clean(r.product_type || '') || null,
    summary,
    description: desc || null,
    specifications: r.specifications && typeof r.specifications === 'object' ? r.specifications : {},
    features: normalizeFeatures(r.features),
    applications: normalizeApplications(r.applications),
    media: normalizeMedia(r.media, r.source_url),
    documents: normalizeDocs(r.documents),
    source_url: r.source_url || null,
    source_urls: Array.isArray(r.source_urls) ? r.source_urls : (r.source_url ? [r.source_url] : []),
    source_type: r.source_type || 'official_product_page',
    verification_status: r.verification_status || 'unverified',
    crawl_status: 'imported',
    crawler: 'import-droneworld',
    language: r.language || (/[\u4e00-\u9fa5]/.test(r.name || '') ? 'zh-CN' : 'en'),
    crawled_at: r.crawled_at || null,
    source_verified_at: r.source_verified_at || null
  });
}

const summary = {
  source_rows: rows.length,
  deduped: deduped.length,
  conflicts: conflict,
  would_insert: inserts.length,
  with_specs: inserts.filter((r) => Object.keys(r.specifications || {}).length > 0).length,
  with_media: inserts.filter((r) => (r.media || []).length > 0).length,
  with_name_en: inserts.filter((r) => r.name_en).length,
  archived_skipped: INCLUDE_ARCHIVED ? 0 : 'see source status filter'
};
log(JSON.stringify(summary, null, 1));
log('sample:', JSON.stringify(inserts.slice(0, 2), null, 1).slice(0, 2500));

if (!APPLY) {
  log('dry-run only; re-run with --apply to insert');
  process.exit(0);
}

let inserted = 0;
for (let i = 0; i < inserts.length; i += 80) {
  const part = inserts.slice(i, i + 80);
  const res = await runSQL(`
    insert into public.products
      (supplier_id,slug,name,name_en,model,brand,category,product_type,summary,description,
       specifications,features,applications,media,documents,source_url,source_urls,source_type,
       verification_status,crawl_status,crawler,language,crawled_at,source_verified_at)
    select supplier_id,slug,name,name_en,model,brand,category,product_type,summary,description,
           specifications,features,applications,media,documents,source_url,source_urls,source_type,
           verification_status,crawl_status,crawler,language,
           nullif(crawled_at,'')::timestamptz, nullif(source_verified_at,'')::timestamptz
    from jsonb_to_recordset(${JSON.stringify(part).replace(/'/g, "''")}::jsonb) as x(
      supplier_id text, slug text, name text, name_en text, model text, brand text, category text,
      product_type text, summary text, description text, specifications jsonb, features jsonb,
      applications text[], media jsonb, documents jsonb, source_url text, source_urls jsonb,
      source_type text, verification_status text, crawl_status text, crawler text, language text,
      crawled_at text, source_verified_at text)
    on conflict do nothing
    returning id
  `);
  inserted += Array.isArray(res) ? res.length : 0;
  log(`inserted ${inserted}/${inserts.length}`);
}

const total = await runSQL(`select count(*)::int n, count(*) filter (where crawler='import-droneworld')::int imported from public.products`);
log('DONE', JSON.stringify({ inserted, total: total[0] }));
