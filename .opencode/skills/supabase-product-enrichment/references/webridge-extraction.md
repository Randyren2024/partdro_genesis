# WebBridge extraction

Use `crawl/bridge.mjs`:

```js
import { extractPage, closeSession } from '../../../../crawl/bridge.mjs'
const data = await extractPage(product.source_url, `enrich-${product.supplier_id}`)
await closeSession(`enrich-${product.supplier_id}`)
```

`extractPage` navigates, waits 4 s, then evaluates the DOM script and returns JSON.

## What the script returns

| Key | Contents |
|---|---|
| `title`, `h1[]`, `h2[]` | page and section headings |
| `metaDescription`, `ogImage` | metadata |
| `text` | body innerText (20k chars) |
| `imgs[]` | `{src, alt, w, h}` from `document.images` (natural sizes) |
| `videos[]` | `<video src>` and `<video source src>` |
| `embeds[]` | iframe URLs matching YouTube/Bilibili/Vimeo/ixigua/douyin |
| `tables[]` | table rows as arrays of cell texts |
| `dls[]` | `[dt, dd]` pairs |
| `pdfs[]` | absolute PDF links |

## Lazy-loading sites

If `imgs` looks empty or all `w=0`, the gallery uses lazy attributes. Evaluate an
augmented collector before falling back to Firecrawl:

```js
(() => {
  const urls = new Set();
  for (const el of document.querySelectorAll('img,[data-src],[data-original]')) {
    for (const a of ['currentSrc','src','data-src','data-original']) {
      const v = el[a]; if (typeof v === 'string' && v.startsWith('http')) urls.add(v);
    }
    if (el.srcset) el.srcset.split(',').forEach(s => { const u = s.trim().split(' ')[0]; if (u.startsWith('http')) urls.add(u); });
  }
  for (const el of document.querySelectorAll('*')) {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\("?(https?:[^")]+)"?\)/);
    if (m) urls.add(m[1]);
  }
  return JSON.stringify([...urls]);
})()
```

Exclude `<img>` inside `header`, `nav`, `footer` for hero selection.

## Video selection

Keep a video only when its URL or nearest heading contains the product model
(case-insensitive, e.g. `ZMD200`, `TD550`). Discard site-wide banner videos.

## Failure modes

- `navigate: page load timeout (30s)` → retry once with a longer wait; if it fails again,
  record `blocked` and move on.
- `evaluate: SyntaxError` → the injected code contained literal non-ASCII that the shell
  mangled; use `\uXXXX` escapes for Chinese regex terms.
- Extension disconnected → stop and ask the user to open the browser.
