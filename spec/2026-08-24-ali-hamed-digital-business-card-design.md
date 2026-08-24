# Ali Hamed — Digital Business Card System

**Design specification**
Date: 2026-08-24
Status: Approved for implementation

---

## 1. Goal

A premium, minimal, monochrome-black professional identity system for Ali Hamed,
for use while networking at LEAP Riyadh with founders, CTOs, recruiters, and
technology companies.

A stranger who scans the card must understand who Ali is and how to reach him in
10–30 seconds, on a phone, standing up, in a loud hall.

The system has four surfaces, all resolving to one URL:

1. A mobile-first web page (the destination)
2. An Apple Wallet pass carrying a QR code
3. A printed NFC business card carrying the same QR code
4. An NFC tag inside that card carrying the same URL as an NDEF URI record

## 2. Non-goals

- Not a portfolio. No project list, no work history, no case studies, no blog.
- No analytics, tracking, cookies, or consent banner.
- No backend, database, or pass-update web service.
- No dark/light theme switching. The design is black by intent, not by preference.
- No multi-language support. English only.
- No photograph, avatar, or monogram.

## 3. Approved decisions

| Decision | Value | Rationale |
|---|---|---|
| Destination | `https://idalhamed.github.io/card` | GitHub Pages, repo named `card`, zero cost, HTTPS included |
| Hosting model | Pages "deploy from branch", source `main` `/docs` | No Actions workflow needed |
| Language | English only | LEAP's working language; keeps the page at a 10-second read |
| Portrait | None — purely typographic | Nothing to date or pixelate; maximum restraint |
| Accent colour | None — pure monochrome | A coloured brand glyph would place the card in a category |
| Typeface (digital) | SF Pro via system font stack | Genuine SF Pro on iPhone; no webfont, no download, no licence question |
| Typeface (print) | Inter (SIL OFL), outlined to paths | SF Pro's licence does not cover print artwork |
| Contact layout | Grouped full-width rows | Native-iOS reading; largest tap targets on a phone |
| Save Contact | Included, visually subordinate | Highest-value addition for the actual conference use case |
| Print artwork | Included — front and back | |
| Apple logo | **Not used anywhere** | Implies affiliation and is prohibited by Apple's trademark guidelines for third-party identity material. Apple-ness is conveyed through typography, spacing, and restraint. |
| Add to Wallet button on page | **Prepared but commented out** | Only enabled after the delivery method is verified to open in Wallet on a real device |

## 4. Content (verbatim, single source of truth for copy)

| Key | Value |
|---|---|
| Name | `ALI HAMED` |
| Role | `iOS Developer` |
| Technologies | `Swift · SwiftUI · UIKit` |
| Message | `Building mobile products with a focus on performance & user experience.` |
| Call to action | `Got a product to build? Let's make it happen.` |
| LinkedIn | `https://www.linkedin.com/in/idalhamed/` |
| GitHub | `https://github.com/idAlhamed` |
| WhatsApp | `https://wa.me/966554248646` |
| Phone (vCard) | `+966554248646` |
| Email | `mailto:officialalhamed@gmail.com` |
| Footer | `© 2026 Ali Hamed` |
| CARD_URL | `https://idalhamed.github.io/card` |

Separators between technologies are U+00B7 MIDDLE DOT with a space either side.
Casing of `SwiftUI` and `UIKit` is preserved everywhere; these are never uppercased.

## 5. Visual system

### 5.1 Ground

True `#000000` base with a single wide radial lift:

```css
background:
  radial-gradient(120% 80% at 50% 0%, #16161A 0%, #000000 62%),
  #000000;
```

On an OLED iPhone the page edges are unlit pixels, so the content appears to
float on the glass. This is the entire depth budget. No glassmorphism, no glow,
no blur, no card borders beyond hairlines.

### 5.2 Colour tokens

| Token | Value | Applied to | Contrast on black |
|---|---|---|---|
| `--text-primary` | `#F5F5F7` | Name, CTA, row labels | 19.0 : 1 |
| `--text-secondary` | `#98989D` | Role, body copy, Save Contact | 7.6 : 1 |
| `--text-tertiary` | `#86868B` | Technologies line, footer | 5.8 : 1 |
| `--hairline` | `rgba(255,255,255,0.09)` | Dividers, group edge | — |
| `--surface` | `rgba(255,255,255,0.04)` | Contact group background | — |
| `--surface-pressed` | `rgba(255,255,255,0.08)` | Row press state | — |

