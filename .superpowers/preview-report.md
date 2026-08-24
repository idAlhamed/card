# Apple Wallet pass preview — report

## Status
Complete. All three tasks done; full test suite green; retained artifacts
unchanged.

## What was added
- `scripts/make-preview.mjs` — deterministic, committed generator script.
  Loads the real `config.json` via `loadConfig()`, clones it in memory, and
  stamps an obviously-fake `teamIdentifier` (`XXXXXXXXXX`) onto the *clone
  only* so `buildPassJSON()` (from `src/lib/pass.mjs`) will return real
  field values without throwing. Nothing fake is written to disk outside
  `preview/`: `config.json` is untouched, and no `pass.json`, certificate,
  or signature is created.
  - Renders a 320x440pt (640x880px @2x) rounded-rectangle card on a neutral
    `#D9D9DE` backdrop (752x992px canvas total, so the card edges are
    visible).
  - Background/foreground/label colours are read from the generated
    `pass.json` object (`pass.backgroundColor` etc.), not hardcoded.
  - Top strip uses the real `wallet/AliHamed.pass/logo@2x.png` (falls back
    to a downscaled `@3x` if `@2x` is ever missing).
  - Primary field ("iOS Developer") and the secondary label/value
    ("TECHNOLOGIES" / "Swift · SwiftUI · UIKit") are set via
    `buildPassJSON()`'s output and rendered with `wordmarkSVG()` from
    `src/lib/text-path.mjs` (outlined Inter, no system-font dependency).
  - Barcode: a QR generated via `generateQRPNG()` (`src/lib/qr.mjs`) from
    `pass.barcodes[0].message`, in a white rounded panel.
- `package.json` — added `"preview:pass": "node scripts/make-preview.mjs"`.
- `preview/apple-wallet-pass.png` — the rendered mockup, 752x992px, 30,669
  bytes.
- `preview/README.md` — states plainly this is a design mockup rendered
  from real pass fields/assets, not a signed pass; explains `pass.json`
  won't exist until a Team ID is added; gives the regenerate command.
- `test/build.test.mjs` — one new test, `'the built page renders four
  inline icons and no unresolved tokens'`, asserting against the BUILT
  `docs/index.html`: exactly 4 `<svg class="icon"` occurrences, 0 `{{`
  occurrences, no `&lt;svg`/`&lt;path` escaping, and each of the four
  contact hrefs (LinkedIn, GitHub, `wa.me`, `mailto:`) present exactly
  once, read from `config.json` rather than hardcoded.

## Verification
- Full suite: **99/99 passing** (was 98; +1 new test), 0 failures.
- `npm run build` succeeds standalone; output confirms `pass.json was NOT
  written` (Team ID still empty, as required) and no `print/` directory is
  produced.
- Retained artifacts hashed before and after the full test run (which
  itself rebuilds `docs/`, `wallet/AliHamed.pass/`, `nfc/README.md` via
  `build.test.mjs`) — **byte-identical**:
  - `docs/` — all 7 files: sha256 diff empty (identical).
  - `wallet/AliHamed.pass/` — all 6 image files: sha256 diff empty
    (identical); `pass.json` still absent both before and after.
  - `nfc/README.md` — sha256
    `747ecf1261cc682cfa20625b108988b03750f62b50a0e5d1b85d6290ed305a73`
    before and after (identical).
- `git status --short` is empty after `git add` + commit of only the
  intended new/changed files (`package.json`, `test/build.test.mjs`,
  `scripts/make-preview.mjs`, `preview/`).
- `git ls-files` checked for `IMG_3890.jpg`, `Screenshot*`, `.p12`, `.pem`,
  `.cer`, `certs/` — no matches.
- Determinism: `preview/apple-wallet-pass.png` regenerated via
  `npm run preview:pass` twice; sha256 identical both runs
  (`559921e1d72a8f42803372ad5ba55f93b0de8f6c5867926626a5ed34eb810043`).

## Not touched
`src/index.html`, `src/styles.css`, `src/icons/`, `src/lib/site.mjs`,
`config.json`, print artwork (still absent). No `pass.json`, certificate,
or signature created. No push, no merge.
