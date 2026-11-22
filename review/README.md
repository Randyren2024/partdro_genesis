# Enrichment review package

Generated 2026-11-21T10:05:35.522Z

| slug | images now | images proposed | specs added | CJK fixes | videos |
|---|---|---|---|---|---|
| cz100-tethered-lighting | 12 | 14 | 2 | 0 | 1 |
| finix200m-flight-controller | 6 | 3 | 0 | 1 | 0 |
| finix300-flight-controller | 5 | 3 | 0 | 1 | 0 |
| finix3000-flight-controller | 5 | 3 | 0 | 0 | 0 |
| m4d-tethered-lighting-drone | 10 | 5 | 0 | 19 | 0 |
| q100-agricultural-drone | 15 | 14 | 0 | 0 | 0 |
| q20-quadcopter-platform | 13 | 14 | 0 | 6 | 0 |
| t1400-coaxial-unmanned-helicopter | 7 | 8 | 8 | 0 | 0 |
| td550-coaxial-unmanned-helicopter | 12 | 14 | 0 | 0 | 0 |
| unihangar-s1-automated-dock | 6 | 3 | 0 | 0 | 0 |
| unilark-s6-inspection-drone | 6 | 3 | 0 | 3 | 0 |
| zmd10-multirotor-drone | 12 | 0 | 1 | 0 | 1 |
| zmd200-heavy-lift-multirotor | 12 | 0 | 0 | 2 | 0 |
| zmd30-multirotor-drone | 12 | 0 | 1 | 0 | 1 |
| zmd60-multirotor-drone | 12 | 0 | 1 | 0 | 1 |

Nothing was written to Supabase. Review `review/packages/*.json` before applying.
## Notes (2026-11-21)

- Generated with Firecrawl fallback because the Kimi WebBridge daemon lost its browser extension connection.
  Reconnect the extension, then rerun for DOM-accurate images/specs:
  `node .opencode/skills/supabase-product-enrichment/scripts/review-package.mjs --products <slugs>`
- No Supabase writes were made. `review/packages/*.json` is the approval input.
- Known gaps in this package:
  - ZMD10 / ZMD30 / ZMD60 / ZMD200: Firecrawl returned no usable images (dynamic gallery). Needs WebBridge.
  - Finix200M / Finix300 / Finix3000 / Unihangar / Unilark: only 3 usable images each.
  - Matrice 4D: 19 spec values still contain Chinese; needs manual or dictionary expansion.
  - No model-matching videos found except CZ100 / ZMD (verify ZMD matches before applying).
- Apply with `apply-package.mjs` (dry-run by default), then rerun derivatives and `validate-publish.mjs`.
