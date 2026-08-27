// Renders preview/apple-wallet-pass.png: a design mockup of the Apple
// Wallet pass, built from the REAL pass field values (via buildPassJSON())
// and the REAL generated pass images (wallet/AliHamed.pass/strip@2x.png,
// logo@2x.png). This depicts the storeCard layout PassKit actually renders
// — header (logo top-left), then strip.png edge-to-edge, then
// primaryFields overlaid on the strip, then secondaryFields and
// auxiliaryFields as left-aligned rows below it, then the QR barcode —
// rather than an idealised marketing mockup: no card-shaped notch, no
// centred text, nothing PassKit itself wouldn't actually draw. See
// src/lib/pass.mjs's buildPassJSON and renderStripAssets doc-comments for
// why each field lives where it does.
//
// wallet/AliHamed.pass/pass.json does not exist yet — config.json's
// apple.teamIdentifier is empty because the client has not created a Pass
// Type ID (see wallet/README.md). buildPassJSON() refuses to run without a
// real 10-character Team ID, so this script clones the loaded config
// in-memory and stamps an obviously-fake placeholder onto the clone purely
// to obtain field values for rendering. That placeholder is never written
// to config.json, and nothing here writes pass.json, a certificate, or a
// signature. Everything this script produces lives under preview/.
//
// Deterministic: no timestamps, no randomness, no network access. Running
// it twice on an unchanged tree produces byte-identical output.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadConfig } from '../src/lib/config.mjs';
import { buildPassJSON } from '../src/lib/pass.mjs';
import { generateQRPNG } from '../src/lib/qr.mjs';
import { wordmarkSVG } from '../src/lib/text-path.mjs';

const root = new URL('../', import.meta.url);
const at = (p) => new URL(p, root);

// Card geometry in PassKit points, doubled for @2x — same convention the
// pass image assets themselves use (logo@2x.png, strip@2x.png). CARD_W is
// pinned to strip@2x.png's own native width (750) so the strip composites
// at 1:1 with zero scaling.
const CARD_W = 750;
const RADIUS = 28;      // rounded-rectangle corner radius, px at 2x
const PAD = 44;          // inner content padding for header/fields/QR (the strip itself bleeds edge to edge, like a real storeCard strip)
const MARGIN = 56;      // backdrop margin so the card's edges read clearly
const BACKDROP = '#D9D9DE'; // neutral, distinct from the pass's own black

/** Wraps a wordmarkSVG() result so it can be placed at (x, y) inside a parent SVG. */
function place(svgString, x, y) {
  const inner = svgString.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const [, w, h] = svgString.match(/width="([\d.]+)" height="([\d.]+)"/);
  return { markup: `<g transform="translate(${x} ${y})">${inner}</g>`, width: Number(w), height: Number(h) };
}

async function loadPassImage(name, fallbackName, fallbackResize) {
  try {
    return await readFile(at(`wallet/AliHamed.pass/${name}`));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const fallback = await readFile(at(`wallet/AliHamed.pass/${fallbackName}`));
    return sharp(fallback).resize(...fallbackResize).png().toBuffer();
  }
}

