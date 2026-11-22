import { runSQL, sqlQuote } from './lib.mjs';

const TARGETS = [
  ['supplier-007', 'Q20', 'Q20 Quadcopter Platform', 'multirotor'],
  ['supplier-007', 'TD220', 'TD220 Coaxial Unmanned Helicopter', 'helicopter'],
  ['supplier-007', 'Q100', 'Q100 Agricultural Drone', 'agricultural'],
  ['supplier-007', 'TD550', 'TD550 Coaxial Unmanned Helicopter', 'helicopter'],
  ['supplier-007', 'T1400', 'T1400 Coaxial Unmanned Helicopter', 'helicopter'],
  ['supplier-009', 'D30', 'ZMD30 Multirotor Drone', 'multirotor'],
  ['supplier-009', 'D60', 'ZMD60 Multirotor Drone', 'multirotor'],
  ['supplier-009', 'ZMD200', 'ZMD200 Heavy-Lift Multirotor Drone', 'multirotor'],
  ['supplier-009', 'D10', 'ZMD10 Multirotor Drone', 'multirotor'],
  ['supplier-001', 'Unilark', 'Unilark S6 Inspection Drone', 'multirotor'],
  ['supplier-001', 'Finix200M', 'Finix200M Flight Controller', 'flight-control'],
  ['supplier-001', 'Finix300', 'Finix300 Flight Controller', 'flight-control'],
  ['supplier-001', 'Finix3000', 'Finix3000 Flight Controller', 'flight-control'],
  ['supplier-001', 'Unihangar', 'Unihangar S1 Automated Dock', 'vtol'],
  ['supplier-088', 'CZ100', 'CZ100 Flight Controller', 'flight-control'],
  ['supplier-156', null, 'Matrice 4D Tethered Drone', 'multirotor']
];

// 1) delete obvious junk rows (never touch the 16 selected products)
const junkPatterns = ['skip to content', '产品展示', '全站搜索', '新品推荐', '常见问题', '中文', 'EN', '14',
  '5G物联网大数据平台', '高层建筑灭火', '哈瓦\\_无人机', '河北省特色产业集群设计新品发布会'];
const junkList = junkPatterns.map((p) => `'${p}'`).join(',');
await runSQL(`delete from public.products where lower(name) in (${junkList}) or name like '哈瓦\\_%'`);

// 2) de-duplicate identical (supplier, name, model) rows, keep the newest
await runSQL(`
  delete from public.products p
  using public.products q
  where p.supplier_id = q.supplier_id
    and p.name = q.name
    and coalesce(p.model,'') = coalesce(q.model,'')
    and p.ctid < q.ctid
`);

// 3) apply curated names / categories for the 16
for (const [sid, model, en, cat] of TARGETS) {
  const where = model
    ? `supplier_id=${sqlQuote(sid)} and model=${sqlQuote(model)}`
    : `supplier_id=${sqlQuote(sid)} and name like 'Matrice 4D%'`;
  await runSQL(`update public.products
    set name_en=${sqlQuote(en)}, category=${sqlQuote(cat)}, updated_at=now()
    where ${where}`);
}

// 4) normalise remaining categories into the taxonomy where obvious
await runSQL(`
  update public.products set category = case
    when category in ('flight_control') then 'flight-control'
    when category in ('helicopter') then 'helicopter'
    when category in ('evtol') then 'vtol'
    when category in ('agricultural') then 'agricultural'
    when category in ('defense') then 'defense'
    when category in ('logistics') then 'logistics'
    when category in ('components') then 'components'
    when category in ('industrial') then 'multirotor'
    when category in ('consumer') then 'multirotor'
    when category in ('services') then 'components'
    when category in ('other') then 'components'
    else category end
  where category not in (select slug from public.product_categories)
`);

const rows = await runSQL(`select supplier_id, model, name, name_en, category from public.products
  where (supplier_id='supplier-007' and model in ('Q20','TD220','Q100','TD550','T1400'))
     or (supplier_id='supplier-009' and model in ('D30','D60','ZMD200','D10'))
     or (supplier_id='supplier-001' and model in ('Unilark','Finix200M','Finix300','Finix3000','Unihangar'))
     or (supplier_id='supplier-088' and model='CZ100')
     or (supplier_id='supplier-156' and name like 'Matrice 4D%')
  order by supplier_id, name_en`);
console.log('TARGETS', rows.length);
for (const r of rows) console.log([r.supplier_id, r.model || '-', r.name_en, r.category].join(' | '));

const total = await runSQL(`select count(*) n from public.products`);
console.log('TOTAL PRODUCTS', JSON.stringify(total));