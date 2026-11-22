import { runSQL } from './lib.mjs';

const sid = process.argv[2] || 'supplier-001';
const p = await runSQL(`
  select slug, name, model, crawl_status, jsonb_array_length(media) as media,
         (select count(*) from jsonb_object_keys(specifications)) as specs,
         source_url
  from public.products where supplier_id = '${sid}' order by name
`);
console.log('PRODUCTS', JSON.stringify(p, null, 1));

const pg = await runSQL(`
  select url, page_type, title, image_count, video_count, markdown_path
  from public.crawl_pages where supplier_id = '${sid}'
`);
console.log('PAGES', JSON.stringify(pg, null, 1));

const one = await runSQL(`
  select media->0 as m from public.products
  where supplier_id = '${sid}' and jsonb_array_length(media) > 0 limit 1
`);
if (one[0]) {
  console.log('MEDIA SAMPLE', JSON.stringify(one[0].m));
  const r = await fetch(one[0].m.public_url);
  console.log('PUBLIC URL', r.status, r.headers.get('content-type'), r.headers.get('content-length'));
}
const q = await runSQL(`select status, pages, products, media, credits, last_error from public.crawl_queue where supplier_id='${sid}'`);
console.log('QUEUE', JSON.stringify(q));