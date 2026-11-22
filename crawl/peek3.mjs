import { runSQL, TARGET_URL } from './lib.mjs';
const sid = process.argv[2];
const like = process.argv[3] || '';
const rows = await runSQL(`select url, markdown_path from public.crawl_pages where supplier_id='${sid}' and url like '%${like}%' limit 2`);
for (const r of rows) {
  const md = await (await fetch(`${TARGET_URL}/storage/v1/object/public/supplier-media/${r.markdown_path}`)).text();
  console.log('===', r.url);
  console.log((md.match(/^#{1,6}\s+.+$/gm) || []).slice(0, 25).join('\n'));
}