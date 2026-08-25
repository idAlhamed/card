// Renders preview/apple-wallet-pass.png: a design mockup of the Apple
// Wallet pass, built from the REAL pass field values (via buildPassJSON())
// and the REAL generated pass images (wallet/AliHamed.pass/logo@2x.png).
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
// pass image assets themselves use (logo@2x.png etc).
const CARD_W = 320 * 2; // 640
const CARD_H = 440 * 2; // 880
const RADIUS = 24;      // rounded-rectangle corner radius, px at 2x
const PAD = 40;         // inner content padding, px at 2x
const MARGIN = 56;      // backdrop margin so the card's edges read clearly
const CANVAS_W = CARD_W + MARGIN * 2;
const CANVAS_H = CARD_H + MARGIN * 2;
const BACKDROP = '#D9D9DE'; // neutral, distinct from the pass's own black

/** Wraps a wordmarkSVG() result so it can be placed at (x, y) inside a parent SVG. */
function place(svgString, x, y) {
  const inner = svgString.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const [, w, h] = svgString.match(/width="([\d.]+)" height="([\d.]+)"/);
  return { markup: `<g transform="translate(${x} ${y})">${inner}</g>`, width: Number(w), height: Number(h) };
}

async function loadLogo() {
  // Prefer logo@2x.png (320x100 — already sized for this canvas's 2x
  // scale). Fall back to downscaling logo@3x.png if @2x is ever missing.
  try {
    return await readFile(at('wallet/AliHamed.pass/logo@2x.png'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const logo3x = await readFile(at('wallet/AliHamed.pass/logo@3x.png'));
    return sharp(logo3x).resize(320, 100, { fit: 'inside' }).png().toBuffer();
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
  const primary = pass.generic.primaryFields[0];   // name
  const secondary = pass.generic.secondaryFields[0]; // role
  const auxiliary = pass.generic.secondaryFields[1];  // technologies

  const logoBuffer = await loadLogo();
  const logoMeta = await sharp(logoBuffer).metadata();
  // Fit the logo into a top strip, scaled down from its native 320x100 so
  // it reads as a header rather than dominating the card. The logo is now
  // the Apple-mark + "Business Card" title, not the name (see
  // src/lib/pass.mjs renderLogo) — it must stay quiet up here.
  const logoHeight = 44;
  const logoWidth = Math.round((logoMeta.width / logoMeta.height) * logoHeight);
  const logoDataUri = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  // The name is the primaryField now, so it renders at primaryField size —
  // far larger than the 18.8pt the 160x50pt logo slot ever allowed. 0.08em
  // tracking is unchanged from the old logo rendering (client request: keep
  // the current restrained tracking) — at this larger size it's the same
  // relative letterspacing, just no longer width-constrained to 160pt.
  // Reduced from 80 (~17.5%) — at 80 the name overwhelmed the header and
  // the rest of the pass; still far larger than ROLE/TECHNOLOGIES below it.
  const primaryFontSize = 56;
  const [primarySVG, roleLabelSVG, roleValueSVG, stackLabelSVG, stackValueSVG] = await Promise.all([
    wordmarkSVG(primary.value, { fontSize: primaryFontSize, letterSpacing: primaryFontSize * 0.08, fill: pass.foregroundColor }),
    wordmarkSVG(secondary.label, { weight: 'regular', fontSize: 15, letterSpacing: 15 * 0.12, fill: pass.labelColor }),
    wordmarkSVG(secondary.value, { weight: 'regular', fontSize: 24, fill: pass.foregroundColor }),
    wordmarkSVG(auxiliary.label, { weight: 'regular', fontSize: 15, letterSpacing: 15 * 0.12, fill: pass.labelColor }),
    wordmarkSVG(auxiliary.value, { weight: 'regular', fontSize: 20, fill: pass.foregroundColor }),
  ]);

  const primaryY = PAD + logoHeight + 56;
  const primaryPlaced = place(primarySVG, PAD, primaryY);

  // Secondary (ROLE) and auxiliary (TECHNOLOGIES) fields sit side by side
  // in a row beneath the primary field, mirroring how Wallet lays out a
  // generic pass's secondaryFields/auxiliaryFields row. The gap below the
  // primary field is widened from 48 to 58 to offset its shorter glyph
  // height, so this row lands at roughly the same spot it did before the
  // primary field's type size was reduced.
  const fieldsY = primaryY + primaryPlaced.height + 66;
  const leftColX = PAD;
  const rightColX = CARD_W / 2 + 12;

  const roleLabelPlaced = place(roleLabelSVG, leftColX, fieldsY);
  const roleValueY = fieldsY + roleLabelPlaced.height + 12;
  const roleValuePlaced = place(roleValueSVG, leftColX, roleValueY);

  const stackLabelPlaced = place(stackLabelSVG, rightColX, fieldsY);
  const stackValueY = fieldsY + stackLabelPlaced.height + 12;
  const stackValuePlaced = place(stackValueSVG, rightColX, stackValueY);

  // Barcode: a QR generated from the pass's own barcode message (mirroring
  // how Wallet renders the barcode itself), sat in a white rounded panel
  // near the bottom of the card.
  const qrSize = 260;
  const qrBuffer = await generateQRPNG(pass.barcodes[0].message, { width: qrSize });
  const qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;
  const panelPad = 24;
  const panelSize = qrSize + panelPad * 2;
  const panelX = (CARD_W - panelSize) / 2;
  const panelY = CARD_H - PAD - panelSize;

  const cardSVG = `
    <g transform="translate(${MARGIN} ${MARGIN})">
      <rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}"
            fill="${pass.backgroundColor}" />
      <image x="${PAD}" y="${PAD}" width="${logoWidth}" height="${logoHeight}"
             href="${logoDataUri}" />
      ${primaryPlaced.markup}
      ${roleLabelPlaced.markup}
      ${roleValuePlaced.markup}
      ${stackLabelPlaced.markup}
      ${stackValuePlaced.markup}
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
