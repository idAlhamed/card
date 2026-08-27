// Renders preview/apple-wallet-pass.png: a design mockup of the Apple
// Wallet pass, built from the REAL pass field values (via buildPassJSON())
// and the REAL generated pass images (wallet/AliHamed.pass/strip@2x.png).
// This depicts the storeCard layout PassKit actually renders — strip.png
// full-bleed at the very top of the pass (this pass has no logo.png and no
// headerFields, so nothing insets it), then the one remaining native field
// (the tagline, centred via textAlignment) below it, then the QR barcode —
// rather than an idealised marketing mockup: no card-shaped notch, nothing
// PassKit itself wouldn't actually draw. The AH logo, ALI HAMED, SOFTWARE
// ENGINEER (blue) and iOS DEVELOPER are NOT drawn separately here — they
// are baked into strip.png itself (see src/lib/pass.mjs's renderStripMaster
// doc-comment for why), so this script only needs to place that one image.
// See src/lib/pass.mjs's buildPassJSON doc-comment for why each remaining
// field lives where it does.
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
// pass image assets themselves use (strip@2x.png). CARD_W is pinned to
// strip@2x.png's own native width (750) so the strip composites at 1:1
// with zero scaling.
const CARD_W = 750;
const RADIUS = 28;      // rounded-rectangle corner radius, px at 2x
const PAD = 44;          // padding below the QR panel, and around the tagline/QR column (the strip itself bleeds edge to edge, like a real storeCard strip)
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
  const tagline = pass.storeCard.auxiliaryFields[0]; // the one remaining field

  // Prefer the real @2x assets (already sized for this canvas's 2x scale);
  // fall back to downscaling the @3x asset if @2x is ever missing.
  const stripBuffer = await loadPassImage(
    'strip@2x.png', 'strip@3x.png', [750, 246, { fit: 'inside' }]);

  const stripMeta = await sharp(stripBuffer).metadata();
  const stripDataUri = `data:image/png;base64,${stripBuffer.toString('base64')}`;
  // Full-bleed, flush against the very top of the pass: a real storeCard
  // with no logo.png and no headerFields — which is exactly what this pass
  // is, see src/lib/pass.mjs — renders its strip with nothing above or
  // insetting it. An earlier revision of this preview inset the strip by
  // PAD, floating it below a gap PassKit itself would never draw; stripTop
  // is 0 here so the mockup matches what actually installs.
  const stripTop = 0;
  const stripBottom = stripTop + stripMeta.height;

  // The tagline is the one field left on the front of the pass — the name
  // and both role lines are baked into strip.png instead (see
  // buildPassJSON's doc-comment). `textAlignment: PKTextAlignmentCenter` is
  // a real, native PassKit key, so it is centred here to match, rather than
  // left-aligned the way the old field column was.
  const taglineFontSize = 20;
  const taglineSVG = await wordmarkSVG(tagline.value, {
    weight: 'regular', fontSize: taglineFontSize, fill: pass.foregroundColor,
  });
  const taglineMeasured = place(taglineSVG, 0, 0); // measure first
  const taglineY = stripBottom + 34;
  const taglinePlaced = place(taglineSVG, (CARD_W - taglineMeasured.width) / 2, taglineY);

  // Barcode: a QR generated from the pass's own barcode message (mirroring
  // how Wallet renders the barcode itself), sat in a plain white rounded
  // panel — no border. Wallet draws this itself; nothing here can add a
  // blue border to it without misrepresenting what a real device shows.
  const qrSize = 240;
  const qrBuffer = await generateQRPNG(pass.barcodes[0].message, { width: qrSize });
  const qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;
  const panelPad = 22;
  const panelSize = qrSize + panelPad * 2;
  const panelX = (CARD_W - panelSize) / 2;
  const panelY = taglineY + taglineMeasured.height + 40;

  const CARD_H = Math.ceil(panelY + panelSize + PAD);
  const CANVAS_W = CARD_W + MARGIN * 2;
  const CANVAS_H = CARD_H + MARGIN * 2;

  const cardSVG = `
    <g transform="translate(${MARGIN} ${MARGIN})">
      <clipPath id="cardClip"><rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}" /></clipPath>
      <rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}"
            fill="${pass.backgroundColor}" />
      <g clip-path="url(#cardClip)">
        <image x="0" y="${stripTop}" width="${stripMeta.width}" height="${stripMeta.height}"
               href="${stripDataUri}" />
      </g>
      ${taglinePlaced.markup}
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
