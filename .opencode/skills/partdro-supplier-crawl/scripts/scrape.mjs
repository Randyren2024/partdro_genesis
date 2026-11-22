import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  runSQL, lit, log, arg, has, listArg, selectSuppliers, storeMarkdown,
  upsertProducts, rollupSupplier, firecrawlCredits, sleep
} from './_shared.mjs';
import { OUT_DIR, jsonSql } from '../../../../crawl/lib.mjs';
import { analyzePage, dedupeProducts, BAD_IMAGE, JUNK_HOST, productSlug } from '../../../../crawl/parse.mjs';
import { extractPage, closeSession } from '../../../../crawl/bridge.mjs';

const DRY = has('dry-run');
const ONLY = listArg('only');
const LIMIT = Number(arg('limit', 10)) || 10;
const MAX_URLS = Number(arg('max-urls', 30)) || 30;
const ENGINE = arg('engine', 'auto');
const CREDITS_CAP = Number(arg('credits-cap', 500)) || 500;
const MIN_CREDITS = Number(arg('min-credits', 120)) || 120;
const CONCURRENCY = Number(arg('concurrency', 2)) || 2;
const STATUSES = (arg('status', 'pending,partial,failed') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PRIORITIES = listArg('priority');

const remainingStart = firecrawlCredits() ?? 999;
const cap = Math.min(CREDITS_CAP, Math.max(0, remainingStart - 100));
let spent = 0;

function urlKey(u) {
  try {
    const x = new URL(u);
    return x.host.replace(/^www\./i, '') + x.pathname.replace(/\/$/, '').toLowerCase();
  } catch { return u; }
}

function runCli(argsArr, timeoutMs = 420000) {
  return new Promise((resolve) => {
    const p = spawn('firecrawl', argsArr, { shell: true, windowsHide: true });
    let err = '';
    const timer = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, err }); });
  });
}

async function fetchFirecrawl(supplierId, urls) {
  const dir = path.join(OUT_DIR, supplierId);
  fs.mkdirSync(dir, { recursive: true });
  const urlsFile = path.join(dir, `urls-${Date.now()}.txt`);
  const outFile = path.join(dir, `batch-${Date.now()}.json`);
  fs.writeFileSync(urlsFile, urls.join('\n'), 'utf8');
  const { code, err } = await runCli([
    'batch-scrape', '--urls-file', urlsFile, '-f', 'markdown,links',
    '--wait', '--ignore-invalid-urls', '--timeout', '240', '--output', outFile
  ]);
  if (!fs.existsSync(outFile)) return { pages: [], credits: 0, error: (err || '').trim().slice(0, 300) || `cli_exit_${code}` };
  try {
    const j = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    return { pages: j.data || [], credits: j.creditsUsed || 0, error: null };
  } catch (e) {
    return { pages: [], credits: 0, error: 'parse_output: ' + e.message };
  }
}

