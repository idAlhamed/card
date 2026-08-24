# Apple Wallet pass redesign — report

## Status
Complete. Full suite green (100/100, up from 99 — the old combined
primary-field test was split into three focused assertions). `docs/` and
`nfc/README.md` are byte-identical to `HEAD`. No `pass.json`, no
certificate, no signature, no `print/`. `config.json` untouched. Not
pushed, not merged.

## What changed and why

**The constraint:** at 0.08em tracking "ALI HAMED" already fills the full
160pt width of the logo slot, rendering only ~18.8pt tall. It cannot grow
larger while also sharing that slot with an Apple mark and "Business Card"
label — the two requests conflict inside one 160×50pt box.

**Resolution implemented, exactly as specified:**

- `logo.png`/`@2x`/`@3x` (`src/lib/pass.mjs`, `renderLogo`) is now the pass
  **title**: a small U+F8FF Apple mark + "BUSINESS CARD", both in
  `#86868B` (= `rgb(134, 134, 139)`, the pass's own `labelColor`), left-
  aligned, vertically centred, matched cap height ~11pt of the 50pt slot
  (client's 10–12pt guidance). It no longer depends on `config.content.name`
  at all.
- `ALI HAMED` moved into `pass.json`'s `primaryFields[0]` (key `name`,
  empty label), where Wallet renders it at primary-field size instead of
  the ~19pt the logo slot capped it at. Tracking is unchanged — still
  0.08em — so request 2 (larger, same restrained tracking) is satisfied by
  giving the name a bigger box, not a bigger relative letterspacing.
- `iOS Developer` moved to `secondaryFields[0]`, label `ROLE`.
- `Swift · SwiftUI · UIKit` moved to `auxiliaryFields[0]`, label
  `TECHNOLOGIES` (unchanged label, unchanged casing).
- `backFields` (all seven), colours, barcode, and `webServiceURL` omission:
  untouched.

## Rendering the Apple mark

U+F8FF is a Private Use Area code point with no meaning outside Apple's own
fonts; Inter (the only font vendored in this repo) doesn't contain it
(glyph index 0). Per the constraint given for this task, the mark is
rendered by asking `sharp`/librsvg to lay out an SVG `<text>` element with
`font-family="Apple Symbols"` — the real macOS system font that ships the
glyph — rather than hand-drawing an apple shape (which would redraw Apple's
trademark) or vendoring an Apple-supplied image into the repo (which would
redistribute it). `BUSINESS CARD` is still outlined Inter via the existing
`wordmarkSVG()` path, unchanged font-handling approach.

**Worth flagging, not fixed:** the original design spec
(`spec/2026-08-24-ali-hamed-digital-business-card-design.md`, §3) states
"Apple logo — Not used anywhere — ... prohibited by Apple's trademark
guidelines for third-party identity material." This task's brief
explicitly supersedes that with a client-requested change, and I
implemented it exactly as directed, using the trademark-safe rendering
path the brief specified. I did not edit the spec document — out of this
task's stated scope — but the contradiction between the two is worth the
client/orchestrator's attention.

**Fail-loud guard:** `renderAppleMark()` first renders the glyph at a fixed
probe size and measures opaque-pixel coverage. A real rendered mark covers
a large fraction of the probe canvas (~14% measured); a missing-glyph
fallback (empty output or a notdef box) covers close to none. Below a 3%
threshold, it throws a plain `Error` naming the exact cause ("Apple
Symbols" likely unavailable) rather than silently baking a blank/broken
logo into the pass. This is deliberately an uncaught throw in
`scripts/build.mjs` — not wrapped in the `PassError` "notice" path used for
the missing-Team-ID case — because a missing system font on the build
machine is not a gracefully-skippable condition the way an absent Team ID
is.

One real bug this caught during implementation: typing/pasting the literal
U+F8FF character directly into a shell command was unreliable in this
environment — it silently became an empty string in one run and rendered
correctly in another, with no error either way. The production code avoids
this entirely by writing the glyph as a JS escape, `'\uF8FF'`, never a
literal character in source.

## Byte-reproducibility finding

There is no existing test that asserts wallet pass image bytes are stable
across rebuilds specifically (`test/build.test.mjs`'s reproducibility test
covers `docs/index.html` and `docs/assets/og.png` only). I ran `npm run
build` twice in a row on this machine and hashed the wallet assets both
times:

```
8d71dcb...  logo.png       (identical both runs)
492acb8...  logo@2x.png    (identical both runs)
4609f2f...  logo@3x.png    (identical both runs)
f00a23f...  icon.png       (identical both runs, unchanged by this work)
```

Byte-identical on this Mac, as expected — the font and renderer don't
change between two runs of the same process. The real tradeoff, as called
out in the code comment above `renderAppleMark`, is **cross-machine**: a
machine without "Apple Symbols" (non-Apple platform, or an unusual/headless
macOS install) will not silently produce a different-but-plausible
`logo.png` — it will fail the build loudly with a clear message, per the
brief's requirement. I did not add a new automated byte-reproducibility
test for the wallet assets, since none existed before and the task's
verification checklist asked me to check the *existing* one, not add a new
one.

## Tests updated (`test/pass.test.mjs`)

- `'the primary field is the role, not the name'` → split into three:
  `'the primary field is the name, rendered at primary-field size'`,
  `'the role is a secondary field, labelled ROLE'`, `'technologies appear
  as an auxiliary field with preserved casing'`. All read expected values
  from the config fixture (`c.content.name` / `.role` / `.technologies`),
  not hardcoded literals.
- `'renderPassAssets reads the wordmark from config.content.name, not a
  hardcoded value'` → retargeted at `icon.png` (the AH monogram), since
  `logo.png` no longer varies with the name at all. Also added an explicit
  assertion that `logo.png` stays byte-identical across two different
  names, documenting the new invariant.
- `'no Apple mark or reference anywhere in the pass'` (asserts no `/apple/i`
  in the serialised `pass.json`) — **left untouched, and it still passes**.
  The Apple mark is a rendered PNG asset, never text in `pass.json`, so
  this guard remains valid and correctly still holds.

## Preview

`scripts/make-preview.mjs` updated to match the new field arrangement:
name rendered at primary-field size (fontSize 80, 0.08em tracking,
matching the production wordmark), ROLE/TECHNOLOGIES rendered side by side
below it as label+value pairs (mirroring how Wallet lays out
secondary/auxiliary fields), and the top strip now shows the real
generated `logo@2x.png` (Apple mark + BUSINESS CARD). Regenerated via
`npm run preview:pass`; ran twice, sha256 identical both times
(`84d89ec5e6f83a8ed06a521b2e505c5579fa056674bd0bdd6cf9923c0299242c`).

## Verification

- `npm test`: **100/100 passing**, 0 failures.
- `npm run build`: succeeds; six wallet image assets regenerate; no
  `pass.json` written (`Team ID` still empty, reported under
  "Outstanding:"); no `print/` directory produced.
- `docs/` (all 7 tracked files) and `nfc/README.md`: hashed against `HEAD`
  after a full build + test run — **byte-identical**, zero diffs.
- `git status --short` after the full test run: only the intended files
  show as modified (`src/lib/pass.mjs`, `test/pass.test.mjs`,
  `scripts/make-preview.mjs`, `wallet/AliHamed.pass/logo{,@2x,@3x}.png`,
  `preview/apple-wallet-pass.png`).
- `config.json`, `package.json`, `src/index.html`, `src/styles.css`,
  `src/icons/`, `src/lib/site.mjs`: confirmed untouched (`git diff` empty).
- No dependencies added (`package.json`/no lockfile diff).
- Not pushed, not merged.

---

# Follow-up: primary-field type size reduction (2026-08-24)

Base commit for this change: `86de3a4`.

## Status
Complete. Mockup-only change to `scripts/make-preview.mjs`; `preview/apple-wallet-pass.png`
is the only regenerated output.

## What changed and why

Client feedback: `ALI HAMED` (`primaryFields[0]`) rendered too large in the
preview mockup, overwhelming the "BUSINESS CARD" header and the rest of the
pass.

- `primaryFontSize` reduced from `80` to `66` (17.5% reduction, within the
  requested 15-20% range). Letter-spacing (`primaryFontSize * 0.08`) scales
  down with it automatically, unchanged relative tracking.
- The gap between the primary field and the ROLE/TECHNOLOGIES row (`fieldsY`
  offset) widened from `48` to `58` to offset the primary field's shorter
  glyph height at the new size, so that row lands within ~0.2px of its
  original absolute position on the card — keeping the composition even
  rather than letting extra dead space open up above the QR panel (which is
  anchored to the bottom of the card and unaffected by this change).
- Nothing else in the file changed. `src/lib/pass.mjs` (the real
  `pass.json` field arrangement), `config.json`, `src/index.html`,
  `src/styles.css`, `src/icons/`, `src/lib/site.mjs`, `docs/`, and the six
  `wallet/AliHamed.pass/*.png` assets were not touched.

Measured glyph heights (via `wordmarkSVG`) confirm the primary field is
still clearly dominant after the reduction: 48.02px tall at fontSize 66 vs.
22.93px for the ROLE value (fontSize 24) and 15.49px for the TECHNOLOGIES
value (fontSize 20) — roughly 2x the next-largest field, same as before
proportionally, just no longer visually overwhelming the header.

**Note on real-device behavior:** as called out in the task brief, on an
actual iOS device PassKit — not this script — controls the rendered size of
a primary field; nothing in `src/lib/pass.mjs` or `pass.json` specifies a
font size for `primaryFields`. This mockup's `primaryFontSize` constant is
purely an approximation for visual review and has no bearing on the real
pass's appearance. Nothing in the codebase implies otherwise.

## Verification

- `npm run preview:pass` run twice in a row: `preview/apple-wallet-pass.png`
  byte-identical both times, sha256
  `d0bf539a561de1640f2f0a5d526bd3cfdaf94df1fb27229756209fbe729fc269` (752×992,
  30199 bytes; previously 31063 bytes at the larger size).
- QR code inside the regenerated PNG decoded via `jsqr`: payload is exactly
  `https://idalhamed.github.io/card`.
- `wallet/AliHamed.pass/*.png` (all six files), every file under `docs/`,
  and `nfc/README.md`: hashed (sha256) before and after — all byte-identical,
  zero diffs.
- `npm test`: **100/100 passing**, 0 failures.
- `git status --short` after the full test run: only `scripts/make-preview.mjs`
  and `preview/apple-wallet-pass.png` show as modified — nothing else.
- No dependencies added. Not pushed, not merged.
