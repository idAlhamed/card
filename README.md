# Ali Hamed — Digital Business Card

A premium black professional identity system: a mobile-first web page, an Apple
Wallet pass, print artwork, and an NFC tag — all resolving to one URL.

**Live:** https://idalhamed.github.io/card

## The one thing to know

`config.json` is the single source of truth. `CARD_URL` lives there and nowhere
else. Change it, run `npm run build`, and the QR code, Wallet pass, vCard,
canonical tags, print artwork, and NFC instructions all follow.

## Setup

    npm install
    npm run fetch:assets    # one time: vendors Inter and the brand icon marks
    npm run build

`fetch:assets` downloads the Inter typeface and the LinkedIn/GitHub/WhatsApp
icon marks into `vendor/`. It only needs to run once — after that, `npm run
build` reuses what's already vendored.

## Running locally

    npm run dev

Then open http://localhost:8080. This serves `docs/`, which is exactly what
GitHub Pages serves.

To see it as it will actually be used, open Safari's Web Inspector, choose
Develop > Enter Responsive Design Mode, and pick an iPhone. Better still, run
`ipconfig getifaddr en0` and open `http://<that-ip>:8080` on your phone.

## Building

    npm run build

The build writes everything: `docs/` (the site), `wallet/AliHamed.pass/`,
`print/card-{front,back}.{svg,pdf}`, and `nfc/README.md`.

The site build is **atomic**. It stages the entire site into `docs.tmp/`
first and only removes the old `docs/` and renames the staged copy into place
once every step has succeeded. If a build fails partway through, the live
`docs/` is left exactly as it was — you never end up with a half-written
site.

If `config.json` is missing a required field or malformed, `npm run build`
prints a plain description of what's wrong and exits with status 1. It does
not throw a stack trace.

Note that `print/card-*.pdf` will show as changed in `git status` after every
build even when nothing visible changed — PDFKit stamps each PDF with the
current timestamp and a fresh document ID on every run. That's expected; it
is not a sign the artwork drifted.

## Deploying

1. Create a GitHub repository named exactly **`card`** under `idAlhamed`.
   The name sets the URL path, so it must match.
2. Push:

       git remote add origin https://github.com/idAlhamed/card.git
       git push -u origin main

3. On GitHub: **Settings > Pages**. Set Source to *Deploy from a branch*,
   branch `main`, folder **`/docs`**. Save.
4. Wait about a minute, then load https://idalhamed.github.io/card

Every later deploy is `npm run build`, commit, push.

### Never commit these

`.gitignore` already covers them, but be aware:

- `IMG_3890.jpg` — a reference image containing a real Adatwq ID number and a
  personal QR code
- `Screenshot*.png` — a reference image, another designer's work
- `wallet/certs/` — your Apple signing credentials

## Project layout

| Path | What it is |
|---|---|
| `config.json` | CARD_URL, Apple identifiers, all copy, all contacts |
| `src/` | Authored page and library modules |
| `docs/` | **Generated.** What GitHub Pages serves. Do not edit by hand. |
| `wallet/` | Pass bundle, signing script, and instructions |
| `print/` | Print-ready front and back artwork |
| `nfc/` | **Generated.** Tag programming instructions. |
| `spec/`, `plan/` | Design specification and implementation plan |

## Changing things later

| To change | Edit | Then |
|---|---|---|
| The URL | `config.json` | `npm run build` |
| Wording | `config.json` **and** `src/index.html` | `npm run test && npm run build` |
| Colours or spacing | `src/styles.css` | `npm run build` |
| Contact links | `config.json` **and** `src/index.html` | `npm run test && npm run build` |

Copy is deliberately duplicated between `config.json` and `src/index.html` so
the page stays readable as a designed document. A test fails if the two ever
disagree, so the duplication cannot drift silently.

## Running the tests

    npm test

This runs `node --test test/**/*.test.mjs`. (Plain `node --test test/` does
not work on this project's Node version — always use `npm test`.)

## Other guides

- `wallet/README.md` — creating, signing, and installing the Wallet pass
- `print/README.md` — printer specifications
- `nfc/README.md` — programming the NFC tag