function bridgeToMd(d) {
  const parts = [];
  if (d.title) parts.push(`# ${d.title}`);
  for (const h of d.h1 || []) if (h && h !== d.title) parts.push(`# ${h}`);
  for (const h of d.h2 || []) parts.push(`## ${h}`);
  if (d.text) parts.push(d.text);
  for (const t of d.tables || []) {
    if (!Array.isArray(t) || !t.length) continue;
    const width = Math.max(...t.map((r) => r.length));
    const row = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] || '').join(' | ')} |`;
    parts.push([row(t[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...t.slice(1).map(row)].join('\n'));
  }
  for (const [k, v] of d.dls || []) parts.push(`- ${k}: ${v}`);
  return parts.join('\n\n');
}

function brandOf(profile) {
  const b = profile.brand;
  if (typeof b === 'string') return b;
  if (b && typeof b === 'object') return b.en || b['zh-CN'] || Object.values(b)[0] || null;
  return null;
}

function toProduct({ supplierId, pageUrl, analysis, profile, crawler }) {
  const media = [];
  for (const img of (analysis.imgs || []).slice(0, 12)) {
    media.push({ type: 'image', public_url: img, source_url: pageUrl });
  }
  for (const v of analysis.vids.direct) media.push({ type: 'video_link', url: v });
  for (const e of analysis.vids.embeds) media.push({ type: 'video_embed', url: e });
  return {
    supplier_id: supplierId,
    slug: productSlug(supplierId, analysis.model || analysis.name, pageUrl),
    name: analysis.name,
    name_en: null,
    model: analysis.model,
    brand: brandOf(profile),
    category: profile.category || null,
    product_type: null,
    summary: analysis.summary,
    description: analysis.description,
    specifications: analysis.specs,
    features: analysis.features,
    applications: [],
    media,
    documents: analysis.docs,
    source_url: pageUrl,
    source_urls: [pageUrl],
    source_type: 'official_product_page',
    verification_status: 'source_verified',
    crawl_status: 'ok',
    crawler,
    language: /[\u4e00-\u9fa5]/.test(analysis.name) ? 'zh-CN' : 'en',
    crawled_at: new Date().toISOString(),
    source_verified_at: new Date().toISOString()
  };
}

async function persistPage({ supplierId, pageUrl, md, meta, links, images, videos, profile, models, siteNames, crawler, httpStatus, credits }) {
  const mdPath = await storeMarkdown(supplierId, pageUrl, md);
  const analysis = analyzePage({ md, meta, links, pageUrl, models, siteNames, images, videos });
  const pageRow = {
    supplier_id: supplierId,
    url: pageUrl,
    final_url: pageUrl,
    page_type: analysis.type,
    status: 'ok',
    http_status: httpStatus || 200,
    title: (meta.title || '').slice(0, 500),
    markdown_path: mdPath,
    excerpt: analysis.text.slice(0, 500),
    image_count: (analysis.imgs || []).length,
    video_count: (analysis.vids.direct || []).length + (analysis.vids.embeds || []).length,
    credits: credits || 0
  };
  const product = analysis.type === 'detail' && analysis.signal && analysis.name && !JUNK_HOST.test(pageUrl)
    ? toProduct({ supplierId, pageUrl, analysis, profile, crawler })
    : null;
  return { pageRow, product };
}

async function claimUrls(supplierId, max) {
  return runSQL(`
    update public.crawl_urls set status='running', attempts=attempts+1, updated_at=now()
    where id in (
      select id from public.crawl_urls
      where supplier_id=${lit(supplierId)} and status in ('pending','failed') and attempts < 4
      order by case when kind='detail' then 0 else 1 end, id
      limit ${max}
      for update skip locked
    )
    returning id,url,kind
  `);
}

async function markUrl(id, ok, { httpStatus, pageType, credits, error } = {}) {
  if (ok) {
    await runSQL(`
      update public.crawl_urls set status='done', http_status=${httpStatus || 200},
        page_type=${lit(pageType || 'page')}, credits=${Number(credits) || 0},
        fetched_at=now(), updated_at=now(), error=null
      where id=${id}
    `);
  } else {
    await runSQL(`
      update public.crawl_urls set status='failed', error=${lit(String(error || 'failed').slice(0, 500))},
        fetched_at=now(), updated_at=now()
      where id=${id}
    `);
  }
}

async function runFirecrawl(supplierId, urls) {
  const { pages, credits, error } = await fetchFirecrawl(supplierId, urls.map((u) => u.url));
  if (error) return { results: urls.map((u) => ({ ...u, ok: false, error })), credits, fatal: true };
  const map = new Map();
  for (const p of pages) {
    const u = (p.metadata && (p.metadata.sourceURL || p.metadata.url)) || p.url;
    if (u) map.set(urlKey(u), p);
  }
  const results = urls.map((u) => {
    const p = map.get(urlKey(u.url));
    if (!p) return { ...u, ok: false, error: 'no_page' };
    const md = p.markdown || '';
    if (md.length < 60) return { ...u, ok: false, error: 'thin_markdown' };
    return {
      ...u, ok: true, engine: 'firecrawl', md, meta: p.metadata || {}, links: p.links || [],
      httpStatus: (p.metadata && p.metadata.statusCode) || 200, credits: 0
    };
  });
  if (results.length && credits) results[0].credits = credits;
  return { results, credits, fatal: false };
}

async function runWebBridge(supplierId, urls) {
  const session = `crawl-${supplierId}`;
  const results = [];
  try {
    for (const u of urls) {
      try {
        const d = await extractPage(u.url, session);
        const md = bridgeToMd(d);
        if (md.length < 80) {
          results.push({ ...u, ok: false, error: 'thin_page' });
          continue;
        }
        const images = (d.imgs || [])
          .filter((im) => im && im.src && im.w >= 400 && im.h >= 250 && !BAD_IMAGE.test(im.src) && !/\.svg($|\?)/i.test(im.src))
          .map((im) => im.src);
        const videos = {
          direct: (d.videos || []).slice(0, 3),
          embeds: (d.embeds || []).slice(0, 5)
        };
        results.push({
          ...u, ok: true, engine: 'webbridge', md,
          meta: {
            title: d.title,
            'og:description': d.metaDescription,
            'og:image': d.ogImage,
            sourceURL: d.url || u.url
          },
          links: (d.links || []).map((l) => l.href).filter(Boolean),
          images, videos, httpStatus: 200, credits: 0
        });
      } catch (e) {
        results.push({ ...u, ok: false, error: String(e.message).slice(0, 300) });
      }
      await sleep(700);
    }
  } finally {
    await closeSession(session);
  }
  return { results, credits: 0, fatal: false };
}

async function processSupplier(sup) {
  const sid = sup.supplier_id;
  const profile = sup.profile || {};
  const models = [
    ...(profile.productModels || []), ...(profile.catalogueModels || []),
    ...(profile.knownProductModels || []), ...(profile.catalogueProducts || [])
  ].filter((x) => typeof x === 'string');
  const dn = profile.displayName;
  const siteNames = [
    dn && (typeof dn === 'string' ? dn : (dn['zh-CN'] || dn.en || Object.values(dn)[0])),
    profile.legalName, profile.brand
  ].filter((x) => typeof x === 'string' && x.length > 1);

  if (DRY) {
    const urls = await runSQL(`
      select id,url,kind from public.crawl_urls
      where supplier_id=${lit(sid)} and status in ('pending','failed') and attempts < 4
      order by case when kind='detail' then 0 else 1 end, id limit ${MAX_URLS}
    `);
    return { sid, dry: true, urls: urls.length, sample: urls.slice(0, 5).map((u) => u.url) };
  }

  const urls = await claimUrls(sid, MAX_URLS);
  if (!urls.length) return { sid, skipped: 'no_urls' };

  let engine;
  if (ENGINE === 'webbridge') engine = 'webbridge';
  else if (ENGINE === 'firecrawl') engine = spent < cap && remainingStart - spent > MIN_CREDITS ? 'firecrawl' : 'webbridge';
  else engine = spent < cap && remainingStart - spent > MIN_CREDITS && sup.priority <= 2 ? 'firecrawl' : 'webbridge';

  let result;
  if (engine === 'firecrawl') {
    result = await runFirecrawl(sid, urls);
    spent += result.credits || 0;
    if (result.fatal) {
      log(`firecrawl failed for ${sid}, falling back to webbridge: ${result.results[0]?.error}`);
      result = await runWebBridge(sid, urls);
    } else if (ENGINE === 'auto') {
      const failed = result.results.filter((r) => !r.ok);
      if (failed.length) {
        const retry = await runWebBridge(sid, failed);
        const byId = new Map(result.results.map((r) => [r.id, r]));
        for (const r of retry.results) byId.set(r.id, r);
        result.results = urls.map((u) => byId.get(u.id));
      }
    }
  } else {
    result = await runWebBridge(sid, urls);
  }

  const pageRows = [];
  const products = [];
  for (const r of result.results) {
    if (!r.ok) {
      await markUrl(r.id, false, { error: r.error });
      continue;
    }
    const crawler = r.engine === 'firecrawl' ? 'firecrawl-cli' : 'webbridge-cli';
    const { pageRow, product } = await persistPage({
      supplierId: sid, pageUrl: r.url, md: r.md, meta: r.meta, links: r.links,
      images: r.images, videos: r.videos, profile, models, siteNames,
      crawler, httpStatus: r.httpStatus, credits: r.credits
    });
    pageRows.push(pageRow);
    if (product) products.push(product);
    await markUrl(r.id, true, { httpStatus: r.httpStatus, pageType: pageRow.page_type, credits: r.credits });
  }

  if (pageRows.length) {
    for (let i = 0; i < pageRows.length; i += 80) {
      const part = pageRows.slice(i, i + 80);
      await runSQL(`
        insert into public.crawl_pages
          (supplier_id,url,final_url,page_type,status,http_status,title,markdown_path,excerpt,image_count,video_count,credits)
        select supplier_id,url,final_url,page_type,status,http_status,title,markdown_path,excerpt,image_count,video_count,credits
        from jsonb_to_recordset(${jsonSql(part)}) as x(
          supplier_id text,url text,final_url text,page_type text,status text,http_status int,
          title text,markdown_path text,excerpt text,image_count int,video_count int,credits int)
        on conflict (supplier_id,url) do update set
          page_type=excluded.page_type, status=excluded.status, http_status=excluded.http_status,
          title=excluded.title, markdown_path=excluded.markdown_path, excerpt=excluded.excerpt,
          image_count=excluded.image_count, video_count=excluded.video_count,
          credits=excluded.credits, fetched_at=now()
      `);
    }
  }

  const uniq = dedupeProducts(products);
  const upsert = await upsertProducts({ supplierId: sid, candidates: uniq, crawler: engine === 'firecrawl' ? 'firecrawl-cli' : 'webbridge-cli' });
  const roll = await rollupSupplier(sid);
  return {
    sid, engine, urls: urls.length, pages: pageRows.length, products: uniq.length,
    credits: result.credits || 0, ...upsert, queue: roll && roll.status
  };
}

const suppliers = await selectSuppliers({ only: ONLY, statuses: STATUSES, priorities: PRIORITIES, limit: LIMIT });
log(JSON.stringify({ suppliers: suppliers.length, engine: ENGINE, credits_start: remainingStart, cap, dry: DRY }));

let idx = 0;
async function worker() {
  while (idx < suppliers.length) {
    const sup = suppliers[idx++];
    try {
      log(JSON.stringify(await processSupplier(sup)));
    } catch (e) {
      log(JSON.stringify({ sid: sup.supplier_id, status: 'error', error: String(e.message).slice(0, 300) }));
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker()));

const summary = await runSQL(`
  select status, count(*)::int n, coalesce(sum(products),0)::int products,
         coalesce(sum(pages),0)::int pages, coalesce(sum(credits),0)::int credits
  from public.crawl_queue group by 1 order by 1
`);
log('SUMMARY', JSON.stringify(summary));
log('SPENT_THIS_RUN', spent, 'REMAINING', firecrawlCredits());
