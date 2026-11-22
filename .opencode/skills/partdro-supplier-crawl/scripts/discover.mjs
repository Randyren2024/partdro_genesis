import {
  runSQL, lit, log, arg, has, listArg, selectSuppliers
} from './_shared.mjs';
import { fcPost } from '../../../../crawl/lib.mjs';
import { JUNK_HOST, UA } from '../../../../crawl/parse.mjs';
import { extractPage, closeSession } from '../../../../crawl/bridge.mjs';

const APPLY = has('apply');
const ONLY = listArg('only');
const LIMIT = Number(arg('limit', 20)) || 20;
const MAX_URLS = Number(arg('max-urls', 30)) || 30;
const MAP_BUDGET = Number(arg('map-budget', 0)) || 0;
const SEARCH_BUDGET = Number(arg('search-budget', 0)) || 0;
const STATUSES = (arg('status', 'pending,needs_search') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PRIORITIES = listArg('priority');

const PRODUCT_RE = /(product|products|productdetail|productindex|chanpin|goods|item|detail|catalog|catalogue|collection|series|solution|uav|drone)/i;
const EXCLUDE_RE = /(blog|news|about|contact|support|download|career|job|privacy|terms|login|register|cart|search|video|wiki|faq|policy|sitemap|(^|\/)(index|default)\.html?$)/i;
const MODEL_RE = /[a-z]{1,8}[-_]?\d{2,4}[a-z]{0,4}/i;

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./i, '').toLowerCase(); } catch { return null; } };
const norm = (u) => { try { const x = new URL(u); x.hash = ''; return x.toString().replace(/\/$/, ''); } catch { return null; } };

function classify(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (/(productindex|product-list|productlist|catalog|catalogue|products\/?$|collection|category|chanpin|cp\/?$)/.test(p)) return 'catalogue';
    if (/(product|productdetail|detail|item|goods|cp\/)/.test(p)) return 'detail';
    if (/\.html?$/.test(p)) return 'detail';
    return 'page';
  } catch { return 'page'; }
}

function productLike(url, host) {
  try {
    const x = new URL(url);
    if (!/^https?:$/.test(x.protocol)) return false;
    if (host && hostOf(url) !== host) return false;
    const p = x.pathname.toLowerCase();
    if (!p || p === '/') return false;
    if (/\.(pdf|jpe?g|png|webp|gif|svg|zip|rar|mp4|webm|docx?|xlsx?)$/.test(p)) return false;
    if (EXCLUDE_RE.test(p)) return false;
    if (PRODUCT_RE.test(p)) return true;
    if (/\.html?$/.test(p)) return true;
    if (MODEL_RE.test(p)) return true;
    return false;
  } catch { return false; }
}

