# Apple Wallet pass preview

`apple-wallet-pass.png` is a **design mockup**, not a signed pass. It shows
how the pass will look using the real field values (rendered through
`buildPassJSON()` in `src/lib/pass.mjs`) and the real generated images
(`wallet/AliHamed.pass/logo@2x.png`, plus a QR code generated from the
pass's own barcode message via `src/lib/qr.mjs`).

`wallet/AliHamed.pass/pass.json` does not exist yet: `config.json`'s
`apple.teamIdentifier` is empty because the client hasn't created a Pass
Type ID (see `wallet/README.md`). `buildPassJSON()` refuses to run without a
real 10-character Team ID, so the generator script clones the loaded config
**in memory only** and stamps an obviously-fake placeholder
(`XXXXXXXXXX`) onto that clone purely to obtain field values for rendering.
Nothing is written to `config.json`, and no certificate, signature, or
`pass.json` is produced. `pass.json` will only be generated for real once a
Team ID is added to `config.json`.

## Regenerating

```
npm run preview:pass
```

This runs `scripts/make-preview.mjs`, which is deterministic — no
timestamps or randomness — so re-running it on an unchanged tree reproduces
the same PNG byte-for-byte.
