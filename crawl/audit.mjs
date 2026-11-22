import { runSQL } from './lib.mjs';

const s = await runSQL(`
  select crawl_status, count(*) n,
         count(*) filter (where model is null) no_model,
         count(*) filter (where jsonb_array_length(media)=0) no_media,
         count(*) filter (where length(coalesce(description,''))<80) thin_desc
  from public.products group by 1 order by 1
`);
console.log('STATUS', JSON.stringify(s, null, 1));

const names = await runSQL(`
  select supplier_id, name, model, crawl_status, source_url
  from public.products
  order by created_at desc
  limit 80
`);
console.log('LATEST 80');
for (const r of names) console.log([r.supplier_id, r.crawl_status, r.name, '|', r.model, '|', (r.source_url||'').slice(0,90)].join(' '));

const junk = await runSQL(`
  select supplier_id, name, source_url from public.products
  where length(coalesce(name,'')) < 4
     or name ~* '^(home|首页|产品中心|产品|关于我们|联系我们|新闻|more|read more|learn more|next|prev|下载|登录|注册)$'
     or name ~* '(登录|注册|购物车|菜单|导航)'
  limit 50
`);
console.log('SUSPECT', JSON.stringify(junk, null, 1));

const dup = await runSQL(`
  select supplier_id, lower(name) n, count(*) c
  from public.products group by 1,2 having count(*)>1 order by c desc limit 20
`);
console.log('DUP NAMES', JSON.stringify(dup));