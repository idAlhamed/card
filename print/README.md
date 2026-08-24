# Print artwork

`card-front.pdf` and `card-back.pdf` are the files to send a printer.
The `.svg` versions are for previewing and for designers who want to edit.

Regenerate with `npm run build`. Each build re-stamps the PDFs with a fresh
creation timestamp and document ID (PDFKit does this automatically), so
`npm run build` will show `print/card-*.pdf` as changed in `git status` even
when the artwork itself did not change. That's expected, not a sign anything
drifted — compare the `.svg` files if you want to confirm the visible content
is identical.

## Specifications

| | |
|---|---|
| Trim size | 85.6 × 54 mm (standard business card) |
| Document size | 91.6 × 60 mm (3 mm bleed on every edge) |
| Safe margin | 4 mm inside trim |
| Crop marks | Included, inside the bleed |
| Black | Rich black, CMYK 60 / 50 / 50 / 100 |
| Typeface | Inter, outlined to paths — no font embedding needed |
| QR size | 20 mm, error correction Q, 4-module quiet zone |
| Finish | **Matte lamination** |

## Three things to tell the printer

**Use the rich black as supplied.** Single-channel black (`K100`) prints thin
and grey next to a photo-rich sheet. The four-channel mix — CMYK
60 / 50 / 50 / 100 — is already in the PDF; ask them not to "optimise" it.

**Matte lamination, not gloss.** This is most of what makes a card feel
expensive in the hand, and it stops fingerprints showing on a dark card.

**Do not resize or recolour the QR panel.** The QR is deliberately dark-on-light
in a white panel and must stay that way — do not invert it. An inverted QR —
white modules on black — is decoded by the iPhone camera but rejected by many
Android scanners and most hardware readers. At 20 mm it scans reliably; below
18 mm it starts to fail, so never resize it smaller than that.

## Printing onto NFC cards

If you are printing directly onto blank NFC PVC cards, the printer is usually
a direct-to-card or retransfer unit rather than an offset press. Ask for:

- a **retransfer** printer if available — it prints edge to edge, which a
  full-bleed dark card needs
- a test card before the full run, to check the black

Alternatively, print normal cards and apply an NFC sticker to the back. See
`nfc/README.md`.

## Proofing before you order

Open the PDF in Preview at 100% and hold a real business card against the
screen — they should match. Then scan the QR from the screen with your phone.
If it resolves to `idalhamed.github.io/card`, the file is correct.
