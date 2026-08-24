import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import PDFDocument from 'pdfkit';
import { loadFont, textToPath } from './text-path.mjs';
import { qrModules } from './qr.mjs';

// Standard business card, in millimetres.
export const CARD = {
  trimW: 85.6, trimH: 54,
  bleed: 3,      // printer trims into this
  safe: 4,       // nothing important inside this margin
  qrSize: 20,    // >= 18mm, the reliable-scan minimum
  qrPanel: 26,   // light panel providing the quiet zone
};

export const DOC_W = CARD.trimW + CARD.bleed * 2;   // 91.6
export const DOC_H = CARD.trimH + CARD.bleed * 2;   // 60
export const MM_TO_PT = 2.834645669;

// Single-channel black prints thin and grey. Four-channel rich black does not.
export const RICH_BLACK_CMYK = [60, 50, 50, 100];
const INK_RGB = '#0A0A0B';   // screen preview only; the PDF carries the CMYK
const PAPER = '#FFFFFF';
const PRIMARY = '#F5F5F7';
const TERTIARY = '#86868B';

const L = CARD.bleed + CARD.safe;              // left safe edge: 7mm
const R = CARD.bleed + CARD.trimW - CARD.safe; // right safe edge: 84.6mm

/**
 * Lays out one line of outlined type with its ink-top at `y`.
 * Returns resolved path data plus the position and fill both renderers need —
 * neither the SVG nor the PDF path recomputes this. `advance` (width) and
 * `height` are also carried so geometry tests can check the safe area
 * without re-deriving glyph metrics from the path data.
 */
async function line(text, { weight = 'semibold', size, spacing = 0, x, y, fill }) {
  const font = await loadFont(weight);
  const { d, box, advance } = textToPath(font, text, {
    fontSize: size, letterSpacing: spacing,
  });
  const dy = Number((y - box.y1).toFixed(3));
  return { d, x, y: dy, fill, advance, height: box.y2 - box.y1 };
}

const QR_PANEL_RADIUS = 2;   // the one place the panel's corner radius lives

/**
 * Geometry for the QR panel and every dark module, in millimetres.
 * `qrModules` reads QR_OPTIONS from qr.mjs — the same constant the PNG
 * renderer uses — so this can never diverge from the round-trip-verified QR.
 */
function qrLayout(url, x, y) {
  const { size, data } = qrModules(url);
  const m = CARD.qrSize / size;
  const ox = x + (CARD.qrPanel - CARD.qrSize) / 2;
  const oy = y + (CARD.qrPanel - CARD.qrSize) / 2;
  const modules = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!data[r * size + c]) continue;
      modules.push({ x: ox + c * m, y: oy + r * m, size: m });
    }
  }
  return {
    panelX: x, panelY: y, panelSize: CARD.qrPanel, panelRadius: QR_PANEL_RADIUS, modules,
  };
}

/**
 * The 8 crop-mark line segments (two per corner), in millimetres. This is
 * the ONLY place their coordinates are computed — both buildCardSVG and
 * buildCardPDF stroke exactly these segments, so a proof showing trim
 * guidance can never ship with a printer file that has none.
 */
export function cropMarkLines() {
  const b = CARD.bleed;
  const len = 2;   // stays inside the 3mm bleed, never touching the trim
  const trimX2 = b + CARD.trimW;
  const trimY2 = b + CARD.trimH;
  return [
    { x1: 0, y1: b, x2: len, y2: b },
    { x1: b, y1: 0, x2: b, y2: len },
    { x1: DOC_W - len, y1: b, x2: DOC_W, y2: b },
    { x1: trimX2, y1: 0, x2: trimX2, y2: len },
    { x1: 0, y1: trimY2, x2: len, y2: trimY2 },
    { x1: b, y1: DOC_H - len, x2: b, y2: DOC_H },
    { x1: DOC_W - len, y1: trimY2, x2: DOC_W, y2: trimY2 },
    { x1: trimX2, y1: DOC_H - len, x2: trimX2, y2: DOC_H },
  ];
}

