# Scope reduction: print artwork removal

Client-requested scope reduction: the physical print artwork deliverable has
been removed. The project is now digital-only (web page, Apple Wallet pass,
NFC tag).

## What was removed

- `print/` entirely (`README.md`, `card-front.svg`, `card-front.pdf`,
  `card-back.svg`, `card-back.pdf`)
- `src/lib/print.mjs`
- `test/print.test.mjs` (20 tests)
- The print-generation section of `scripts/build.mjs`: the
  `buildCardSVG`/`buildCardPDF` import, the `---- Print ----` block, and the
  now-unused `fileURLToPath` import (its only caller was the print PDF path
  handling; `pathToFileURL`, used elsewhere for `--config`, was kept).
- `pdfkit` from `devDependencies` via `npm uninstall pdfkit`, which also
  refreshed `package-lock.json` (removed pdfkit's dependency subtree; net
  "added 18 packages, removed 77 packages" from lockfile re-resolution).
  `npm uninstall` incidentally reformatted the `engines` field's whitespace
  in `package.json`; that formatting was manually reverted to keep the diff
  to exactly the `pdfkit` line.
- The print test in `test/readme.test.mjs` (`the print README carries the
  printer specifications`).
- All print references in `README.md`: the tagline, the "one thing to know"
  paragraph, the Building section's output list, the byte-reproducibility
  paragraph (which described `print/card-*.pdf` reproducibility — deleted
  outright since it no longer applies to anything), the project-layout table
  row, and the "Other guides" link. Also added a scope note near the top
  pointing at `spec/2026-08-24-ali-hamed-digital-business-card-design.md` so
  a future reader of the (untouched) spec isn't confused by it describing
  print artwork that no longer exists.

### One thing beyond the brief's literal list

The brief's inventory did not mention `test/build.test.mjs`, but it contains
a test, `produces the print artwork`, that asserts `print/card-*.{svg,pdf}`
exist after a build. With the print-generation step removed from
`scripts/build.mjs`, this test would now fail (and, if instead left passing
by accident, would mean print output was leaking back in). I removed it as
a direct, mechanical consequence of the build.mjs change — not a scope
expansion — since leaving it in would violate the requirement that the full
suite pass and that the build not produce `print/`.

This means the final suite is **98 tests**, not the **100** anticipated in
the brief (120 − 20 print.test.mjs − 1 readme.test.mjs print test − 1
build.test.mjs print-artifact test = 98). Flagging this explicitly since it
diverges from the stated expectation.

## Verification

### Build

`npm run build` succeeds, prints no reference to `print/`, and does not
create a `print/` directory. `docs.tmp/` is not left behind afterward (the
atomic staging swap still completes normally, and its `rm(staging, {force})`
cleanup on failure paths is untouched).

### Byte-identical retained artifacts

Hashed `docs/`, `wallet/AliHamed.pass/` (the 6 PNGs; `pass.json` is not
written either before or after this change — Team ID is unset in
`config.json`, unrelated to this change), and `nfc/README.md` before removing
anything and again after the full change set + rebuild. Every hash is
identical.

**Before:**
```
docs/ali-hamed.vcf                    df7222f44ca74f768952897708335760a5d81421802a6f26fe5570a7d7e0ba3c
docs/assets/apple-touch-icon.png      42af3b268b2cc84051693319aed71a032405388b85195cc2b3de44339e7d86a1
docs/assets/og.png                    f97741dd6268c6d8bd23d1d2f5800997552a24c4f9f66892d4efe61cdd82546c
docs/assets/qr.png                    4cc720c6c189694dbf63131930ebb8de5e7fcd91132bc4777dfa6c139cd89c51
docs/assets/qr.svg                    374930576306a18bfdf9392fbc04a4845982c4adf1230bcd446540d1b0f3b1b8
docs/index.html                       6931085679fc2620455305e6decef41b091ef700617f323cd70f2de7a81f5fc4
docs/styles.css                       1bdccac993a8308fca1bbd35871bb74d0ed413ca8c00a478cf4441cbb43849f1
wallet/AliHamed.pass/icon.png         f00a23fa9fcdfb7feca300c6b0db0ba45cbbc53a5dcc72866d536f5f268efcf8
wallet/AliHamed.pass/icon@2x.png      e334386747428e51adbd61affbfb5ba1033897e76626aaa140c87a5a0e864903
wallet/AliHamed.pass/icon@3x.png      c7a1a080df771191222547ea8c56afc431fbbb0a3c069a12766d137c1edac512
wallet/AliHamed.pass/logo.png         02c11c25276b4908388b30fdc6d59219a7c8a4a0e17d68c4fabcd8798725b461
wallet/AliHamed.pass/logo@2x.png      48b125d4351724598069464105df630ae9f5bfac82340cf3638eaea9c7f4ba47
wallet/AliHamed.pass/logo@3x.png      715ce3ecf49bfb434f2766ce4ffd95b0afc5b19a9c34344ee71c6b412ae2027b
nfc/README.md                         747ecf1261cc682cfa20625b108988b03750f62b50a0e5d1b85d6290ed305a73
```

**After:** identical, byte for byte, to every hash listed above.

### Tests

98/98 pass. `test/qr.test.mjs` still exercises `qrModules()` directly
(`qrModules` is kept exported from `src/lib/qr.mjs` exactly as instructed,
even though its only non-test caller — `print.mjs` — is gone).

### Clean-tree check

After `git add -A` and committing this change set, `npm test` was run again
and `git status --short` was empty — the suite leaves no artifacts behind.

### Untouched surfaces

Confirmed via `grep` that no other file in `src/`, `test/`, or `scripts/`
referenced `print/`, `buildCardSVG`, `buildCardPDF`, or `pdfkit` after the
removal. `src/lib/qr.mjs`'s two prose comments containing the word "print"
("print wear and screen glare", "printed card") are generic and unrelated to
the removed deliverable — left untouched. `src/lib/docs.mjs`'s one mention
("to place inside a printed card") is likewise generic NFC prose, untouched.
`CARD_URL` remains exactly `https://idalhamed.github.io/card` (unchanged;
never edited). Web page, QR, Wallet, vCard, NFC, `text-path.mjs`,
`config.mjs`/`config.json`, and `vendor/` were not modified. `spec/` and
`plan/` documents were not modified.

## Files changed

- `README.md` — print references removed/rewritten, scope note added
- `package.json`, `package-lock.json` — `pdfkit` removed
- `scripts/build.mjs` — print import and generation block removed
- `test/readme.test.mjs` — print README test removed
- `test/build.test.mjs` — print artifact test removed
- Deleted: `print/README.md`, `print/card-front.svg`, `print/card-front.pdf`,
  `print/card-back.svg`, `print/card-back.pdf`, `src/lib/print.mjs`,
  `test/print.test.mjs`

## What surprised me

- The brief's "20 tests removed → suite lands at 100" arithmetic only
  accounted for `test/print.test.mjs`. Two more tests were directly coupled
  to the print deliverable (`test/readme.test.mjs`'s print README test,
  which the brief did name separately but didn't fold into the "100" count,
  and `test/build.test.mjs`'s `produces the print artwork` test, which the
  brief didn't mention at all). Final count is 98, not 100. Both extra
  removals were necessary — leaving either in would either fail (asserting
  on now-nonexistent files) or falsely validate nothing.
- `npm uninstall pdfkit` reformatted unrelated whitespace in `package.json`
  (`"engines": { "node": ">=22" }` → multi-line). Reverted manually so the
  package.json diff is exactly the one line the brief called for.
