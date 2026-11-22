export async function cmd(action, args = {}, session = 'enrich') {
  const r = await fetch('http://127.0.0.1:10086/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${action} failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

export const EXTRACT_JS = `(() => {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const imgs = [];
  for (const im of document.querySelectorAll('img')) {
    const src = im.currentSrc || im.src;
    if (!src) continue;
    imgs.push({ src: abs(src), alt: im.alt || '', w: im.naturalWidth || 0, h: im.naturalHeight || 0 });
  }
  const videos = [];
  for (const v of document.querySelectorAll('video')) { if (v.src) videos.push(abs(v.src)); }
  for (const s of document.querySelectorAll('video source')) { if (s.src) videos.push(abs(s.src)); }
  const embeds = [];
  for (const f of document.querySelectorAll('iframe')) {
    if (/youtube|youtu\\.be|bilibili|vimeo|ixigua|douyin/i.test(f.src)) embeds.push(f.src);
  }
  const tables = [];
  for (const t of document.querySelectorAll('table')) {
    const rows = [];
    for (const tr of t.querySelectorAll('tr')) {
      const cells = [...tr.querySelectorAll('th,td')].map(c => (c.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
      if (cells.length >= 2) rows.push(cells);
    }
    if (rows.length) tables.push(rows.slice(0, 60));
  }
  const dls = [];
  for (const dl of document.querySelectorAll('dl')) {
    const dts = [...dl.querySelectorAll('dt')];
    const dds = [...dl.querySelectorAll('dd')];
    for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
      dls.push([(dts[i].innerText || '').trim(), (dds[i].innerText || '').trim()]);
    }
  }
  const pdfs = [...document.querySelectorAll('a[href$=".pdf"]')].map(a => abs(a.href)).slice(0, 10);
  const links = [...document.querySelectorAll('a[href]')]
    .map(a => ({ href: abs(a.href), text: (a.innerText || '').replace(/\\s+/g, ' ').trim() }))
    .filter(x => /^https?:/.test(x.href))
    .slice(0, 500);
  const h1 = [...document.querySelectorAll('h1')].map(h => (h.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
  const h2 = [...document.querySelectorAll('h2')].map(h => (h.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean).slice(0, 20);
  return JSON.stringify({
    url: location.href,
    title: document.title,
    h1, h2,
    metaDescription: (document.querySelector('meta[name="description"]') || {}).content || '',
    ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || '',
    text: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 20000),
    imgs, videos: [...new Set(videos)], embeds: [...new Set(embeds)],
    tables, dls, pdfs, links
  });
})()`;

export async function extractPage(url, session) {
  await cmd('navigate', { url, newTab: true }, session);
  await new Promise((r) => setTimeout(r, 4000));
  const res = await cmd('evaluate', { code: EXTRACT_JS }, session);
  const raw = res?.data?.value ?? res?.value ?? res;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return data;
}

export async function closeSession(session) {
  try { await cmd('close_session', {}, session); } catch {}
}
