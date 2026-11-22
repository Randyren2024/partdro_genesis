import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runSQL, storageUpload, jsonSql, TARGET_URL, OUT_DIR } from './lib.mjs';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const LIMIT = Number(getArg('limit', 10));
const ONLY = getArg('only', null);
const REUSE = args.includes('--reuse');
const STATUSES = getArg('status', 'pending,failed').split(',').map((s) => `'${s.trim()}'`).join(',');

import {
  UA, sha16, clean, slugify, stripMd, lit,
  JUNK_HOST, getHeadings, modelFromText, pickName,
  extractSpecs, extractFeatures, extractImages, extractVideos,
  knownModels, pickKnownModel, inferType
} from './parse.mjs';

function runCli(argsArr, timeoutMs = 360000) {
  return new Promise((resolve) => {
    const p = spawn('firecrawl', argsArr, { shell: true, windowsHide: true });
    let err = '';
    const timer = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, err }); });
  });
}

async function fetchPageRows(q) {
  const urls = (q.seed_urls || []).filter((u) => /^https?:\/\//i.test(u) && !/\.pdf($|\?)/i.test(u)).slice(0, 6);
  if (!urls.length) return { urls: [], pages: [], credits: 0, error: 'no_urls' };

  const dir = path.join(OUT_DIR, q.supplier_id);
  fs.mkdirSync(dir, { recursive: true });
  const urlsFile = path.join(dir, 'urls.txt');
  const outFile = path.join(dir, 'batch.json');

  if (REUSE && fs.existsSync(outFile)) {
    try {
      const j = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      return { urls, pages: j.data || [], credits: j.creditsUsed || 0, error: null };
    } catch {}
  }
  fs.writeFileSync(urlsFile, urls.join('\n'), 'utf8');
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  const { code, err } = await runCli([
    'batch-scrape', '--urls-file', urlsFile, '-f', 'markdown,links',
    '--wait', '--ignore-invalid-urls', '--timeout', '240', '--output', outFile
  ]);

  if (!fs.existsSync(outFile)) return { urls, pages: [], credits: 0, error: clean(err).slice(0, 300) || `cli_exit_${code}` };
  try {
    const j = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    return { urls, pages: j.data || [], credits: j.creditsUsed || 0, error: null };
  } catch (e) {
    return { urls, pages: [], credits: 0, error: 'parse_output: ' + e.message };
  }
}

async function downloadImage(url, referer) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 20000);
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || '', Accept: 'image/*,*/*' }, redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!/^image\//i.test(ct) || /svg/i.test(ct)) return null;
    const len = Number(r.headers.get('content-length') || 0);
    if (len && len > 5 * 1024 * 1024) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 12000 || buf.length > 5 * 1024 * 1024) return null;
    const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : /gif/i.test(ct) ? 'gif' : 'jpg';
    return { buf, ext, ct };
  } catch { return null; }
}

async function downloadVideo(url, referer) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 60000);
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || '' }, redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const len = Number(r.headers.get('content-length') || 0);
    if (len > 50 * 1024 * 1024) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 50 * 1024 * 1024 || buf.length < 50000) return null;
    const ct = r.headers.get('content-type') || 'video/mp4';
    return { buf, ext: /webm/i.test(ct) ? 'webm' : 'mp4', ct };
  } catch { return null; }
}