`#6E6E73` was rejected for tertiary text: it measures 4.1 : 1 and fails WCAG AA
for small text. `#86868B` is visually equivalent and passes at 5.8 : 1.

All four contact icons render in `--text-primary`. No brand colours.

### 5.3 Type scale

Stack:

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
             "Helvetica Neue", Helvetica, Arial, sans-serif;
```

| Element | Size | Weight | Tracking | Colour |
|---|---|---|---|---|
| Name | `clamp(30px, 8.5vw, 40px)` | 600 | `0.14em` | primary |
| Role | `17px` | 400 | `0` | secondary |
| Technologies | `13px` | 500 | `0.08em` | tertiary |
| Message | `16px` / line-height 1.5, max `34ch` | 400 | `0` | secondary |
| Call to action | `17px` | 500 | `0` | primary |
| Row label | `17px` | 400 | `0` | primary |
| Save Contact | `15px` | 500 | `0` | secondary |
| Footer | `12px` | 400 | `0.02em` | tertiary |

Name tracking is deliberately moderate. Wider tracking reads as a fashion
wordmark; the space *around* the name carries the composition, not the space
inside it.

## 6. Web page

### 6.1 Layout

Single column, `max-width: 420px`, horizontally centred, `min-height: 100dvh`,
`padding: 0 24px` plus `env(safe-area-inset-*)` on all four sides so content
clears the Dynamic Island and the home indicator.

Vertical order:

```
ALI HAMED
iOS Developer
Swift · SwiftUI · UIKit
──────────────────────────────  hairline rule
Building mobile products with a
focus on performance & user experience.

Got a product to build?
Let's make it happen.

┌────────────────────────────┐
│  in    LinkedIn          › │
│  ⌗     GitHub            › │
│  ✆     WhatsApp          › │
│  ✉     Email             › │
└────────────────────────────┘

        ⤓  Save Contact

© 2026 Ali Hamed
```

Tablet and desktop render the identical 420px column centred in the black field.
No wider layout, no additional chrome. The phone experience is the design.

### 6.2 Contact rows

- Row height `56px` (exceeds the 44pt minimum target)
- Group has `--surface` background, `14px` corner radius, `--hairline` inset border
- `1px` `--hairline` dividers between rows, inset to the label's left edge
- Icon `20 × 20`, chevron `13px` in `--hairline`-adjacent grey
- Press state: `--surface-pressed` and `transform: scale(0.99)` over `140ms`
- All four are real `<a>` elements; external links carry `rel="noopener noreferrer"`

Targets:

| Row | href |
|---|---|
| LinkedIn | `https://www.linkedin.com/in/idalhamed/` |
| GitHub | `https://github.com/idAlhamed` |
| WhatsApp | `https://wa.me/966554248646` |
| Email | `mailto:officialalhamed@gmail.com` |

### 6.3 Icons

Inline SVG only — no icon font, no sprite sheet, no network request. All four
normalised to the same solid-fill optical weight and `20 × 20` box so LinkedIn's
dense glyph does not out-shout the envelope. LinkedIn, GitHub, and WhatsApp use
their official simple brand marks; Email uses a neutral envelope glyph. Each
`<svg>` carries `aria-hidden="true"`, with the accessible name on the anchor.

No emoji anywhere.

### 6.4 Save Contact

Renders below the contact group, separated by `32px`, as an outlined pill in
`--text-secondary` with a `1px --hairline` border. Deliberately subordinate to
the four specified rows.

Links to a static `ali-hamed.vcf` (vCard 3.0, chosen over 4.0 for iOS Contacts
compatibility):

```
BEGIN:VCARD
VERSION:3.0
N:Hamed;Ali;;;
FN:Ali Hamed
TITLE:iOS Developer
NOTE:Building mobile products with a focus on performance & user experience.
TEL;TYPE=CELL:+966554248646
EMAIL;TYPE=INTERNET:officialalhamed@gmail.com
URL:https://idalhamed.github.io/card
X-SOCIALPROFILE;TYPE=linkedin:https://www.linkedin.com/in/idalhamed/
X-SOCIALPROFILE;TYPE=github:https://github.com/idAlhamed
END:VCARD
```

