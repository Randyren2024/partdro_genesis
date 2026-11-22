import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSQL, sqlQuote } from '../../../../crawl/lib.mjs';
import { spawn } from 'node:child_process';
import { extractPage, closeSession } from '../../../../crawl/bridge.mjs';

function firecrawlScrape(url, outFile) {
  return new Promise((resolve) => {
    const p = spawn('firecrawl', ['scrape', url, '-f', 'markdown', '-f', 'images', '--json', '-o', outFile], { shell: true, windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch {} }, 180000);
    p.on('close', () => { clearTimeout(t); resolve(); });
  });
}

async function scrapeFallback(url, rawFile) {
  if (!fs.existsSync(rawFile)) await firecrawlScrape(url, rawFile);
  const j = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const d = j.data || j;
  const md = d.markdown || '';
  const imgs = (d.images || [])
    .filter((u) => typeof u === 'string' && /^https?:/i.test(u))
    .map((src) => ({ src, alt: '', w: 0, h: 0 }));
  const videos = [...md.matchAll(/https?:\/\/[^\s)"'<>]+\.(?:mp4|webm)(?:\?|$)/gi)].map((m) => m[0]);
  const pdfs = [...md.matchAll(/https?:\/\/[^\s)"'<>]+\.pdf/gi)].map((m) => m[0]);
  return { imgs, videos, embeds: [], text: md, pdfs, tables: [], dls: [] };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const pkgDir = path.join(repo, 'review', 'packages');
const rawDir = path.join(repo, 'review', 'raw');
fs.mkdirSync(pkgDir, { recursive: true });
fs.mkdirSync(rawDir, { recursive: true });

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const wanted = (getArg('products', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

const BAD_IMAGE = /(logo|icon|sprite|placeholder|qrcode|qr_code|weixin|wechat|avatar|candan|close|search|arrow|line\.png|banner|captcha|verifycode|wx_|weibo|share|static\/img|home\/top|home\/bottom|about\/contact|contact\/info|static\/images\/home)/i;
const SPEC_LABEL = /(重量|载荷|载重|速度|升限|尺寸|半径|航时|续航|功率|电压|容量|高度|长度|宽度|轴距|温度|等级|材质|直径|翼展|抗风|爬升|精度|照明|光通量|照度|系缆|部署)/;
const JUNK_LABEL = /(电话|地址|热线|服务时间|市场合作|技术支持|周一到周|里程碑|咨询|邮箱|网址|微信|邮编)/;
const PHRASES = [
  ['机臂+桨叶展开', 'arms and props unfolded'], ['机臂+桨叶折叠', 'arms and props folded'],
  ['海平面', 'sea level'], ['播撒', 'spreading'], ['喷洒', 'spraying'], ['标配', 'standard'],
  ['选配', 'optional'], ['加装', 'fitted with'], ['含油', 'incl. fuel'], ['空载', 'no payload'],
  ['可扩展', 'expandable'], ['大于', 'more than'], ['天窗关闭', 'roof closed'], ['天窗打开', 'roof open'],
  ['前向', 'forward'], ['侧向', 'lateral'], ['水平方向', 'horizontal'], ['垂直方向', 'vertical'],
  ['作业高度', 'working height'], ['载荷', 'payload'], ['无地效', 'OGE'], ['喷头', 'nozzles'],
  ['作业箱', 'tank'], ['果树套件', 'orchard kit'], ['公斤', 'kg'], ['千克', 'kg'],
  ['（', ' ('], ['）', ')'], ['，', ', '], ['、', ', ']
];

const LABEL_MAP = {
  '最大起飞重量': 'Max takeoff weight', '起飞重量': 'Takeoff weight',
  '最大载荷': 'Max payload', '最大载重': 'Max payload', '额定载重': 'Rated payload',
  '最大有效载荷': 'Max useful payload', '载荷': 'Payload', '可搭载载荷': 'Compatible payloads',
  '最大水平飞行速度': 'Max horizontal speed', '最大平飞速度': 'Max level speed',
  '最大飞行速度': 'Max flight speed', '巡航速度': 'Cruise speed',
  '最大上升速度': 'Max climb rate', '最大下降速度': 'Max descent rate',
  '实用升限': 'Service ceiling', '最大飞行海拔高度': 'Max operating altitude',
  '最大飞行高度': 'Max flight height', '无地效悬停高度': 'Hover ceiling (OGE)',
  '典型任务半径': 'Typical mission radius', '最大飞行半径': 'Max operating radius',
  '续航时间': 'Endurance', '最大续航': 'Max endurance', '空载续航': 'Endurance (no payload)',
  '滞空时间': 'Endurance on station', '支持飞行时长': 'Flight endurance', '支持飞行高度': 'Operating height',
  '抗风能力': 'Wind resistance', '抗风等级': 'Wind rating', '起降抗风': 'Wind limit (takeoff/landing)',
  '工作温度': 'Operating temperature', '防护等级': 'Ingress protection',
  '定位精度': 'Positioning accuracy', '悬停精度': 'Hover accuracy', 'RTK定位精度': 'RTK accuracy',
  '轴距': 'Wheelbase', '外形尺寸': 'Dimensions', '展开尺寸': 'Dimensions (unfolded)',
  '收纳尺寸': 'Dimensions (folded)', '机体尺寸': 'Airframe dimensions', '机身长度': 'Fuselage length',
  '翼展': 'Wingspan', '重量': 'Weight', '尺寸和重量': 'Controller size & weight',
  '单轴拉力': 'Thrust per axis', '电压范围': 'Voltage range', '工作电压': 'Operating voltage',
  '输入电压': 'Input voltage', '输出电压': 'Output voltage', '输出功率': 'Output power',
  '最大功耗': 'Max power', '照明功率': 'Lighting power', '灯组亮度': 'Lamp output',
  '光通量': 'Luminous flux', '中心照度': 'Centre illuminance', '照明面积': 'Illuminated area',
  '最大照明范围': 'Max illuminated area', '最大照明面积': 'Max illuminated area',
  '系缆长度': 'Tether length', '收放拉力': 'Tether tension', '收放线速度': 'Tether speed',
  '油箱容量': 'Fuel capacity', '部署时间': 'Deployment time', '云台': 'Gimbal range',
  '接口': 'Interfaces', '任务载荷设备': 'Payload device', '适配机型': 'Compatible aircraft'
};
const tLabel = (k) => LABEL_MAP[k] || tSpec(k);
const tSpec = (v) => {
  let s = String(v);
  for (const [zh, en] of PHRASES) s = s.split(zh).join(en);
  return s.replace(/([a-z])(\d)/gi, '$1 $2').replace(/\s+/g, ' ').trim();
};

const CJK = /[\u4e00-\u9fa5]/;

const rows = await runSQL(`
  select pg.slug, pg.product_id, pr.name_en, pr.name, pr.model, pr.category,
         pr.source_url, pr.specifications, pr.supplier_id,
         (select count(*) from public.media_assets m
           where m.product_id = pr.id and m.kind='image' and m.is_public) as images
  from public.product_pages pg join public.products pr on pr.id = pg.product_id
  ${wanted.length ? `where pg.slug in (${wanted.map(sqlQuote).join(',')})` : ''}
  order by pg.slug
`);

function pickSpecs(text) {
  const lines = String(text || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = {};
  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i];
    if (label.length > 26 || !SPEC_LABEL.test(label) || JUNK_LABEL.test(label)) continue;
    if (/[|\\]|无人机|有限公司|新闻|日期/.test(label)) continue;
    const value = lines[i + 1];
    if (!value || value.length > 60 || !/\d/.test(value) || SPEC_LABEL.test(value)) continue;
    if (!(label in out)) out[label] = value;
    if (Object.keys(out).length >= 30) break;
  }
  return out;
}

const summary = [];
let session = '';
for (const r of rows) {
  if (!r.source_url) continue;
  const sess = `enrich-${r.supplier_id}`;
  if (session && session !== sess) await closeSession(session);
  session = sess;

  let data;
  let source = 'webridge';
  try {
    data = await extractPage(r.source_url, sess);
  } catch (e) {
    try {
      data = await scrapeFallback(r.source_url, path.join(rawDir, `${r.product_id}-firecrawl.json`));
      source = 'firecrawl';
    } catch (e2) {
      summary.push({ slug: r.slug, error: String(e.message).slice(0, 80) + ' / ' + String(e2.message).slice(0, 80) });
      continue;
    }
  }
  fs.writeFileSync(path.join(rawDir, `${r.product_id}.json`), JSON.stringify(data), 'utf8');

  const seen = new Set();
  const candidates = (data.imgs || [])
    .filter((i) => !BAD_IMAGE.test(i.src) && ((i.w >= 800 && i.h >= 400) || (!i.w && !i.h)))
    .filter((i) => { if (seen.has(i.src)) return false; seen.add(i.src); return true; })
    .map((i) => ({ ...i, ar: i.h ? +(i.w / i.h).toFixed(2) : null, score: i.w && i.h ? i.w * i.h * (i.w / i.h < 1.05 ? 0.3 : i.w / i.h > 2.6 ? 0.5 : 1) : 500000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 14);

  const roles = ['hero', 'overview', 'feature', 'feature', 'feature', 'feature', 'application', 'application', 'application', 'application'];
  const proposedImages = candidates.map((c, i) => ({
    source_url: c.src,
    width: c.w,
    height: c.h,
    aspect: c.ar,
    role: roles[i] || 'gallery',
    alt: `${r.name_en || r.model} — ${roles[i] === 'hero' ? 'product view' : roles[i] || 'gallery'}`,
    action: 'download_upload',
  }));

  const extracted = pickSpecs(data.text);
  const existing = r.specifications || {};
  const specs = [];
  const seenLabel = new Set();
  for (const [k, v] of Object.entries(existing)) {
    if (JUNK_LABEL.test(k) || /^\d{3,4}-?\d{7,8}$/.test(String(v))) continue;
    const label = tLabel(k);
    if (seenLabel.has(label)) continue;
    seenLabel.add(label);
    const cjk = CJK.test(String(v));
    specs.push({ action: cjk ? 'translate_value' : 'keep', label, from: String(v), to: tSpec(String(v)), group: 'existing' });
  }
  for (const [k, v] of Object.entries(extracted)) {
    const label = tLabel(k);
    if (seenLabel.has(label)) continue;
    seenLabel.add(label);
    specs.push({ action: 'add', label, from: null, to: tSpec(v), group: 'extracted' });
  }

  const videos = (data.videos || []).filter((u) => /\\.(mp4|webm)(\\?|$)/i.test(u)).filter((u) => {
    const model = String(r.model || '').toLowerCase();
    return model && (u.toLowerCase().includes(model) || u.toLowerCase().includes(encodeURIComponent(model)));
  });
  const embeds = (data.embeds || []).filter((u) => /\\.(mp4|webm)/i.test(u) || /(youtube|youtu\\.be|bilibili|vimeo|ixigua|douyin)/i.test(u)).filter((u) => String(r.model || '') && u.toLowerCase().includes(String(r.model).toLowerCase()));

  const cjkFixes = specs.filter((s) => s.action === 'translate_value' && CJK.test(s.to));
  const pkg = {
    generated_at: new Date().toISOString(),
    slug: r.slug,
    product_id: r.product_id,
    name: r.name_en || r.name,
    source_url: r.source_url,
    extracted_with: source,
    current: { images: r.images, specs: Object.keys(existing).length },
    proposed: {
      images: proposedImages,
      new_image_count: Math.max(0, proposedImages.length - r.images),
      specs,
      videos: videos.slice(0, 2),
      embeds: embeds.slice(0, 2),
      payloads: [],
      documents: (data.pdfs || []).slice(0, 3).map((u) => ({ url: u, action: 'review_pdf' })),
    },
    risks: [
      ...(cjkFixes.length ? [`${cjkFixes.length} spec values still contain Chinese after translation`] : []),
      ...(proposedImages.length < 8 ? [`only ${proposedImages.length} usable images found`] : []),
      ...(!videos.length && !embeds.length ? ['no model-matching video found'] : []),
    ],
    note: 'REVIEW ONLY — nothing written to Supabase',
  };
  fs.writeFileSync(path.join(pkgDir, `${r.slug}.json`), JSON.stringify(pkg, null, 2), 'utf8');
  summary.push({
    slug: r.slug,
    images_now: r.images,
    images_new: proposedImages.length,
    specs_new: specs.filter((s) => s.action === 'add').length,
    cjk_fixes: cjkFixes.length,
    videos: videos.length + embeds.length,
    risks: pkg.risks,
  });
  console.log(JSON.stringify(summary[summary.length - 1]));
}
if (session) await closeSession(session);

const lines = ['# Enrichment review package', '', `Generated ${new Date().toISOString()}`, '', '| slug | images now | images proposed | specs added | CJK fixes | videos |', '|---|---|---|---|---|---|'];
for (const s of summary) {
  lines.push(`| ${s.slug} | ${s.images_now ?? '-'} | ${s.images_new ?? '-'} | ${s.specs_new ?? '-'} | ${s.cjk_fixes ?? '-'} | ${s.videos ?? '-'} |`);
}
lines.push('', 'Nothing was written to Supabase. Review `review/packages/*.json` before applying.');
fs.writeFileSync(path.join(repo, 'review', 'SUMMARY.md'), lines.join('\n'), 'utf8');
console.log('summary written');