function cropMarksSVG(lines) {
  return lines.map(({ x1, y1, x2, y2 }) =>
    `<line class="crop" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
    `stroke="#FFFFFF" stroke-width="0.1"/>`
  ).join('');
}

/**
 * The single source of truth for what goes on each face: text lines (each
 * with resolved path data, position, fill, advance and height) plus QR
 * geometry, if any. Both buildCardSVG and buildCardPDF render this same
 * layout, so the proof a client approves on screen can never drift from
 * what the printer receives. Exported so geometry can be asserted directly
 * by coordinate in tests, rather than only by counting rendered elements.
 */
export async function faceLayout(face, config) {
  if (face === 'front') {
    const name = await line(config.content.name, {
      size: 5.2, spacing: 0.72, x: L, y: 23.5, fill: PRIMARY,
    });
    const tech = await line(config.content.technologies, {
      weight: 'regular', size: 2.2, spacing: 0.18, x: L, y: 31, fill: TERTIARY,
    });
    return { texts: [name, tech], qr: null };
  }
  if (face === 'back') {
    const role = await line(config.content.role, {
      weight: 'regular', size: 3.2, x: L, y: 22, fill: PRIMARY,
    });
    const short = config.url.CARD_URL.replace(/^https:\/\//, '');
    const url = await line(short, {
      weight: 'regular', size: 2.1, x: L, y: 29.5, fill: TERTIARY,
    });
    const qr = qrLayout(config.url.CARD_URL, R - CARD.qrPanel, (DOC_H - CARD.qrPanel) / 2);
    return { texts: [role, url], qr };
  }
  throw new Error(`Unknown card face "${face}". Use "front" or "back".`);
}

function textToSVG(t) {
  return `<path transform="translate(${t.x} ${t.y})" d="${t.d}" fill="${t.fill}"/>`;
}

function qrToSVG(qr) {
  const parts = [
    `<rect class="qr-panel" x="${qr.panelX}" y="${qr.panelY}" width="${qr.panelSize}" ` +
    `height="${qr.panelSize}" rx="${qr.panelRadius}" fill="${PAPER}"/>`,
  ];
  for (const mod of qr.modules) {
    parts.push(
      `<rect class="qr-m" x="${mod.x.toFixed(3)}" y="${mod.y.toFixed(3)}" ` +
      `width="${mod.size.toFixed(3)}" height="${mod.size.toFixed(3)}" fill="#000000"/>`
    );
  }
  return parts.join('');
}

export async function buildCardSVG(face, config) {
  const layout = await faceLayout(face, config);
  const body = layout.texts.map(textToSVG).join('') + (layout.qr ? qrToSVG(layout.qr) : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DOC_W}mm" ` +
    `height="${DOC_H}mm" viewBox="0 0 ${DOC_W} ${DOC_H}">` +
    `<rect x="0" y="0" width="${DOC_W}" height="${DOC_H}" fill="${INK_RGB}"/>` +
    body + cropMarksSVG(cropMarkLines()) + '</svg>';
}

export async function buildCardPDF(face, config, outPath) {
  const layout = await faceLayout(face, config);

  const doc = new PDFDocument({
    size: [DOC_W * MM_TO_PT, DOC_H * MM_TO_PT],
    margin: 0,
    info: { Title: `${config.content.fullName} — business card ${face}` },
  });
  const stream = createWriteStream(outPath);
  doc.pipe(stream);

  doc.save().scale(MM_TO_PT);   // draw in millimetres from here on

  doc.rect(0, 0, DOC_W, DOC_H).fill(RICH_BLACK_CMYK);

  for (const t of layout.texts) {
    doc.save().translate(t.x, t.y).path(t.d).fill(t.fill).restore();
  }

  if (layout.qr) {
    const { qr } = layout;
    doc.roundedRect(qr.panelX, qr.panelY, qr.panelSize, qr.panelSize, qr.panelRadius).fill(PAPER);
    doc.fillColor('#000000');
    for (const mod of qr.modules) {
      doc.rect(mod.x, mod.y, mod.size, mod.size);
    }
    doc.fill();
  }

  // Crop marks last, on top — same 8 segments the SVG proof shows, stroked
  // in mm space (post-scale) so a coordinate change in cropMarkLines()
  // reaches both outputs identically.
  doc.lineWidth(0.1).strokeColor('#FFFFFF');
  for (const { x1, y1, x2, y2 } of cropMarkLines()) {
    doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
  }

  doc.restore();
  doc.end();
  await once(stream, 'finish');
}
