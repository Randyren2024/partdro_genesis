import { runSQL } from './lib.mjs';

const q = await runSQL(`select status, count(*) n, sum(products) products, sum(media) media, sum(credits) credits from public.crawl_queue group by 1 order by 1`);
console.log('QUEUE', JSON.stringify(q));

const p = await runSQL(`select crawl_status, count(*) n,
  count(*) filter (where jsonb_array_length(media)>0) with_media,
  count(*) filter (where model is null) no_model
  from public.products group by 1 order by 1`);
console.log('PRODUCTS', JSON.stringify(p));

const t = await runSQL(`select count(*) products, count(distinct supplier_id) suppliers from public.products`);
console.log('TOTAL', JSON.stringify(t));

const media = await runSQL(`select count(*) files, pg_size_pretty(sum((media->>0)::int)::bigint) dummy from public.products where false`).catch(() => []);
const buckets = await runSQL(`select id, public, file_size_limit from storage.buckets`);
console.log('BUCKETS', JSON.stringify(buckets));

const obj = await runSQL(`select count(*) files from storage.objects where bucket_id='supplier-media'`);
console.log('STORAGE OBJECTS', JSON.stringify(obj));

const zero = await runSQL(`select supplier_id, priority, status, pages from public.crawl_queue where status='done' and products=0 order by supplier_id`);
console.log('DONE_BUT_EMPTY', zero.length, JSON.stringify(zero.slice(0, 60).map((x) => x.supplier_id)));

const failed = await runSQL(`select supplier_id, left(coalesce(last_error,''),80) err from public.crawl_queue where status='failed' order by supplier_id`);
console.log('FAILED', failed.length, JSON.stringify(failed));

const noSearch = await runSQL(`select count(*) n from public.crawl_queue where status='needs_search'`);
console.log('NEEDS_SEARCH', JSON.stringify(noSearch));

const top = await runSQL(`select supplier_id, name, model, crawl_status, jsonb_array_length(media) media from public.products order by created_at desc limit 10`);
console.log('LATEST', JSON.stringify(top, null, 1));