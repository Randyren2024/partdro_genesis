import sharp from 'sharp';
import { runSQL, storageUpload, TARGET_URL, sqlQuote, jsonSql } from './lib.mjs';

const WIDTHS = [640, 1280, 1920];
const rows = await runSQL(`select id, product_id, role, public_url, storage_path, derivatives, width, height
  from public.media_assets where kind='image' and is_public order by product_id, sort_order`);

let done = 0;
for (const m of rows) {
  if (m.derivatives && Object.keys(m.derivatives).length) { done++; continue; }
  let buf;
  try {
    const r = await fetch(m.public_url);
    if (!r.ok) continue;
    buf = Buffer.from(await r.arrayBuffer());
  } catch { continue; }

  const meta = await sharp(buf).metadata().catch(() => null);
  const base = (m.storage_path || '').replace(/\.[a-z0-9]+$/i, '');
  const out = {};
  for (const w of WIDTHS) {
    if (meta?.width && meta.width <= w) continue;
    try {
      const resized = await sharp(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      const path = `${base}-w${w}.webp`;
      await storageUpload(path, resized, 'image/webp');
      out[`w${w}`] = `${TARGET_URL}/storage/v1/object/public/supplier-media/${path}`;
    } catch {}
  }
  if (!Object.keys(out).length) continue;
  await runSQL(`update public.media_assets set derivatives=${jsonSql(out)} where id=${sqlQuote(m.id)}`);
  done++;
}

console.log('derivatives done', done, 'of', rows.length);
const sample = await runSQL(`select derivatives from public.media_assets where kind='image' and derivatives <> '{}'::jsonb limit 2`);
console.log(JSON.stringify(sample));