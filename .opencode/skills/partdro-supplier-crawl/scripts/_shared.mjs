import { spawnSync } from 'node:child_process';
import { runSQL, storageUpload, sqlQuote, sleep, TARGET_URL } from '../../../../crawl/lib.mjs';
import { sha16, productSlug, clean } from '../../../../crawl/parse.mjs';

export { runSQL, storageUpload, sleep, TARGET_URL, sha16, productSlug, clean };
export const lit = sqlQuote;
export const log = (...a) => console.log(...a);

export function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
export const has = (name) => process.argv.includes(`--${name}`);
export function listArg(name) {
  const v = arg(name, null);
  return v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null;
}

export function parseArgs(defaults = {}) {
  const out = { ...defaults };
  for (const k of Object.keys(defaults)) {
    if (process.argv.includes(`--${k}`)) out[k] = arg(k, defaults[k]);
  }
  return out;
}

export async function selectSuppliers({ only, statuses = ['pending', 'partial', 'failed'], priorities = null, limit = 10 } = {}) {
  const where = [];
  if (only && only.length) where.push(`q.supplier_id in (${only.map(lit).join(',')})`);
  else where.push(`q.status in (${statuses.map(lit).join(',')})`);
  if (priorities && priorities.length) where.push(`q.priority in (${priorities.map(Number).join(',')})`);
  return runSQL(`
    select q.*, coalesce(p.profile_data,'{}'::jsonb) as profile
    from public.crawl_queue q
    join public.supplier_profiles p on p.supplier_id = q.supplier_id
    where ${where.join(' and ')}
    order by q.priority, q.supplier_id
    limit ${Number(limit) || 10}
  `);
}

export async function storeMarkdown(supplierId, url, md) {
  const p = `${supplierId}/pages/${sha16(url)}.md`;
  await storageUpload(p, Buffer.from(md, 'utf8'), 'text/markdown; charset=utf-8');
  return p;
}

