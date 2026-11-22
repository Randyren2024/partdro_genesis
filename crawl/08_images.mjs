import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { runSQL, storageUpload, TARGET_URL, sqlQuote, OUT_DIR } from './lib.mjs';

const TARGET_SQL = `
  (supplier_id='supplier-007' and model in ('Q20','TD220','Q100','TD550','T1400'))
  or (supplier_id='supplier-009' and model in ('D30','D60','ZMD200','D10'))
  or (supplier_id='supplier-001' and model in ('Unilark','Finix200M','Finix300','Finix3000','Unihangar'))
  or (supplier_id='supplier-088' and model='CZ100')
  or (supplier_id='supplier-156' and name like 'Matrice 4D%')
`;
const rows = await runSQL(`select id, name, name_en, model, source_url from public.products where ${TARGET_SQL} order by supplier_id, model`);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const BAD = /(logo|icon|sprite|placeholder|qrcode|qr_code|weixin|wechat|avatar|candan|close|search|arrow|\.ico$|\.svg$|line\.png|banner)/i;

function firecrawl(args, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const p = spawn('firecrawl', args, { shell: true, windowsHide: true });
    let err = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, err }); });
  });
}

async function grab(url, referer) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 20000);
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer }, redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!/^image\//i.test(ct) || /svg/i.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 15000 || buf.length > 6 * 1024 * 1024) return null;
    const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : /gif/i.test(ct) ? 'gif' : 'jpg';
    return { buf, ct, ext };
  } catch { return null; }
}

const dir = path.join(OUT_DIR, 'images');
fs.mkdirSync(dir, { recursive: true });

for (const p of rows) {
  if (!p.source_url) continue;
  const have = await runSQL(`select count(*) n from public.media_assets where product_id=${sqlQuote(p.id)} and kind='image' and is_public`);
  const current = have[0].n;
  if (current >= 12) { console.log(p.name_en, 'skip', current); continue; }

  const outFile = path.join(dir, `${p.id}.json`);
  if (!fs.existsSync(outFile)) {
    await firecrawl(['scrape', p.source_url, '-f', 'images', '--json', '-o', outFile]);
  }
  let urls = [];
  try {
    const j = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    const d = j.data || j;
    urls = d.images || [];
  } catch {
    console.log(p.name_en, 'scrape failed');
    continue;
  }
  const seenSrc = new Set();
  const list = urls.filter((u) => /^https?:\/\//i.test(u) && !BAD.test(u))
    .filter((u) => { if (seenSrc.has(u)) return false; seenSrc.add(u); return true; })
    .filter((u) => !/\.(ico|svg)($|\?)/i.test(u))
    .slice(0, 20);

  let added = 0;
  for (const u of list) {
    if (current + added >= 12) break;
    const got = await grab(u, p.source_url);
    if (!got) continue;
    const hash = crypto.createHash('sha256').update(got.buf).digest('hex').slice(0, 16);
    const dup = await runSQL(`select 1 from public.media_assets where product_id=${sqlQuote(p.id)} and sha256=${sqlQuote(hash)} limit 1`);
    if (dup.length) continue;
    const objPath = `products/${p.id}/gallery/${hash}.${got.ext}`;
    try { await storageUpload(objPath, got.buf, got.ct); } catch { continue; }
    await runSQL(`insert into public.media_assets
      (product_id, kind, role, storage_path, public_url, source_url, mime, bytes, sha256, is_public, sort_order, alt_i18n)
      values (${sqlQuote(p.id)}, 'image', 'gallery', ${sqlQuote(objPath)},
        ${sqlQuote(`${TARGET_URL}/storage/v1/object/public/supplier-media/${objPath}`)},
        ${sqlQuote(u)}, ${sqlQuote(got.ct)}, ${got.buf.length}, ${sqlQuote(hash)}, true,
        (select coalesce(max(sort_order),0)+1 from public.media_assets where product_id=${sqlQuote(p.id)}),
        ${sqlQuote(JSON.stringify({ en: p.name_en || p.name }))}::jsonb)`);
    added++;
  }
  console.log(JSON.stringify({ name: p.name_en || p.name, before: current, added }));
}

const stats = await runSQL(`select p.name_en, count(m.*) filter (where m.kind='image' and m.is_public) imgs
  from public.products p left join public.media_assets m on m.product_id=p.id
  where (${TARGET_SQL.replaceAll("supplier_id", "p.supplier_id").replaceAll("model", "p.model").replaceAll("name like", "p.name like")})
  group by 1 order by 1`);
console.log(JSON.stringify(stats));