import crypto from 'node:crypto';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

export const sha16 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
export const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'product';
export const stripMd = (t) => clean((t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`]/g, ' '));
export const lit = (v) => (v === null || v === undefined ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");

export const BAD_NAME = /^(产品中心|产品|首页|关于我们|联系我们|新闻|解决方案|服务|技术支持|下载|更多|跳到正文|menu|home|products?|about|contact|news|solutions?|search)$/i;
export const UNIT_ONLY = /^\d+(\.\d+)?\s*(kg|g|mm|cm|m|km|h|min|s|%|w|kw|v|mah|db|mhz|ghz|寸|米|公斤|克|分钟|小时)$/i;
export const SPEC_LIKE = /(最大|最小|起飞重量|有效载荷|载荷|速度|升限|尺寸|重量|航时|续航|功率|电压|容量|直径|翼展|长度|宽度|高度|轴距|性能指标|应用领域|应用场景)/;
export const CTA_TEXT = /(索取|报价|购买|咨询|联系|立即|预约|申请|获取|拆开|了解更多)/;
export const SELF_GENERIC = /^(无人机产品|产品中心|产品|更多|查看更多|了解更多|首页|解决方案|服务|关于我们|新闻|下载|地面设备|跳到正文|跳转|返回顶部|打印|分享|上一篇|下一篇)$/;
export const JUNK_HOST = /(gov\.cn|cninfo\.com\.cn|36kr\.com|taibo\.cn|qcc\.com|tianyancha|sohu\.com|sina\.com|163\.com|people\.com\.cn|xinhuanet|thepaper\.cn|zhihu\.com|baidu\.com|patents\.google|aamshanghai|zhipin\.com|job5156|gys\.cn|maigoo\.com|afzhan\.com|toocle\.com|b2bface|aliyun\.com|cnstock\.com|stcn\.com|cs\.com\.cn|eastmoney|dfcfw\.com|miit\.gov|caac\.gov)/i;
export const BAD_IMAGE = /(logo|icon|sprite|placeholder|qrcode|qr_code|weixin|wechat|avatar|banner|candan|close|search|arrow|line\.png)/i;

export function getHeadings(md) {
  return (md.match(/^#{1,6}\s+(.+)$/gm) || []).map((h) => clean(h.replace(/^#{1,6}\s+/, ''))).filter(Boolean);
}

export function modelFromText(t) {
  const m = (t || '').match(/(?:^|[^A-Za-z0-9])([A-Za-z]{2,6}[-\s]?\d{2,4}[A-Za-z]{0,4})(?=$|[^A-Za-z0-9])/);
  return m ? m[1].replace(/\s+/g, '') : null;
}

export function normPath(u) {
  try { const x = new URL(u); return x.host.replace(/^www\./i, '') + x.pathname.replace(/\/$/, '').toLowerCase(); } catch { return null; }
}

export function isGoodNameText(t) {
  if (!t) return false;
  if (t.length < 2 || t.length > 60) return false;
  if (BAD_NAME.test(t) || UNIT_ONLY.test(t) || SELF_GENERIC.test(t) || CTA_TEXT.test(t)) return false;
  if (/[。！？，,;；]$/.test(t)) return false;
  if (SPEC_LIKE.test(t)) return false;
  if (/\d\s*[x×*]\s*\d/i.test(t)) return false;
  return true;
}

export function selfLinkName(md, pageUrl) {
  const target = normPath(pageUrl);
  if (!target) return null;
  const re = /\[([^\]]{2,60})\]\((https?:[^)\s]+)\)/g;
  const texts = [];
  let m;
  while ((m = re.exec(md))) {
    if (normPath(m[2]) !== target) continue;
    const t = clean(m[1]);
    if (isGoodNameText(t)) texts.push(t);
  }
  if (!texts.length) return null;
  texts.sort((a, b) => (modelFromText(b) ? 1 : 0) - (modelFromText(a) ? 1 : 0) || b.length - a.length);
  const best = texts[0];
  if (!modelFromText(best) && best.length > 24) return null;
  return best;
}

export function pickName(headings, meta, siteNames, md, pageUrl) {
  const self = selfLinkName(md || '', pageUrl);
  if (self) return self;
  const cands = headings.filter((h) => isGoodNameText(h) && /[A-Za-z\u4e00-\u9fa5]/.test(h) && !/(参数|规格|优势|应用场景|关于|联系|新闻|导航)/.test(h));
  const withModel = cands.find((c) => modelFromText(c));
  if (withModel) return withModel;
  for (const c of cands) {
    const low = c.toLowerCase();
    if (siteNames.some((s) => s && (low === s.toLowerCase() || low.includes(s.toLowerCase())))) continue;
    return c;
  }
  const t = clean(meta['og:title'] || meta.title || '');
  const first = clean(t.split(/\s+[—|–]\s+|\s+-\s+/)[0]);
  if (isGoodNameText(first) && !siteNames.some((s) => s && first.toLowerCase() === s.toLowerCase())) return first;
  return null;
}

export function extractSpecs(md) {
  const specs = {};
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test((lines[i + 1] || '').trim())) {
      let j = i + 2;
      while (j < lines.length && /^\|/.test(lines[j].trim())) {
        const cells = lines[j].split('|').map((x) => clean(x)).filter(Boolean);
        if (cells.length >= 2) {
          const k = cells[0];
          const v = cells.slice(1).join(' / ');
          if (k && v && k.length < 30 && v.length < 300 && !/[\[\]()]/.test(k) && Object.keys(specs).length < 40) specs[k] = v;
        }
        j++;
      }
      i = j;
      continue;
    }
    if (line.includes('](') || line.includes('![')) continue;
    const m = line.match(/^[-*]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 \/·\-]{1,19})[：:]\s*(.{1,120})$/);
    if (m && Object.keys(specs).length < 40) {
      const k = clean(m[1]);
      const v = clean(m[2]);
      if (!/^(http|www)/i.test(k) && /\d/.test(v) && !/[\[\]()]/.test(k)) specs[k] = v;
    }
  }
  const SPEC_LABEL = /(重量|载荷|载重|速度|升限|尺寸|半径|航时|续航|功率|电压|容量|高度|长度|宽度|轴距|温度|等级|材质|直径|翼展|抗风|爬升|精度)/;
  for (let i = 0; i < lines.length - 1; i++) {
    const h = (lines[i].trim().match(/^#{1,6}\s+(.+)$/) || [])[1];
    if (!h) continue;
    const label = clean(h);
    if (!SPEC_LABEL.test(label) || Object.keys(specs).length >= 40 || /[|\\]|无人机|有限公司|新闻|日期/.test(label)) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const raw = lines[j] || '';
    const val = stripMd(raw);
    if (val && val.length <= 80 && !/^\d{4}-\d{2}-\d{2}/.test(val) && !/^#/.test(raw.trim()) && !/]\(/.test(raw) && !SPEC_LABEL.test(val)) {
      if (!(label in specs)) specs[label] = val;
    }
  }
  return specs;
}

export function extractFeatures(md) {
  return md.split('\n').map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => stripMd(l.replace(/^[-*]\s+/, '')))
    .filter((l) => l.length > 4 && l.length < 160 && !/(探索更多|更多产品|read more|learn more|首页|登录|注册)/i.test(l))
    .slice(0, 8);
}

export function extractImages(md, pageUrl, meta) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    try {
      const u = new URL(raw, pageUrl).toString();
      if (!/^https?:/i.test(u) || /\.svg($|\?)/i.test(u) || BAD_IMAGE.test(u)) return;
      if (seen.has(u)) return;
      seen.add(u); out.push(u);
    } catch {}
  };
  const og = meta && (meta['og:image'] || meta.ogImage || meta['twitter:image']);
  if (og) add(og);
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(md))) add(m[1]);
  return out;
}

export function extractVideos(md, links, pageUrl) {
  const direct = new Set();
  const embeds = new Set();
  const candidates = [];
  const re = /(https?:\/\/[^\s)"'<>]+)/g;
  let m;
  while ((m = re.exec(md))) candidates.push(m[1]);
  for (const l of links || []) if (typeof l === 'string') candidates.push(l);
  for (const raw of candidates) {
    if (/\.(mp4|webm)(\?|$)/i.test(raw)) { try { direct.add(new URL(raw, pageUrl).toString()); } catch {} }
    else if (/(youtube\.com|youtu\.be|bilibili\.com|vimeo\.com|ixigua\.com|douyin\.com)/i.test(raw)) embeds.add(raw);
  }
  return { direct: [...direct].slice(0, 3), embeds: [...embeds].slice(0, 5) };
}

export function knownModels(profile) {
  const arr = [
    ...(profile.productModels || []), ...(profile.catalogueModels || []),
    ...(profile.knownProductModels || []), ...(profile.catalogueProducts || [])
  ].filter((x) => typeof x === 'string' && x.length >= 2);
  return [...new Set(arr)];
}

export function pickKnownModel(text, models) {
  const t = (text || '').toLowerCase();
  const hits = models.filter((m) => t.includes(m.toLowerCase()));
  return hits.length ? hits.sort((a, b) => b.length - a.length)[0] : null;
}

export function inferType(url, title, md) {
  const u = (url || '').toLowerCase();
  if (/(product|chanpin|goods|item|detail|cp\/)/.test(u)) return 'detail';
  if (/(catalogue|catalog|products|product-list|solution)/.test(u)) return 'catalogue';
  if (/(参数|规格|specification|技术指标)/i.test(md.slice(0, 4000))) return 'detail';
  if (/产品|型号/.test(title)) return 'catalogue';
  return 'page';
}

export function productSlug(supplierId, modelOrName, pageUrl) {
  return `${supplierId}-${slugify(modelOrName)}-${sha16(pageUrl || modelOrName).slice(0, 6)}`;
}

export function analyzePage({ md, meta = {}, links = [], pageUrl = '', models = [], siteNames = [], images = null, videos = null }) {
  const type = inferType(pageUrl, meta.title || '', md);
  const imgs = images || extractImages(md, pageUrl, meta);
  const vids = videos || extractVideos(md, links, pageUrl);
  const headings = getHeadings(md);
  const text = stripMd(md);
  const docs = (links || [])
    .map((l) => (typeof l === 'string' ? l : l && (l.href || l.url)))
    .filter((u) => typeof u === 'string' && /\.pdf($|\?)/i.test(u))
    .slice(0, 5)
    .map((u) => ({ type: 'pdf', url: u }));

  const out = {
    type, imgs, vids, headings, text, docs,
    name: null, model: null, specs: {}, features: [],
    description: '', summary: '', signal: false
  };
  if (type !== 'detail') return out;

  const name = pickName(headings, meta, siteNames, md, pageUrl);
  if (!name) return out;
  const specs = extractSpecs(md);
  const model = pickKnownModel(name, models) || modelFromText(name);
  const signal = model || Object.keys(specs).length >= 3 || /(产品参数|技术参数|规格参数|主要参数|技术指标|specifications?)/i.test(md) || (text.length > 600 && headings.length > 2);
  if (!signal || text.length < 150) return out;

  const paragraphs = md.split(/\n{2,}/)
    .map((x) => stripMd(x))
    .filter((x) => x.length > 50 && !/^\|/.test(x) && !/^(产品中心|首页|关于我们|联系我们|新闻)/.test(x) && !/(探索更多|更多产品|read more|learn more)/i.test(x));
  const description = clean(paragraphs.slice(0, 4).join(' ')).slice(0, 3000);

  return {
    ...out,
    name, model, specs,
    features: extractFeatures(md),
    description,
    summary: clean(meta['og:description'] || meta.ogDescription || '').slice(0, 300) || description.slice(0, 300),
    signal: true
  };
}

export function dedupeProducts(products) {
  const score = (p) => (p.crawl_status === 'ok' ? 100 : 0) + (p.media ? p.media.length : 0) + (p.description ? 10 : 0);
  const byKey = new Map();
  for (const p of products) {
    const key = p.model ? 'm:' + String(p.model).toLowerCase() : 's:' + p.slug;
    const cur = byKey.get(key);
    if (!cur || score(p) > score(cur)) byKey.set(key, p);
  }
  const uniq = [];
  const slugs = new Set();
  for (const p of byKey.values()) {
    let s = p.slug;
    let n = 1;
    while (slugs.has(s)) { s = p.slug + '-' + (++n); }
    slugs.add(s);
    uniq.push({ ...p, slug: s });
  }
  return uniq;
}