const keyOf = (x) => (typeof x === 'string' ? x : x && (x.public_url || x.url || x.storage_path || x.href));
const mergeUnique = (a, b) => {
  const out = [];
  const seen = new Set();
  for (const x of [...(a || []), ...(b || [])]) {
    const k = keyOf(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
};
const longer = (a, b) => ((b || '').length > (a || '').length ? b : a);
const union = (a, b) => [...new Set([...(a || []), ...(b || [])].filter(Boolean))];

function mergeProduct(ex, c, crawler) {
  return {
    id: ex.id,
    name: c.name || ex.name,
    name_en: c.name_en || ex.name_en,
    model: c.model || ex.model,
    summary: longer(ex.summary, c.summary),
    description: longer(ex.description, c.description),
    specifications: { ...(ex.specifications || {}), ...(c.specifications || {}) },
    features: union(ex.features, c.features),
    applications: union(ex.applications, c.applications),
    media: mergeUnique(ex.media, c.media),
    documents: mergeUnique(ex.documents, c.documents),
    source_url: c.source_url || ex.source_url,
    source_urls: mergeUnique(ex.source_urls, c.source_urls),
    verification_status: c.verification_status || ex.verification_status,
    crawl_status: 'ok',
    crawler,
    language: c.language || ex.language,
    crawled_at: c.crawled_at || new Date().toISOString()
  };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function upsertProducts({ supplierId, candidates, crawler }) {
  if (!candidates || !candidates.length) return { inserted: 0, updated: 0, skipped: 0 };
  const existing = await runSQL(`
    select id, slug, model, name, crawler, name_en, summary, description, specifications,
           features, applications, media, documents, source_url, source_urls,
           verification_status, crawl_status, language
    from public.products where supplier_id = ${lit(supplierId)}
  `);
  const slugs = new Set((await runSQL(`select slug from public.products where slug is not null`)).map((r) => r.slug));
  const byModel = new Map();
  const byName = new Map();
  for (const r of existing) {
    if (r.model) byModel.set(String(r.model).toLowerCase(), r);
    if (r.name) byName.set(String(r.name).toLowerCase(), r);
  }

  const inserts = [];
  const updates = [];
  let skipped = 0;
  for (const c of candidates) {
    const km = c.model ? String(c.model).toLowerCase() : null;
    const kn = c.name ? String(c.name).toLowerCase() : null;
    const ex = (km && byModel.get(km)) || (kn && byName.get(kn));
    if (ex) {
      if (!['firecrawl-cli', 'webbridge-cli', 'import-droneworld'].includes(ex.crawler)) {
        skipped++;
        continue;
      }
      const merged = mergeProduct(ex, c, crawler);
      updates.push(merged);
      Object.assign(ex, merged);
      continue;
    }
    let slug = c.slug || productSlug(supplierId, c.model || c.name, c.source_url || c.name);
    let n = 1;
    while (slugs.has(slug)) slug = `${c.slug || productSlug(supplierId, c.model || c.name, c.source_url || c.name)}-${++n}`;
    slugs.add(slug);
    const row = { ...c, slug };
    inserts.push(row);
    if (km) byModel.set(km, row);
    if (kn) byName.set(kn, row);
  }

  let inserted = 0;
  for (const part of chunk(inserts, 80)) {
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
  }

  for (const part of chunk(updates, 80)) {
    await runSQL(`
      update public.products p set
        name=x.name, name_en=x.name_en, model=x.model, summary=x.summary, description=x.description,
        specifications=x.specifications, features=x.features, applications=x.applications,
        media=x.media, documents=x.documents, source_url=x.source_url, source_urls=x.source_urls,
        verification_status=x.verification_status, crawl_status=x.crawl_status, crawler=x.crawler,
        language=x.language, crawled_at=x.crawled_at::timestamptz, updated_at=now()
      from jsonb_to_recordset(${JSON.stringify(part).replace(/'/g, "''")}::jsonb) as x(
        id text, name text, name_en text, model text, summary text, description text,
        specifications jsonb, features jsonb, applications text[], media jsonb, documents jsonb,
        source_url text, source_urls jsonb, verification_status text, crawl_status text,
        crawler text, language text, crawled_at text)
      where p.id = x.id::uuid
    `);
  }

  return { inserted, updated: updates.length, skipped };
}

export async function rollupSupplier(supplierId) {
  const u = await runSQL(`
    select count(*)::int n,
      count(*) filter (where status in ('pending','running'))::int open,
      count(*) filter (where status='failed')::int failed,
      coalesce(sum(credits),0)::int credits
    from public.crawl_urls where supplier_id=${lit(supplierId)}
  `);
  const row = u[0] || { n: 0, open: 0, failed: 0, credits: 0 };
  if (!row.n) return null;
  const status = row.open > 0 || row.failed > 0 ? 'partial' : 'done';
  const counts = await runSQL(`
    select
      (select count(*) from public.crawl_pages where supplier_id=${lit(supplierId)})::int pages,
      (select count(*) from public.products where supplier_id=${lit(supplierId)})::int products
  `);
  const c = counts[0] || { pages: 0, products: 0 };
  await runSQL(`
    update public.crawl_queue set status=${lit(status)}, pages=${c.pages}, products=${c.products},
      credits=${row.credits}, finished_at=now(), updated_at=now()
    where supplier_id=${lit(supplierId)}
  `);
  return { status, ...row, ...c };
}

export function firecrawlCredits() {
  const r = spawnSync('firecrawl', ['--status'], { encoding: 'utf8', shell: true, timeout: 30000 });
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  const m = text.match(/Credits:\s*([\d,]+)/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

export function webridgeHealth() {
  return fetch('http://127.0.0.1:10086/', { signal: AbortSignal.timeout(2500) })
    .then((r) => ({ ok: true, status: r.status }))
    .catch((e) => ({ ok: false, error: String(e.message).slice(0, 120) }));
}