async function main() {
  const realConfig = await loadConfig();

  // In-memory only: an obviously-fake placeholder, purely to satisfy
  // buildPassJSON()'s validation so it returns real field values. Never
  // written to config.json or anywhere outside this process's memory.
  const previewConfig = structuredClone(realConfig);
  previewConfig.apple.teamIdentifier = 'XXXXXXXXXX';

  const pass = buildPassJSON(previewConfig);
  const primary = pass.storeCard.primaryFields[0];      // name, overlaid on the strip
  const role = pass.storeCard.secondaryFields[0];        // { label: roleSecondary, value: role }
  const tagline = pass.storeCard.auxiliaryFields[0];     // taglineWallet

  // Prefer the real @2x assets (already sized for this canvas's 2x scale);
  // fall back to downscaling the @3x asset if @2x is ever missing.
  const [logoBuffer, stripBuffer] = await Promise.all([
    loadPassImage('logo@2x.png', 'logo@3x.png', [320, 100, { fit: 'inside' }]),
    loadPassImage('strip@2x.png', 'strip@3x.png', [750, 246, { fit: 'inside' }]),
  ]);

  const logoMeta = await sharp(logoBuffer).metadata();
  const logoHeight = 44;
  const logoWidth = Math.round((logoMeta.width / logoMeta.height) * logoHeight);
  const logoDataUri = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  const stripMeta = await sharp(stripBuffer).metadata();
  const stripDataUri = `data:image/png;base64,${stripBuffer.toString('base64')}`;
  const stripTop = PAD + logoHeight + 16;
  const stripBottom = stripTop + stripMeta.height;

  // primaryFields (name): overlaid on the strip's bottom-left, inside the
  // solid-black band renderStripAssets() reserves there (see its
  // doc-comment) — this mockup positions it the same way real Wallet does
  // for a storeCard's primary field.
  const primaryFontSize = 40;
  const primarySVG = await wordmarkSVG(primary.value, {
    fontSize: primaryFontSize, letterSpacing: primaryFontSize * 0.08, fill: pass.foregroundColor,
  });
  const primaryPlaced0 = place(primarySVG, 0, 0); // measure first
  const primaryY = stripBottom - primaryPlaced0.height - 18;
  const primaryPlaced = place(primarySVG, PAD, primaryY);

  // Wallet renders every field as LABEL (small, labelColor) above VALUE
  // (larger, foregroundColor). Render both fields that way, and skip a label
  // when it is empty — SOFTWARE ENGINEER deliberately carries no label so it
  // renders at value weight.
  const labelOpts = { weight: 'regular', fontSize: 16, letterSpacing: 16 * 0.12, fill: pass.labelColor };

  const fieldMarkup = [];
  let y = stripBottom + 34;

  // secondaryFields row: SOFTWARE ENGINEER (value only, no label).
  if (role.label) {
    const p0 = place(await wordmarkSVG(role.label, labelOpts), PAD, y);
    fieldMarkup.push(p0.markup);
    y += p0.height + 10;
  }
  const roleValuePlaced = place(
    await wordmarkSVG(role.value, { weight: 'regular', fontSize: 26, fill: pass.foregroundColor }),
    PAD, y);
  fieldMarkup.push(roleValuePlaced.markup);
  y += roleValuePlaced.height + 30;

  // auxiliaryFields row: iOS DEVELOPER rides as the label above the tagline,
  // which is what preserves the reference's four-line vertical order.
  if (tagline.label) {
    const p1 = place(await wordmarkSVG(tagline.label, labelOpts), PAD, y);
    fieldMarkup.push(p1.markup);
    y += p1.height + 10;
  }
  const taglinePlaced = place(
    await wordmarkSVG(tagline.value, { weight: 'regular', fontSize: 20, fill: pass.foregroundColor }),
    PAD, y);
  fieldMarkup.push(taglinePlaced.markup);
  const taglineY = y;

  // Barcode: a QR generated from the pass's own barcode message (mirroring
  // how Wallet renders the barcode itself), sat in a white rounded panel
  // near the bottom of the card.
  const qrSize = 240;
  const qrBuffer = await generateQRPNG(pass.barcodes[0].message, { width: qrSize });
  const qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;
  const panelPad = 22;
  const panelSize = qrSize + panelPad * 2;
  const panelX = (CARD_W - panelSize) / 2;
  const panelY = taglineY + taglinePlaced.height + 40;

  const CARD_H = Math.ceil(panelY + panelSize + PAD);
  const CANVAS_W = CARD_W + MARGIN * 2;
  const CANVAS_H = CARD_H + MARGIN * 2;

  const cardSVG = `
    <g transform="translate(${MARGIN} ${MARGIN})">
      <clipPath id="cardClip"><rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}" /></clipPath>
      <rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}"
            fill="${pass.backgroundColor}" />
      <g clip-path="url(#cardClip)">
        <image x="${PAD}" y="${PAD}" width="${logoWidth}" height="${logoHeight}"
               href="${logoDataUri}" />
        <image x="0" y="${stripTop}" width="${stripMeta.width}" height="${stripMeta.height}"
               href="${stripDataUri}" />
        ${primaryPlaced.markup}
      </g>
      ${fieldMarkup.join('\n      ')}
      <rect x="${panelX}" y="${panelY}" width="${panelSize}" height="${panelSize}"
            rx="16" ry="16" fill="#FFFFFF" />
      <image x="${panelX + panelPad}" y="${panelY + panelPad}" width="${qrSize}" height="${qrSize}"
             href="${qrDataUri}" />
    </g>
  `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}"
      viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
    <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${BACKDROP}" />
    ${cardSVG}
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  await mkdir(at('preview/'), { recursive: true });
  await writeFile(at('preview/apple-wallet-pass.png'), png);
  console.log(`preview/apple-wallet-pass.png  (${CANVAS_W}x${CANVAS_H}, ${png.length} bytes)`);
}

main();
