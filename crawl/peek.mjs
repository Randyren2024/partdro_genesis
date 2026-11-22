import { runSQL, TARGET_URL } from './lib.mjs';

const sid = process.argv[2];
const rows = await runSQL(`select url, page_type, title, markdown_path from public.crawl_pages where supplier_id='${sid}' limit 3`);
for (const r of rows) {
  const u = `${TARGET_URL}/storage/v1/object/public/supplier-media/${r.markdown_path}`;
  const md = await (await fetch(u)).text();
  console.log('===', r.url, '|', r.title);
  console.log(md.slice(0, 1200));
  console.log('--- headings:', (md.match(/^#{1,3}\s+.+$/gm) || []).slice(0, 10).join(' || '));
}