async function processSupplier(q) {
  const sid = q.supplier_id;
  await runSQL(`update public.crawl_queue set status='running', started_at=now(), attempts=attempts+1, updated_at=now() where supplier_id=${lit(sid)}`);

  const profileRes = await runSQL(`select coalesce(profile_data,'{}'::jsonb) as p from public.supplier_profiles where supplier_id=${lit(sid)}`);
  const profile = profileRes[0] ? profileRes[0].p : {};
  const models = knownModels(profile);
  const dn = profile.displayName;
  const siteNames = [
    dn && (typeof dn === 'string' ? dn : (dn['zh-CN'] || dn.en || Object.values(dn)[0])),
    profile.legalName, profile.brand
  ].filter((x) => typeof x === 'string' && x.length > 1);

  const { pages, credits, error } = await fetchPageRows(q);
  if (error && !pages.length) {
    await runSQL(`update public.crawl_queue set status='failed', last_error=${lit(error)}, credits=${credits}, finished_at=now(), updated_at=now() where supplier_id=${lit(sid)}`);
    return { sid, status: 'failed', error };
  }

  const pageRows = [];
  const products = [];
  let imageBudget = 40;
  let mediaCount = 0;

  for (const p of pages) {
    const md = p.markdown || '';
    const meta = p.metadata || {};
    const pageUrl = meta.sourceURL || meta.url || '';
    if (!md || md.length < 60) continue;

    const mdPath = `${sid}/pages/${sha16(pageUrl || md)}.md`;
    await storageUpload(mdPath, Buffer.from(md, 'utf8'), 'text/markdown; charset=utf-8');

    const type = inferType(pageUrl, meta.title || '', md);
    const imgs = extractImages(md, pageUrl, meta);
    const vids = extractVideos(md, p.links, pageUrl);

    pageRows.push({
      supplier_id: sid, url: pageUrl, final_url: pageUrl, page_type: type, status: 'ok',
      http_status: meta.statusCode || 200, title: clean(meta.title || '').slice(0, 500),
      markdown_path: mdPath, excerpt: stripMd(md).slice(0, 500),
      image_count: imgs.length, video_count: vids.direct.length + vids.embeds.length, credits: 1
    });

    if (type === 'detail') {
      if (JUNK_HOST.test(pageUrl)) continue;
      const headings = getHeadings(md);
      const name = pickName(headings, meta, siteNames, md, pageUrl);
      if (!name) continue;
      const specs = extractSpecs(md);
      const model = pickKnownModel(name, models) || modelFromText(name);
      const text = stripMd(md);
      const signal = model || Object.keys(specs).length >= 3 || /(产品参数|技术参数|规格参数|主要参数|技术指标|specifications?)/i.test(md) || (text.length > 600 && headings.length > 2);
      if (!signal || text.length < 150) continue;

      const paragraphs = md.split(/\n{2,}/)
        .map((x) => stripMd(x))
        .filter((x) => x.length > 50 && !/^\|/.test(x) && !/^(产品中心|首页|关于我们|联系我们|新闻)/.test(x) && !/(探索更多|更多产品|read more|learn more)/i.test(x));
      const description = clean(paragraphs.slice(0, 4).join(' ')).slice(0, 3000);
      const media = [];

      for (const imgUrl of imgs.slice(0, 8)) {
        if (imageBudget <= 0) break;
        const got = await downloadImage(imgUrl, pageUrl);
        if (!got) continue;
        const h = sha16(got.buf);
        const objPath = `${sid}/images/${h}.${got.ext}`;
        try { await storageUpload(objPath, got.buf, got.ct); } catch { continue; }
        media.push({ type: 'image', storage_path: objPath, public_url: `${TARGET_URL}/storage/v1/object/public/supplier-media/${objPath}`, source_url: imgUrl, bytes: got.buf.length, sha256: h });
        imageBudget--; mediaCount++;
      }
      for (const v of vids.direct) {
        const got = await downloadVideo(v, pageUrl);
        if (!got) { media.push({ type: 'video_link', url: v }); continue; }
        const h = sha16(got.buf);
        const objPath = `${sid}/videos/${h}.${got.ext}`;
        try { await storageUpload(objPath, got.buf, got.ct); } catch { continue; }
        media.push({ type: 'video', storage_path: objPath, public_url: `${TARGET_URL}/storage/v1/object/public/supplier-media/${objPath}`, source_url: v, bytes: got.buf.length, sha256: h });
        mediaCount++;
      }
      for (const e of vids.embeds) media.push({ type: 'video_embed', url: e });

      const docs = (p.links || []).filter((l) => /\.pdf($|\?)/i.test(l)).slice(0, 5).map((u) => ({ type: 'pdf', url: u }));

      products.push({
        supplier_id: sid,
        slug: `${sid}-${slugify(model || name)}-${sha16(pageUrl).slice(0, 6)}`,
        name, name_en: null, model, brand: profile.brand || null,
        category: profile.category || null, product_type: null,
        summary: clean(meta['og:description'] || meta.ogDescription || '').slice(0, 300) || description.slice(0, 300),
        description,
        specifications: specs,
        features: extractFeatures(md),
        applications: [],
        media,
        documents: docs,
        source_url: pageUrl,
        source_urls: [pageUrl],
        source_type: 'official_product_page',
        verification_status: 'source_verified',
        crawl_status: 'ok',
        crawler: 'firecrawl-cli',
        language: /[\u4e00-\u9fa5]/.test(name) ? 'zh-CN' : 'en',
        crawled_at: new Date().toISOString(),
        source_verified_at: new Date().toISOString()
      });
    }

    if (type === 'catalogue' && models.length) {
      const texts = [...(p.links || []), md];
      const found = models.filter((m) => texts.some((t) => typeof t === 'string' && t.toLowerCase().includes(m.toLowerCase())));
      for (const m of found.slice(0, 12)) {
        products.push({
          supplier_id: sid,
          slug: `${sid}-${slugify(m)}`,
          name: m, model: m, brand: profile.brand || null,
          category: profile.category || null,
          summary: `Catalogue listing from ${new URL(pageUrl).hostname}`,
          specifications: {}, features: [], applications: [], media: [], documents: [],
          source_url: pageUrl, source_urls: [pageUrl],
          source_type: 'official_product_catalogue',
          verification_status: 'unverified', crawl_status: 'stub',
          crawler: 'firecrawl-cli', language: /[\u4e00-\u9fa5]/.test(m) ? 'zh-CN' : 'en',
          crawled_at: new Date().toISOString()
        });
      }
    }
  }

  const score = (p) => (p.crawl_status === 'ok' ? 100 : 0) + (p.media ? p.media.length : 0) + (p.description ? 10 : 0);
  const byKey = new Map();
  for (const p of products) {
    const key = p.model ? 'm:' + String(p.model).toLowerCase() : 's:' + p.slug;
    const cur = byKey.get(key);
    if (!cur || score(p) > score(cur)) byKey.set(key, p);
  }
  const uniq = [];
  const slugs = new Set();
  for (const p of byKey.values()) {
    let s = p.slug;
    let n = 1;
    while (slugs.has(s)) { s = p.slug + '-' + (++n); }
    slugs.add(s);
    uniq.push({ ...p, slug: s });
  }

  await runSQL(`delete from public.crawl_pages where supplier_id=${lit(sid)}`);
  if (pageRows.length) {
    await runSQL(`
      insert into public.crawl_pages (supplier_id,url,final_url,page_type,status,http_status,title,markdown_path,excerpt,image_count,video_count,credits)
      select supplier_id,url,final_url,page_type,status,http_status,title,markdown_path,excerpt,image_count,video_count,credits
      from jsonb_to_recordset(${jsonSql(pageRows)}) as x(
        supplier_id text, url text, final_url text, page_type text, status text, http_status int,
        title text, markdown_path text, excerpt text, image_count int, video_count int, credits int)
      on conflict (supplier_id,url) do nothing
    `);
  }

  await runSQL(`delete from public.products where supplier_id=${lit(sid)} and crawler='firecrawl-cli'`);
  if (uniq.length) {
    await runSQL(`
      insert into public.products
        (supplier_id,slug,name,name_en,model,brand,category,product_type,summary,description,specifications,features,applications,media,documents,source_url,source_urls,source_type,verification_status,crawl_status,crawler,language,crawled_at,source_verified_at)
      select supplier_id,slug,name,name_en,model,brand,category,product_type,summary,description,
             specifications,features,applications,media,documents,source_url,source_urls,source_type,
             verification_status,crawl_status,crawler,language,crawled_at::timestamptz,source_verified_at::timestamptz
      from jsonb_to_recordset(${jsonSql(uniq)}) as x(
        supplier_id text, slug text, name text, name_en text, model text, brand text, category text,
        product_type text, summary text, description text, specifications jsonb, features jsonb,
        applications text[], media jsonb, documents jsonb, source_url text, source_urls jsonb,
        source_type text, verification_status text, crawl_status text, crawler text, language text,
        crawled_at text, source_verified_at text)
      on conflict (slug) do update set
        name=excluded.name, model=excluded.model, summary=excluded.summary, description=excluded.description,
        specifications=excluded.specifications, features=excluded.features, media=excluded.media,
        documents=excluded.documents, source_url=excluded.source_url, source_urls=excluded.source_urls,
        verification_status=excluded.verification_status, crawl_status=excluded.crawl_status,
        crawled_at=excluded.crawled_at, updated_at=now()
    `);
  }

  const status = pages.length ? (pageRows.length ? 'done' : 'partial') : 'failed';
  await runSQL(`update public.crawl_queue set status='${status}', pages=${pageRows.length}, products=${uniq.length}, media=${mediaCount}, credits=${credits}, finished_at=now(), updated_at=now(), last_error=${error ? lit(error) : 'null'} where supplier_id=${lit(sid)}`);
  return { sid, status, pages: pageRows.length, products: uniq.length, media: mediaCount, credits, error };
}

const queue = await runSQL(`
  select supplier_id, priority, website, seed_urls
  from public.crawl_queue
  where ${ONLY ? `supplier_id = ${lit(ONLY)}` : `status in (${STATUSES})`}
  order by priority, supplier_id
  limit ${LIMIT}
`);

console.log(`processing ${queue.length} suppliers`);
let idx = 0;
async function worker() {
  while (idx < queue.length) {
    const q = queue[idx++];
    try {
      console.log(JSON.stringify(await processSupplier(q)));
    } catch (e) {
      console.log(JSON.stringify({ sid: q.supplier_id, status: 'error', error: String(e.message).slice(0, 300) }));
      try { await runSQL(`update public.crawl_queue set status='failed', last_error=${lit(String(e.message).slice(0, 500))}, updated_at=now() where supplier_id=${lit(q.supplier_id)}`); } catch {}
    }
  }
}
await Promise.all([worker(), worker()]);

const summary = await runSQL(`select status, count(*) n, sum(products) products, sum(media) media, sum(credits) credits from public.crawl_queue group by 1 order by 1`);
console.log('SUMMARY', JSON.stringify(summary));