The `URL` and both `X-SOCIALPROFILE` values are written by the build from config,
not hand-maintained.

### 6.5 Motion

- Entry: content fades in and rises `8px` over `460ms`,
  `cubic-bezier(0.22, 0.61, 0.36, 1)`, staggered `60ms` across five groups
  (identity, rule, message, contacts, footer)
- Row press: as described in 6.2

That is the complete motion inventory. Under
`@media (prefers-reduced-motion: reduce)` all animations, transitions, and
transforms are removed, and content renders at final position and full opacity.

### 6.6 Document head

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="theme-color" content="#000000">` so Safari's chrome merges into the page
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<title>Ali Hamed — iOS Developer</title>`
- `<meta name="description">` — required for the Lighthouse SEO criterion in §12
- Open Graph and Twitter card tags so the link previews correctly when pasted
  into Slack, WhatsApp, or LinkedIn messages
- `<link rel="canonical">` and `og:url` stamped from `CARD_URL` at build time
- `apple-touch-icon.png` at `180 × 180`: typographic `AH` in `--text-primary`
  on black, generated at build time from outlined Inter paths (see §7.3)

### 6.7 Accessibility

- Every contact anchor has a discernible accessible name
- Visible focus ring: `2px` `--text-primary` outline at `2px` offset
- All text meets WCAG AA on black (verified in 5.2)
- Semantic landmarks; the name is the single `<h1>`
- Fully operable by keyboard on desktop

## 7. Apple Wallet pass

### 7.1 Structure

Style: `generic`, with the thumbnail slot intentionally empty to stay typographic.

When passes are stacked in Wallet only the top strip of each is visible, and that
strip is the `logo.png` slot. The field arrangement follows from that:

| Slot | Content |
|---|---|
| `logo.png` | `ALI HAMED` fine-tracked wordmark — always visible in the stacked view |
| `primaryFields` | `iOS Developer` (largest type on the pass) |
| `secondaryFields` | label `TECHNOLOGIES`, value `Swift · SwiftUI · UIKit` |
| `backFields` | message, call to action, and all four contacts as tappable links |
| `barcodes[0]` | QR, `message` = `CARD_URL` |

Placing the name in the wordmark rather than the primary field avoids printing
`ALI HAMED` twice on a card three inches tall, and gives the role the largest type.

Colours match the web page exactly: `backgroundColor: rgb(0,0,0)`,
`foregroundColor: rgb(245,245,247)`, `labelColor: rgb(134,134,139)`.

Back fields use `attributedValue` with `<a href>` markup, which PassKit renders as
live links — the back of the pass becomes a second working contact sheet.

`webServiceURL` and `authenticationToken` are omitted. Those exist for passes that
update over the air from a server; there is no server and none is needed.

### 7.2 Barcode

```json
"barcodes": [{
  "format": "PKBarcodeFormatQR",
  "message": "https://idalhamed.github.io/card",
  "messageEncoding": "iso-8859-1",
  "altText": "idalhamed.github.io/card"
}]
```

Wallet renders this QR itself from the `message` string. No image file is
involved, so the pass and the page cannot disagree about the destination by
construction.

### 7.3 Required assets

Generated at build time from SVG sources via `sharp`:

| File | Size |
|---|---|
| `icon.png` | 29 × 29 |
| `icon@2x.png` | 58 × 58 |
| `icon@3x.png` | 87 × 87 |
| `logo.png` | ≤ 160 × 50 |
| `logo@2x.png` | ≤ 320 × 100 |
| `logo@3x.png` | ≤ 480 × 150 |

`strip`, `background`, `thumbnail`, and `footer` images are all omitted.

The `ALI HAMED` wordmark in the `logo` assets is rendered from **Inter outlined to
paths**, not from SF Pro. SF Pro is not reliably addressable by name for
rasterisation via fontconfig, and outlining removes any dependency on a font
being installed on the build machine. This matches the print approach in §8 and
keeps the two rendered wordmarks identical. SF Pro remains the typeface for the
live web page, where it is supplied by the operating system rather than rendered
by the build.

### 7.4 Signing — remaining manual steps

The generated bundle is **unsigned and will not open on a device** until these are
completed. No placeholder certificate, signature, or manifest is ever fabricated.