async function fetchText(url, timeout = 15000) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/xml,application/xml,text/html,*/*' },
      redirect: 'follow',
      signal: c.signal
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const text = await r.text();
    return text.length > 3_000_000 ? text.slice(0, 3_000_000) : text;
  } catch { return null; }
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());

async function sitemapUrls(website) {
  const roots = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/sitemaps/sitemap.xml'];
  const out = [];
  for (const path of roots) {
    const url = new URL(path, website).toString();
    const xml = await fetchText(url);
    if (!xml) continue;
    const found = locs(xml);
    if (!found.length) continue;
    if (/<sitemapindex/i.test(xml)) {
      for (const child of found.slice(0, 4)) {
        const sub = await fetchText(child);
        if (sub) out.push(...locs(sub));
      }
    } else {
      out.push(...found);
    }
    if (out.length) break;
  }
  return [...new Set(out)];
}

function profileBrand(profile) {
  const b = profile.brand;
  if (typeof b === 'string') return b;
  if (b && typeof b === 'object') return b.en || b['zh-CN'] || Object.values(b)[0] || '';
  return '';
}

async function findWebsite(queue, profile, budget) {
  const existing = (queue.website || profile.website || '').trim();
  if (/^https?:\/\//i.test(existing)) return { website: existing, source: 'profile', searches: 0 };
  if (budget <= 0) return { website: null, source: null, searches: 0 };
  const brand = profileBrand(profile) || 'drone manufacturer';
  const j = await fcPost('/v1/search', { query: `${brand} official website`, limit: 5 });
  const results = j.data || j.web || [];
  const hit = results.find((r) => r && /^https?:\/\//i.test(r.url || '') && !JUNK_HOST.test(r.url));
  return { website: hit ? hit.url : null, source: 'search', searches: 1 };
}

async function bridgeLinks(website, seeds, session) {
  const out = [];
  const pages = [website];
  const catalogue = seeds.find((u) => classify(u) === 'catalogue');
  if (catalogue && catalogue !== website) pages.push(catalogue);
  try {
    for (const p of pages) {
      try {
        const d = await extractPage(p, session);
        for (const l of d.links || []) {
          if (l && l.href && productLike(l.href, hostOf(website))) out.push(l.href);
        }
      } catch (e) {
        log(`bridge failed ${p}: ${String(e.message).slice(0, 160)}`);
      }
    }
  } finally {
    await closeSession(session);
  }
  return [...new Set(out)];
}

async function mapLinks(website) {
  const j = await fcPost('/v1/map', { url: website, search: 'product', limit: 60, includeSubdomains: false });
  const raw = j.links || [];
  return [...new Set(raw.map((x) => (typeof x === 'string' ? x : x && x.url)).filter(Boolean))];
}

const suppliers = await selectSuppliers({ only: ONLY, statuses: STATUSES, priorities: PRIORITIES, limit: LIMIT });
log(`suppliers: ${suppliers.length}`);
let mapCalls = 0;
let searchCalls = 0;
let totalUrls = 0;

for (const s of suppliers) {
  const profile = s.profile || {};
  const seeds = (s.seed_urls || []).filter((u) => /^https?:\/\//i.test(u));
  const found = new Map();
  const add = (url, source) => {
    const u = norm(url);
    if (!u || found.has(u)) return;
    if (!productLike(u, hostOf(website || u))) return;
    found.set(u, { url: u, source, kind: classify(u) });
  };

  let website = s.website || profile.website || null;
  let foundSite = { website, source: website ? 'profile' : null, searches: 0 };
  if (!website && searchCalls < SEARCH_BUDGET) {
    foundSite = await findWebsite(s, profile, SEARCH_BUDGET - searchCalls);
    searchCalls += foundSite.searches;
    website = foundSite.website;
  }

  if (website) {
    for (const u of await sitemapUrls(website)) add(u, 'sitemap');
    if (found.size < 3) {
      for (const u of await bridgeLinks(website, seeds, `discover-${s.supplier_id}`)) add(u, 'nav');
    }
    if (found.size < 3 && mapCalls < MAP_BUDGET) {
      mapCalls++;
      try {
        for (const u of await mapLinks(website)) add(u, 'map');
      } catch (e) {
        log(`map failed ${website}: ${String(e.message).slice(0, 160)}`);
      }
    }
  }
  for (const u of seeds) add(u, 'profile');

  const urls = [...found.values()]
    .sort((a, b) => (a.kind === 'detail' ? 0 : 1) - (b.kind === 'detail' ? 0 : 1))
    .slice(0, MAX_URLS);
  totalUrls += urls.length;
  log(`${s.supplier_id} website=${website || '-'} urls=${urls.length} map=${mapCalls} search=${searchCalls}`);
  if (!urls.length) continue;

  if (!APPLY) {
    log('  ' + urls.slice(0, 6).map((u) => `${u.kind}:${u.url}`).join('\n  '));
    continue;
  }

  await runSQL(`
    insert into public.crawl_urls (supplier_id,url,kind,source,status)
    select supplier_id,url,kind,source,'pending'
    from jsonb_to_recordset(${JSON.stringify(urls.map((u) => ({ supplier_id: s.supplier_id, ...u }))).replace(/'/g, "''")}::jsonb)
      as x(supplier_id text,url text,kind text,source text)
    on conflict (supplier_id,url) do update
      set kind=excluded.kind, source=excluded.source, updated_at=now()
      where public.crawl_urls.status='pending'
  `);
  await runSQL(`
    update public.crawl_queue set
      website=coalesce(nullif(website,''), ${lit(website)}),
      status=case when status='needs_search' then 'pending' else status end,
      updated_at=now()
    where supplier_id=${lit(s.supplier_id)}
  `);
}

log(JSON.stringify({ suppliers: suppliers.length, urls: totalUrls, map_calls: mapCalls, search_calls: searchCalls, applied: APPLY }));
