import { runSQL, sqlQuote } from './lib.mjs';

function imageSize(buf) {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0x47 && buf[1] === 0x49) {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) {
      const type = buf.toString('ascii', 12, 16);
      if (type === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (type === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (type === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}

const rows = await runSQL(`select id, product_id, role, sort_order, public_url, source_url, bytes
  from public.media_assets where kind='image' and is_public order by product_id, sort_order`);

let updated = 0;
const byProduct = new Map();
for (const m of rows) {
  if (!byProduct.has(m.product_id)) byProduct.set(m.product_id, []);
  let dims = null;
  try {
    const r = await fetch(m.public_url);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      dims = imageSize(buf);
      if (dims) {
        await runSQL(`update public.media_assets set width=${dims.w}, height=${dims.h}, bytes=${buf.length} where id=${sqlQuote(m.id)}`);
        updated++;
      }
    }
  } catch {}
  byProduct.get(m.product_id).push({ ...m, w: dims?.w || 0, h: dims?.h || 0, bytes: dims ? m.bytes : m.bytes });
}

for (const [productId, list] of byProduct) {
  const usable = list.filter((m) => m.w >= 800 && m.h >= 400);
  const pool = usable.length ? usable : list;
  const score = (m) => m.w * m.h;
  const sorted = [...pool].sort((a, b) => score(b) - score(a));
  const hero = sorted[0];
  const overview = sorted.find((m) => m.id !== hero?.id) || hero;
  if (!hero) continue;

  await runSQL(`update public.media_assets set role='gallery' where product_id=${sqlQuote(productId)} and kind='image' and role in ('hero','overview')`);
  await runSQL(`update public.media_assets set role='hero' where id=${sqlQuote(hero.id)}`);
  await runSQL(`update public.media_assets set role='overview' where id=${sqlQuote(overview.id)}`);

  await runSQL(`update public.product_sections s set media_id=${sqlQuote(hero.id)}
    from public.product_pages pg
    where s.page_id=pg.id and pg.product_id=${sqlQuote(productId)} and s.kind='hero'`);
  await runSQL(`update public.product_sections s set media_id=${sqlQuote(overview.id)}
    from public.product_pages pg
    where s.page_id=pg.id and pg.product_id=${sqlQuote(productId)} and s.kind='overview'`);

  const p = await runSQL(`select name_en from public.products where id=${sqlQuote(productId)}`);
  console.log(JSON.stringify({ product: p[0]?.name_en, hero: `${hero.w}x${hero.h}`, overview: `${overview.w}x${overview.h}` }));
}

console.log('dims updated', updated, 'of', rows.length);