Ali holds a paid Apple Developer account; no Pass Type ID exists yet.

1. Keychain Access → Certificate Assistant → *Request a Certificate From a
   Certificate Authority* → save to disk
2. developer.apple.com → Certificates, IDs & Profiles → Identifiers → **Pass Type IDs**
   → create `pass.com.alihamed.card`
3. Select that identifier → Create Certificate → upload the CSR → download `pass.cer`
4. Double-click `pass.cer` to install it into the login keychain
5. In Keychain, select the certificate **and** its private key → Export 2 items →
   `Certificates.p12`, with a password
6. Copy the 10-character Team ID from developer.apple.com → Membership into `config.json`
7. Download the **Apple WWDR Intermediate Certificate G4** from
   `apple.com/certificateauthority`
8. Place `Certificates.p12` and the WWDR certificate in `wallet/certs/` (gitignored)
9. Run `npm run pass:sign`

`sign-pass.sh` then:

- extracts certificate and key PEMs from the `.p12`
- converts the WWDR certificate from DER to PEM
- writes `manifest.json` as the SHA-1 of every file in the bundle
- produces a detached PKCS#7 `signature` via `openssl smime -binary -sign ... -outform DER`
- zips the bundle **with all files at the archive root** — nesting them inside a
  parent folder is the single most common cause of a pass that silently fails to open
- emits `dist/AliHamed.pkpass`

### 7.5 Delivery

Install by AirDrop or email attachment.

GitHub Pages does not reliably serve `.pkpass` with the required
`application/vnd.apple.pkpass` MIME type, so a hosted link may download an inert
file instead of opening Wallet. Accordingly the "Add to Apple Wallet" anchor is
written into `index.html` but left **commented out**, with an inline note stating
this condition. It is enabled only after the final delivery method has been
observed opening correctly in Wallet on a physical device.

## 8. Print artwork

- Trim `85.6 × 54 mm`; bleed `3 mm` (document `91.6 × 60 mm`); safe margin `4 mm`
  inside trim; crop marks included
- Front: `ALI HAMED` wordmark and the technologies line
- Back: `iOS Developer`, the QR code, and the short URL `idalhamed.github.io/card`
- **Rich black `CMYK 60/50/50/100`**, not single-channel black, which prints thin
  and grey. Matte lamination specified — it accounts for most of the perceived
  quality of a card in the hand.
- **The QR sits in a light rounded panel, never inverted on black.** iOS decodes
  white-on-black reliably; many Android scanners and most hardware readers do not.
- QR minimum `18 mm` square with a 4-module quiet zone, error correction level **Q**
- Typeface Inter (SIL OFL), all text outlined to paths — no font embedding and no
  licensing question at the printer

Outputs: `print/card-front.svg`, `print/card-back.svg`, and PDF equivalents.

## 9. NFC

NTAG213 or better as a PVC card or sticker. NTAG213 holds 144 bytes; the URL is 33
characters, so capacity is not a constraint.

Programming, via **NFC Tools** on iPhone: Write → Add a record → URL/URI → paste
`CARD_URL` → Write. Locking the tag afterwards is optional and irreversible.

iPhone XS and later read NDEF tags in the background with no app open, so a tap
opens the page directly.

`nfc/README.md` is generated with the actual URL already embedded, not a placeholder.

## 10. Project structure and pipeline

```
Ali Business Card/
├── README.md                  overview, local run, deploy
├── config.json                CARD_URL + Team ID + pass identifier
├── package.json
├── .gitignore                 reference images, certs, build artifacts
├── IMG_3890.jpg               reference — untouched, never committed
├── Screenshot ....png         reference — untouched, never committed
├── spec/                      this document
├── src/                       authored source
│   ├── index.html
│   ├── styles.css
│   └── icons/*.svg
├── docs/                      GENERATED — GitHub Pages source (main /docs)
│   │                          (styles.css and icons copied verbatim;
│   │                           index.html stamped with CARD_URL)
│   ├── index.html
│   ├── styles.css
│   ├── ali-hamed.vcf
│   └── assets/  qr.svg, qr.png, apple-touch-icon.png
├── wallet/
│   ├── AliHamed.pass/         generated bundle
│   ├── certs/                 gitignored — user-supplied credentials
│   ├── sign-pass.sh
│   └── README.md              signing and installation
├── print/
│   ├── card-front.svg / .pdf
│   ├── card-back.svg / .pdf
│   └── README.md              printer specifications
├── nfc/
│   └── README.md              tag programming
└── scripts/
    └── build.mjs
```

