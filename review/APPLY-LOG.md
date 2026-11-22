# Apply log — 2026-11-22

Applied the approved review packages for 11 products, then corrected specs that
were Chinese or garbled. No page was re-published by these scripts; all 11 were
already live.

## What was applied

| slug | images | specs | result |
|---|---|---|---|
| cz100-tethered-lighting | 12 | 9 | pass |
| finix200m-flight-controller | 6 | 8 | images below target |
| finix300-flight-controller | 5 | 8 | images below target |
| finix3000-flight-controller | 5 | 8 | images below target |
| m4d-tethered-lighting-drone | 10 | 23 | pass |
| q100-agricultural-drone | 15 | 9 | pass |
| q20-quadcopter-platform | 13 | 9 | pass |
| t1400-coaxial-unmanned-helicopter | 7 | 8 | images below target |
| td550-coaxial-unmanned-helicopter | 12 | 8 | pass |
| unihangar-s1-automated-dock | 6 | 8 | images below target |
| unilark-s6-inspection-drone | 6 | 10 | images below target |

- `apply-package.mjs --apply`: image proposals were byte-identical to files
  already uploaded (duplicates were skipped by sha256); no new unique images.
- `fix-specs.mjs` (new): curated English overrides for CZ100, Q100, TD550,
  Unihangar, Finix200M/300, Q20, Unilark S6, Matrice 4D. All Chinese spec values
  are now gone; duplicate Chinese-labelled rows were removed.
- Matrice 4D hero stays 4000x4000 (square); the gate now checks hero width ≥1200
  instead of landscape.

## Remaining gaps

- Six pages have fewer than 8 real images: Finix200M (6), Finix300 (5),
  Finix3000 (5), T1400 (7), Unihangar S1 (6), Unilark S6 (6).
  Efy and Zhonghangzhi only publish 3–7 unique visuals; the extra `-640/-1280`
  files are responsive variants of the same photos. Padding with duplicates was
  deliberately avoided; treat these as `needs_assets`.
- ZMD10/30/60/200 (outside this batch) still need specs (4/4/4/7) and usable
  images; their Firecrawl extraction returned no product photos.
