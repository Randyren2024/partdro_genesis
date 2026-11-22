import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runSQL, storageUpload, TARGET_URL, sqlQuote, jsonSql } from '../../../../crawl/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const pkgDir = path.join(repo, 'review', 'packages');
const only = (getArg('products', '') || '').split(',').filter(Boolean);
const dir = getArg('packages', '') ? path.dirname(path.resolve(getArg('packages'))) : pkgDir;

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && (!only.length || only.includes(f.replace('.json', ''))));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const sha16 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const CJK = /[\u4e00-\u9fa5]/;

const log = [];
for (const file of files) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const pid = pkg.product_id;
const existing = await runSQL(`select sha256 from public.media_assets where product_id=${sqlQuote(pid)} and sha256 is not null`);
  const hashes = new Set(existing.map((r) => r.sha256));
  const imgCount = await runSQL(`select count(*) n from public.media_assets where product_id=${sqlQuote(pid)} and kind='image' and is_public`);
  const skipImages = (imgCount[0]?.n || 0) >= 8;
  let added = 0;

  for (const img of (skipImages ? [] : pkg.proposed.images || [])) {
    if (added >= 6) break;
    if (dryRun) { log.push(`${pkg.slug}: [dry] image ${img.role} ${img.source_url.slice(0, 80)}`); continue; }
    let buf;
    try {
      const r = await fetch(img.source_url, { headers: { 'User-Agent': UA, Referer: pkg.source_url } });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (!/^image\//i.test(ct) || /svg/i.test(ct)) continue;
      buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 12000 || buf.length > 5 * 1024 * 1024) continue;
    } catch { continue; }
    const h = sha16(buf);
    if (hashes.has(h)) continue;
    const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : 'jpg';
    const objPath = `products/${pid}/${img.role}/${h}.${ext}`;
    try { await storageUpload(objPath, buf, ct); } catch { continue; }
    const ins = await runSQL(`insert into public.media_assets
      (product_id, kind, role, storage_path, public_url, source_url, mime, bytes, sha256, alt_i18n, is_public, sort_order)
      values (${sqlQuote(pid)}, 'image', ${sqlQuote(img.role)}, ${sqlQuote(objPath)},
        ${sqlQuote(`${TARGET_URL}/storage/v1/object/public/supplier-media/${objPath}`)},
        ${sqlQuote(img.source_url)}, ${sqlQuote(ct)}, ${buf.length}, ${sqlQuote(h)},
        ${jsonSql({ en: img.alt })}, true,
        (select coalesce(max(sort_order),0)+1 from public.media_assets where product_id=${sqlQuote(pid)}))
      on conflict (product_id, sha256) where sha256 is not null do nothing
      returning id`);
    const newId = ins[0] && ins[0].id;
    if (newId && (img.role === 'hero' || img.role === 'overview')) {
      await runSQL(`update public.media_assets set role='gallery'
        where product_id=${sqlQuote(pid)} and role=${sqlQuote(img.role)} and id<>${sqlQuote(newId)}`);
      await runSQL(`update public.product_sections s set media_id=${sqlQuote(newId)}
        from public.product_pages pg
        where s.page_id=pg.id and pg.product_id=${sqlQuote(pid)} and s.kind=${sqlQuote(img.role)}`);
    }
    hashes.add(h);
    added++;
  }

  for (const s of pkg.proposed.specs || []) {
    if (CJK.test(s.label)) continue;
    if (s.action === 'translate_value' && s.to && s.to !== s.from && !CJK.test(s.to)) {
      if (dryRun) { log.push(`${pkg.slug}: [dry] spec ${s.label} "${s.from}" -> "${s.to}"`); continue; }
      await runSQL(`update public.product_spec_values v set value=${sqlQuote(s.to)}
        from public.product_specs ps
        where v.spec_id=ps.id and ps.product_id=${sqlQuote(pid)} and v.label=${sqlQuote(s.label)} and v.value=${sqlQuote(s.from)}`);
    }
    if (s.action === 'add' && s.to) {
      const dup = await runSQL(`select 1 from public.product_spec_values v join public.product_specs ps on ps.id=v.spec_id
        where ps.product_id=${sqlQuote(pid)} and v.label=${sqlQuote(s.label)} limit 1`);
      if (dup.length) continue;
      if (dryRun) { log.push(`${pkg.slug}: [dry] add spec ${s.label} = ${s.to}`); continue; }
      const row = await runSQL(`insert into public.product_specs (product_id, group_key, position)
        values (${sqlQuote(pid)}, 'general',
          (select coalesce(max(position),0)+1 from public.product_specs where product_id=${sqlQuote(pid)})) returning id`);
      await runSQL(`insert into public.product_spec_values (spec_id, locale, label, value)
        values (${sqlQuote(row[0].id)}, 'en', ${sqlQuote(s.label)}, ${sqlQuote(s.to)})`);
    }
  }

  for (const v of pkg.proposed.videos || []) {
    if (dryRun) { log.push(`${pkg.slug}: [dry] video ${v}`); continue; }
    await runSQL(`insert into public.media_assets (product_id, kind, role, public_url, source_url, is_public, sort_order)
      values (${sqlQuote(pid)}, 'video_embed', 'feature', ${sqlQuote(v)}, ${sqlQuote(v)}, true,
        (select coalesce(max(sort_order),0)+1 from public.media_assets where product_id=${sqlQuote(pid)}))`);
  }

  log.push(`${pkg.slug}: images ${skipImages ? 'skipped (already >=8)' : 'added ' + added}`);
}

console.log(dryRun ? 'DRY RUN — no writes' : 'APPLIED');
for (const line of log) console.log(line);
if (!dryRun) console.log('Run 17_derivatives.mjs and validate-publish.mjs next.');