Authoring in `src/` and building into `docs/` keeps the published site clean while
Pages still serves it at `https://idalhamed.github.io/card`.

### 10.1 Single source of truth

`config.json` holds `CARD_URL` and the Apple identifiers. `npm run build` fans that
one value out to every destination that needs it:

- QR code SVG and PNG (print and reference)
- `pass.json` `barcodes[0].message`
- `ali-hamed.vcf` `URL` field
- `<link rel="canonical">` and `og:url` in the built `index.html`
- the short URL printed on the card back
- the URL quoted in `nfc/README.md`

`CARD_URL` is never written literally in any authored source file.

### 10.2 Dependencies

Build-time `devDependencies` only: `qrcode`, `sharp`, `opentype.js`, `pdfkit`,
`jsqr`.

`jsqr` decodes; `qrcode` only encodes. The round-trip assertion in §11 is
impossible without a decoder, so the choice is five devDependencies or no
round-trip check. The check is worth more than the fifth dependency.

Inter is vendored as a TTF under `vendor/fonts/` alongside its OFL licence,
fetched once via `npm run fetch:font`. The SIL Open Font Licence permits
redistribution. `opentype.js` requires TTF or OTF; it cannot parse WOFF2.

**Zero dependencies reach the browser.** The page ships hand-written HTML and CSS
and nothing else — no framework, no JavaScript library, no webfont.

`npm run dev` serves `docs/` with `python3 -m http.server`, already present on macOS.

## 11. Error handling

The build fails loudly rather than emitting something quietly broken:

- Rejects a `CARD_URL` that is not an absolute `https://` URL
- Rejects a `CARD_URL` still set to a placeholder value
- **Decodes the generated QR image back to a string and asserts equality with
  `CARD_URL`.** A corrupt or drifted QR can therefore never reach a printer.
- Refuses to build `pass.json` while `teamIdentifier` or `passTypeIdentifier`
  are unset
- `sign-pass.sh` checks for `openssl`, the `.p12`, and the WWDR certificate
  independently, and on failure names the exact numbered step from §7.4 that is
  outstanding rather than emitting a malformed `.pkpass`

## 12. Verification

Required before the work is reported complete:

| Check | Criterion |
|---|---|
| QR round-trip | Decoded generated QR string equals `CARD_URL` exactly |
| Lighthouse (mobile) | 100 across Performance, Accessibility, Best Practices, SEO |
| Contrast | All text ≥ 4.5 : 1 on `#000000` (values in §5.2) |
| iPhone Safari | Portrait, landscape, safe areas, Add to Home Screen |
| Reduced motion | No animation or transform with the setting enabled |
| iPad + desktop | Column centred, no horizontal scroll at any width ≥ 320px |
| Contact rows | All four open the correct target on a physical iPhone |
| Save Contact | `.vcf` imports into iOS Contacts with all fields intact |
| Wallet pass | `pass.json` validates; signed pass opens on device (after §7.4) |
| Print | PDF opens at 100% scale; QR measures ≥ 18 mm; bleed and crop marks present |

## 13. Deliverables

1. Responsive digital business card web page
2. QR code generated from `CARD_URL`
3. Apple Wallet pass bundle, assets, and signing script
4. `README.md` — running the page locally
5. `README.md` — deploying to GitHub Pages at `https://idalhamed.github.io/card`
6. `wallet/README.md` — creating, signing, and installing the pass
7. `nfc/README.md` — programming a physical NFC tag with `CARD_URL`
8. `print/README.md` — printer specifications, plus front and back artwork
9. Architecture that accepts future customisation without restructuring

## 14. Outstanding items requiring Ali

These cannot be automated and are documented, not faked:

1. Create the Pass Type ID and certificate (§7.4, steps 1–8)
2. Supply the 10-character Team ID for `config.json`
3. Create the GitHub repository named `card` and enable Pages on `main` `/docs`
4. Verify the signed pass opens in Wallet on a device, then decide whether to
   enable the commented-out Add to Wallet anchor (§7.5)
5. Purchase NFC cards or tags and program them (§9)
