import { runSQL, jsonSql } from './lib.mjs';

const rows = await runSQL(`
  select p.supplier_id,
         coalesce(nullif(p.website,''), p.profile_data->>'website','') as website,
         coalesce(p.profile_data->'sources','[]'::jsonb) as sources,
         coalesce(p.profile_data->'productModels','[]'::jsonb) as models
  from public.supplier_profiles p
  order by p.supplier_id
`);

const out = [];
for (const r of rows) {
  const web = (r.website || '').trim();
  const seen = new Set();
  const seeds = [];
  const push = (u) => {
    if (!u || typeof u !== 'string') return;
    if (!/^https?:\/\//i.test(u)) return;
    const norm = u.split('#')[0].replace(/\/$/, '');
    if (seen.has(norm)) return;
    seen.add(norm);
    seeds.push(norm);
  };
  push(web);
  const srcs = Array.isArray(r.sources) ? r.sources : [];
  const ranked = srcs
    .filter((s) => s && s.url && /(product|catalogue|website|company)/i.test(s.type || ''))
    .sort((a, b) => {
      const score = (t) => (/product_detail/i.test(t) ? 6 : /product_catalogue/i.test(t) ? 5 : /catalogue/i.test(t) ? 4 : /product/i.test(t) ? 3 : /website/i.test(t) ? 2 : 1);
      return score(b.type || '') - score(a.type || '');
    });
  for (const s of ranked) push(s.url);
  for (const s of srcs) push(s.url);

  const hasWeb = web !== '';
  const hasProdSrc = ranked.length > 0;
  const priority = hasWeb && hasProdSrc ? 1 : hasWeb ? 2 : hasProdSrc ? 3 : 4;
  out.push({
    supplier_id: r.supplier_id,
    priority,
    website: hasWeb ? web : null,
    seed_urls: JSON.stringify(seeds.slice(0, 8)),
    status: priority === 4 ? 'needs_search' : 'pending'
  });
}

const sql = `
  insert into public.crawl_queue (supplier_id, priority, website, seed_urls, status)
  select supplier_id, priority, website, seed_urls::jsonb, status
  from jsonb_to_recordset(${jsonSql(out)}) as x(supplier_id text, priority int, website text, seed_urls text, status text)
  on conflict (supplier_id) do update
    set priority = excluded.priority,
        website = excluded.website,
        seed_urls = excluded.seed_urls,
        updated_at = now()
    where public.crawl_queue.status in ('pending','needs_search')
`;
await runSQL(sql);

const stats = await runSQL(`
  select priority, status, count(*) n,
         sum(jsonb_array_length(seed_urls)) seeds
  from public.crawl_queue group by 1,2 order by 1,2
`);
console.log(JSON.stringify(stats, null, 1));
