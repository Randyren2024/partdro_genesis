import crypto from 'node:crypto';
import { runSQL, storageUpload, TARGET_URL, jsonSql, sqlQuote, sleep } from './lib.mjs';
const sqlLit = sqlQuote;

const TARGET_SQL = `
  (supplier_id='supplier-007' and model in ('Q20','TD220','Q100','TD550','T1400'))
  or (supplier_id='supplier-009' and model in ('D30','D60','ZMD200','D10'))
  or (supplier_id='supplier-001' and model in ('Unilark','Finix200M','Finix300','Finix3000','Unihangar'))
  or (supplier_id='supplier-088' and model='CZ100')
  or (supplier_id='supplier-156' and name like 'Matrice 4D%')
`;

const products = await runSQL(`select id, name, name_en, model, media from public.products where ${TARGET_SQL}`);
const JUNK = /(logo|icon|sprite|placeholder|qrcode|qr_code|weixin|wechat|banner|candan|more2|arrow)/i;

let total = 0;
for (const p of products) {
  const media = Array.isArray(p.media) ? p.media : [];
  await runSQL(`delete from public.media_assets where product_id = '${p.id}'`);

  let order = 0;
  let imageIndex = 0;
  for (const m of media) {
    if (!m || !m.public_url) continue;
    if (m.type === 'video_embed') {
      await runSQL(`insert into public.media_assets (product_id, kind, role, public_url, source_url, is_public, sort_order)
        values ('${p.id}', 'video_embed', 'feature', ${sqlLit(m.url)}, ${sqlLit(m.url)}, true, ${order})`);
      order++;
      continue;
    }
    if (m.type === 'video') {
      await runSQL(`insert into public.media_assets (product_id, kind, role, storage_path, public_url, source_url, mime, bytes, sha256, is_public, sort_order)
        values ('${p.id}', 'video', 'feature', ${sqlLit(m.storage_path)}, ${sqlLit(m.public_url)}, ${sqlLit(m.source_url)}, 'video/mp4', ${m.bytes || 0}, ${sqlLit(m.sha256)}, true, ${order})`);
      order++;
      continue;
    }
    if (m.type !== 'image') continue;

    const junk = JUNK.test(m.source_url || '') || JUNK.test(m.public_url || '');
    const role = imageIndex === 0 ? 'hero' : imageIndex === 1 ? 'overview' : 'gallery';
    let up = null;
    try {
      const r = await fetch(m.public_url);
      if (!r.ok) throw new Error('fetch ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 12000) throw new Error('too small');
      const ct = r.headers.get('content-type') || 'image/jpeg';
      const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : /gif/i.test(ct) ? 'gif' : 'jpg';
      const hash = m.sha256 || crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
      const path = `products/${p.id}/${role}/${hash}.${ext}`;
      await storageUpload(path, buf, ct);
      up = { path, ct, bytes: buf.length, hash, ext };
    } catch (e) {
      continue;
    }
    await runSQL(`insert into public.media_assets
      (product_id, kind, role, storage_path, public_url, source_url, mime, bytes, sha256, is_public, sort_order, alt_i18n)
      values ('${p.id}', 'image', '${role}', ${sqlLit(up.path)},
        ${sqlLit(`${TARGET_URL}/storage/v1/object/public/supplier-media/${up.path}`)},
        ${sqlLit(m.source_url)}, ${sqlLit(up.ct)}, ${up.bytes}, ${sqlLit(up.hash)}, ${junk ? 'false' : 'true'}, ${order},
        ${jsonSql({ en: p.name_en || p.name })})
      on conflict (product_id, sha256) where sha256 is not null do nothing`);
    order++;
    imageIndex++;
    total++;
    await sleep(20);
  }
  console.log(p.model || p.name, 'images', imageIndex, 'assets', order);
}

console.log('TOTAL IMAGE ASSETS', total);
const stats = await runSQL(`select role, count(*) n from public.media_assets group by 1 order by 1`);
console.log(JSON.stringify(stats));
