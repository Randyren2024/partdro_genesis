import fs from 'node:fs';
import { runSQL } from './lib.mjs';

const sql = fs.readFileSync(new URL('./18_crawl_urls.sql', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
await runSQL(sql);
console.log('crawl_urls schema applied');

const cols = await runSQL(`select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='crawl_urls' order by ordinal_position`);
console.log(cols.map((c) => `${c.column_name}:${c.data_type}`).join('\n'));

const idx = await runSQL(`select indexname from pg_indexes where schemaname='public' and tablename='crawl_urls' order by 1`);
console.log('INDEXES', idx.map((i) => i.indexname).join(','));
