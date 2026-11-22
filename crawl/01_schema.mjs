import fs from 'node:fs';
import { runSQL } from './lib.mjs';

const sql = fs.readFileSync(new URL('./01_schema.sql', import.meta.url), 'utf8');
const res = await runSQL(sql);
console.log('schema applied', JSON.stringify(res));

const buckets = await runSQL("select id, name, public, file_size_limit from storage.buckets");
console.log('buckets', JSON.stringify(buckets));

const tables = await runSQL("select table_name from information_schema.tables where table_schema='public' and table_name in ('products','crawl_pages','crawl_queue') order by 1");
console.log('tables', JSON.stringify(tables));