import fs from 'node:fs';
import { runSQL } from './lib.mjs';

const sql = fs.readFileSync(new URL('./04_landing_schema.sql', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
await runSQL(sql);
console.log('landing schema applied');

const tables = await runSQL(`select table_name from information_schema.tables
  where table_schema='public' and (table_name like 'product_%' or table_name like 'media_%')
  order by 1`);
console.log(tables.map((t) => t.table_name).join('\n'));

const views = await runSQL(`select table_name from information_schema.views where table_schema='public' order by 1`);
console.log('VIEWS', views.map((v) => v.table_name).join(','));
const cats = await runSQL(`select count(*) n from public.product_categories`);
console.log('CATEGORIES', JSON.stringify(cats));
