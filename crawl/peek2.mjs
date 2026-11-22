import { runSQL } from './lib.mjs';
const sid = process.argv[2];
const r = await runSQL(`select name, model, (select count(*) from jsonb_object_keys(specifications)) as specs, specifications
  from public.products where supplier_id='${sid}' order by name`);
for (const x of r) console.log(x.name, '|', x.model, '|', x.specs, '|', JSON.stringify(x.specifications).slice(0, 400));