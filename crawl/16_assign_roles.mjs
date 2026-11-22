import { runSQL, sqlQuote } from './lib.mjs';

const rows = await runSQL(`select id, product_id, role, width, height, bytes, source_url
  from public.media_assets where kind='image' and is_public order by product_id, sort_order`);

const byProduct = new Map();
for (const m of rows) {
  if (!byProduct.has(m.product_id)) byProduct.set(m.product_id, []);
  byProduct.get(m.product_id).push(m);
}

function score(m) {
  const w = m.width || 0, h = m.height || 0;
  if (w < 800 || h < 400) return 0;
  const ar = w / h;
  const arPenalty = ar < 1.05 ? 0.25 : ar > 2.6 ? 0.45 : ar > 2.2 ? 0.75 : 1;
  return w * h * arPenalty;
}

for (const [productId, list] of byProduct) {
  const usable = list.filter((m) => score(m) > 0);
  const pool = usable.length ? usable : list;
  const sorted = [...pool].sort((a, b) => score(b) - score(a));
  const hero = sorted[0];
  const overview = sorted.find((m) => m.id !== hero?.id) || hero;
  if (!hero) continue;

  await runSQL(`update public.media_assets set role='gallery' where product_id=${sqlQuote(productId)} and kind='image' and role in ('hero','overview')`);
  await runSQL(`update public.media_assets set role='hero' where id=${sqlQuote(hero.id)}`);
  if (overview) await runSQL(`update public.media_assets set role='overview' where id=${sqlQuote(overview.id)}`);
  await runSQL(`update public.product_sections s set media_id=${sqlQuote(hero.id)}
    from public.product_pages pg where s.page_id=pg.id and pg.product_id=${sqlQuote(productId)} and s.kind='hero'`);
  if (overview) {
    await runSQL(`update public.product_sections s set media_id=${sqlQuote(overview.id)}
      from public.product_pages pg where s.page_id=pg.id and pg.product_id=${sqlQuote(productId)} and s.kind='overview'`);
  }

  const p = await runSQL(`select name_en from public.products where id=${sqlQuote(productId)}`);
  console.log(JSON.stringify({ product: p[0]?.name_en, hero: `${hero.width}x${hero.height}`, ratio: +(hero.width / hero.height).toFixed(2) }));
}