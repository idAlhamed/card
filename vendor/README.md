# Vendored assets

Committed deliberately so the build is reproducible and works offline.

| Asset | Source | Licence |
|---|---|---|
| `fonts/Inter-*.ttf` | rsms/inter v4.1 | SIL Open Font Licence 1.1 (`fonts/OFL.txt`) |
| `icons/*.svg` | simple-icons 13.0.0 | CC0 1.0 — public domain, no attribution required |

Inter is used only for rasterised and printed assets. The live web page uses
SF Pro from the operating system and downloads no font at all.

Regenerate with `npm run fetch:assets`.
