import crypto from 'node:crypto';
import { runSQL, storageUpload, TARGET_URL, sqlQuote } from './lib.mjs';
import { extractPage, closeSession } from './bridge.mjs';

const only = process.argv[2] || null;
const TARGET_SQL = `
  (supplier_id='supplier-007' and model in ('Q20','TD220','Q100','TD550','T1400'))
  or (supplier_id='supplier-009' and model in ('D30','D60','ZMD200','D10'))
  or (supplier_id='supplier-001' and model in ('Unilark','Finix200M','Finix300','Finix3000','Unihangar'))
  or (supplier_id='supplier-088' and model='CZ100')
  or (supplier_id='supplier-156' and name like 'Matrice 4D%')
`;
const rows = await runSQL(`select id, supplier_id, name, name_en, model, source_url, specifications, media
  from public.products where (${TARGET_SQL}) ${only ? `and supplier_id=${sqlQuote(only)}` : ''} order by supplier_id, model`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const JUNK = /(logo|icon|sprite|placeholder|qrcode|qr_code|weixin|wechat|avatar|candan|close|search|arrow|line\.png|banner)/i;
const SPEC_LABEL = /(重量|载荷|载重|速度|升限|尺寸|半径|航时|续航|功率|电压|容量|高度|长度|宽度|轴距|温度|等级|材质|直径|翼展|抗风|爬升|精度|定高|定位)/;

function parseSpecs(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const specs = {};
  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i];
    if (label.length > 26 || !SPEC_LABEL.test(label) || /[|\\]|无人机|有限公司|新闻|日期/.test(label)) continue;
    const val = lines[i + 1];
    if (!val || val.length > 60 || SPEC_LABEL.test(val)) continue;
    if (!/[\d]/.test(val)) continue;
    if (/^(首页|产品|关于|联系|新闻|更多)$/.test(val)) continue;
    if (!(label in specs)) specs[label] = val;
    if (Object.keys(specs).length >= 30) break;
  }
  return specs;
}

async function downloadImage(url, referer) {
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

let session = '';
for (const p of rows) {
  if (session !== `enrich-${p.supplier_id}`) {
    if (session) await closeSession(session);
    session = `enrich-${p.supplier_id}`;
  }
  if (!p.source_url) continue;
  let d;
  try {
    d = await extractPage(p.source_url, session);
  } catch (e) {
    console.log(JSON.stringify({ id: p.id, name: p.name_en || p.name, error: String(e.message).slice(0, 160) }));
    continue;
  }

  const existing = new Set((p.media || []).map((m) => m.sha256).filter(Boolean));
  const seenSrc = new Set();
  const candidates = d.imgs
    .filter((i) => i.w >= 600 && i.h >= 280 && !JUNK.test(i.src))
    .filter((i) => { if (seenSrc.has(i.src)) return false; seenSrc.add(i.src); return true; })
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, 14);

  let added = 0;
  for (const im of candidates) {
    const got = await downloadImage(im.src, p.source_url);
    if (!got) continue;
    const hash = crypto.createHash('sha256').update(got.buf).digest('hex').slice(0, 16);
    if (existing.has(hash)) continue;
    const path = `products/${p.id}/gallery/${hash}.${got.ext}`;
    try { await storageUpload(path, got.buf, got.ct); } catch { continue; }
    const alt = (im.alt || p.name_en || p.name || '').slice(0, 120);
    await runSQL(`insert into public.media_assets
      (product_id, kind, role, storage_path, public_url, source_url, mime, bytes, sha256, is_public, sort_order, alt_i18n)
      values (${sqlQuote(p.id)}, 'image', 'gallery', ${sqlQuote(path)},
        ${sqlQuote(`${TARGET_URL}/storage/v1/object/public/supplier-media/${path}`)},
        ${sqlQuote(im.src)}, ${sqlQuote(got.ct)}, ${got.buf.length}, ${sqlQuote(hash)}, true,
        (select coalesce(max(sort_order),0)+1 from public.media_assets where product_id=${sqlQuote(p.id)}),
        ${sqlQuote(JSON.stringify({ en: alt }))}::jsonb)
      on conflict (product_id, sha256) where sha256 is not null do nothing`);
    existing.add(hash);
    added++;
  }

  const newSpecs = parseSpecs(d.text || '');
  const merged = { ...(p.specifications || {}), ...Object.fromEntries(Object.entries(newSpecs).filter(([k]) => !(k in (p.specifications || {})))) };
  const specCount = Object.keys(merged).length;
  if (specCount > Object.keys(p.specifications || {}).length) {
    await runSQL(`update public.products set specifications=${sqlQuote(JSON.stringify(merged))}::jsonb, updated_at=now() where id=${sqlQuote(p.id)}`);
  }

  for (const v of d.videos || []) {
    await runSQL(`insert into public.media_assets (product_id, kind, role, public_url, source_url, mime, is_public, sort_order)
      values (${sqlQuote(p.id)}, 'video', 'feature', ${sqlQuote(v)}, ${sqlQuote(v)}, 'video/mp4', true,
      (select coalesce(max(sort_order),0)+1 from public.media_assets where product_id=${sqlQuote(p.id)}))`);
  }
  for (const e of d.embeds || []) {
    await runSQL(`insert into public.media_assets (product_id, kind, role, public_url, source_url, is_public, sort_order)
      values (${sqlQuote(p.id)}, 'video_embed', 'feature', ${sqlQuote(e)}, ${sqlQuote(e)}, true,
      (select coalesce(max(sort_order),0)+1 from public.media_assets where product_id=${sqlQuote(p.id)}))`);
  }

  console.log(JSON.stringify({ id: p.id, name: p.name_en || p.name, added, specs: specCount, videos: (d.videos || []).length, embeds: (d.embeds || []).length }));
}
if (session) await closeSession(session);

const stats = await runSQL(`select role, count(*) n from public.media_assets group by 1 order by 1`);
console.log('MEDIA', JSON.stringify(stats));