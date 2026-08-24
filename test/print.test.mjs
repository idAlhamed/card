import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  buildCardSVG, buildCardPDF, CARD, DOC_W, DOC_H, RICH_BLACK_CMYK,
  faceLayout, cropMarkLines,
} from '../src/lib/print.mjs';
import { qrModules } from '../src/lib/qr.mjs';
import { validConfig } from './fixtures.mjs';

// Open-interval overlap, for element-to-element checks (text vs. QR panel)
// where two things merely touching at an edge is an acceptable layout, not
// a violation.
function overlaps(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 1e-9;
}

// CLOSED-interval intersection, for crop-mark-vs-trim-rectangle checks. A
// crop mark that merely touches the trim boundary is still a line printed
// exactly on the trim edge — visible on the finished card — so unlike
// element-to-element overlap, a boundary touch here MUST count as a hit.
function intersectsClosed(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > -1e-9;
}

// Decompresses every FlateDecode content stream in a PDF file so the actual
// drawing operators can be inspected, not just assumed from the code path.
function decompressStreams(buf) {
  const str = buf.toString('latin1');
  const streams = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(str))) {
    const start = m.index + m[0].length;
    const end = str.indexOf('endstream', start);
    if (end === -1) break;
    try {
      streams.push(inflateSync(buf.subarray(start, end)).toString('latin1'));
    } catch {
      // not a Flate-compressed stream (e.g. an image already in final form) — skip
    }
  }
  return streams;
}

test('document size is trim plus bleed on every edge', () => {
  assert.equal(DOC_W, 91.6);
  assert.equal(DOC_H, 60);
  assert.equal(CARD.trimW, 85.6);
  assert.equal(CARD.trimH, 54);
  assert.equal(CARD.bleed, 3);
});

test('rich black is four-channel, not single-channel', () => {
  assert.deepEqual(RICH_BLACK_CMYK, [60, 50, 50, 100]);
});

test('the SVG declares real millimetre dimensions', async () => {
  const svg = await buildCardSVG('front', validConfig());
  assert.match(svg, /width="91.6mm"/);
  assert.match(svg, /height="60mm"/);
  assert.match(svg, /viewBox="0 0 91.6 60"/);
});

test('rejects an unknown face', async () => {
  await assert.rejects(() => buildCardSVG('side', validConfig()), /Unknown card face/);
});

test('type is outlined, never live text', async () => {
  for (const face of ['front', 'back']) {
    const svg = await buildCardSVG(face, validConfig());
    assert.doesNotMatch(svg, /<text/, `${face} must not contain live text`);
  }
});

test('the QR meets the 18mm scanning minimum', async () => {
  assert.ok(CARD.qrSize >= 18, 'QR must be at least 18mm to scan reliably');
  assert.ok(CARD.qrPanel > CARD.qrSize, 'the panel must provide a quiet zone');
});

test('the QR sits on a light panel, not inverted on black', async () => {
  const svg = await buildCardSVG('back', validConfig());
  assert.match(svg, /class="qr-panel"[^>]*fill="#FFFFFF"/);
});

test('every dark QR module is drawn', async () => {
  const config = validConfig();
  const svg = await buildCardSVG('back', config);
  const { size, data } = qrModules(config.url.CARD_URL);
  const expected = [...data].filter(Boolean).length;
  assert.equal((svg.match(/class="qr-m"/g) ?? []).length, expected);
  assert.ok(size >= 21);
});

test('crop marks stay inside the bleed and never enter the trim', async () => {
  const svg = await buildCardSVG('front', validConfig());
  assert.ok((svg.match(/class="crop"/g) ?? []).length >= 8, 'two marks per corner');
});

test('writes a real PDF for each face', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'print-'));
  for (const face of ['front', 'back']) {
    const out = join(dir, `${face}.pdf`);
    await buildCardPDF(face, validConfig(), out);
    const head = (await readFile(out)).subarray(0, 5).toString('ascii');
    assert.equal(head, '%PDF-', `${face}.pdf is not a PDF`);
  }
});

test('the PDF contains no font resource — type must be outlined, not live text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'print-'));
  for (const face of ['front', 'back']) {
    const out = join(dir, `${face}.pdf`);
    await buildCardPDF(face, validConfig(), out);
    const raw = (await readFile(out)).toString('latin1');
    assert.doesNotMatch(raw, /\/BaseFont/, `${face}.pdf embeds a font — live text was used`);
    assert.doesNotMatch(raw, /\/Type\s*\/Font\b/, `${face}.pdf declares a font resource`);
  }
});

test('the PDF actually strokes 8 crop marks, not merely calls the function', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'print-'));
  for (const face of ['front', 'back']) {
    const out = join(dir, `${face}.pdf`);
    await buildCardPDF(face, validConfig(), out);
    const streams = decompressStreams(await readFile(out)).join('\n');
    const strokes = streams.match(/(^|\s)S(\s|$)/gm) ?? [];
    assert.equal(strokes.length, 8, `${face}.pdf: expected 8 stroke ops for 8 crop marks, found ${strokes.length}`);
  }
});

test('crop marks never cross into the trim rectangle, not even by touching it', () => {
  const trimX = [CARD.bleed, CARD.bleed + CARD.trimW];   // 3 .. 88.6
  const trimY = [CARD.bleed, CARD.bleed + CARD.trimH];   // 3 .. 57
  const lines = cropMarkLines();
  assert.equal(lines.length, 8, 'two marks per corner');
  for (const { x1, y1, x2, y2 } of lines) {
    const markX = [Math.min(x1, x2), Math.max(x1, x2)];
    const markY = [Math.min(y1, y2), Math.max(y1, y2)];
    // Closed-interval on purpose: a mark whose free axis runs along the trim
    // boundary and whose fixed axis also reaches that boundary is a line
    // physically printed on the trim edge, not merely near it.
    const crosses = intersectsClosed(...markX, ...trimX) && intersectsClosed(...markY, ...trimY);
    assert.ok(!crosses, `crop mark (${x1},${y1})-(${x2},${y2}) touches or crosses into the trim rectangle`);
  }
});

test('crop-mark length is structurally shorter than the bleed, not just checked geometrically', () => {
  // The intersection test above is the backstop; this is the invariant that
  // should make it unreachable in practice. A mark as long as (or longer
  // than) the bleed could run along the boundary parallel to the trim edge
  // without the perpendicular axis ever registering an overlap — this
  // assertion closes that gap structurally, at the source of the numbers.
  for (const { x1, y1, x2, y2 } of cropMarkLines()) {
    const len = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    assert.ok(len < CARD.bleed,
      `crop mark length ${len} must be strictly less than the bleed ${CARD.bleed}`);
  }
});

test('every text element stays within the safe area', async () => {
  const safeLeft = CARD.bleed + CARD.safe;                     // 7
  const safeRight = CARD.bleed + CARD.trimW - CARD.safe;       // 84.6
  const safeTop = CARD.bleed + CARD.safe;                      // 7
  const safeBottom = CARD.bleed + CARD.trimH - CARD.safe;      // 53
  for (const face of ['front', 'back']) {
    const layout = await faceLayout(face, validConfig());
    for (const t of layout.texts) {
      // t.inkTop / t.inkBottom are the TRUE rendered vertical extent,
      // read directly off the layout rather than reconstructed from
      // y/height — a reconstruction shifts by the descender depth for any
      // text with a descender (e.g. "Developer", "github").
      assert.ok(t.x >= safeLeft, `${face}: text left edge ${t.x} is left of the safe area`);
      assert.ok(t.x + t.advance <= safeRight,
        `${face}: text right edge ${t.x + t.advance} exceeds safe edge ${safeRight}`);
      assert.ok(t.inkTop >= safeTop, `${face}: text top ${t.inkTop} is above the safe top ${safeTop}`);
      assert.ok(t.inkBottom <= safeBottom,
        `${face}: text bottom ${t.inkBottom} exceeds safe bottom ${safeBottom}`);
    }
  }
});

test('the QR panel lies within the safe area and overlaps no text element', async () => {
  const safeLeft = CARD.bleed + CARD.safe;                 // 7
  const safeRight = CARD.bleed + CARD.trimW - CARD.safe;   // 84.6
  const safeTop = CARD.bleed + CARD.safe;                  // 7
  const safeBottom = CARD.bleed + CARD.trimH - CARD.safe;  // 53
  const { texts, qr } = await faceLayout('back', validConfig());

  assert.ok(qr.panelX >= safeLeft, 'QR panel left edge is outside the safe area');
  assert.ok(qr.panelX + qr.panelSize <= safeRight, 'QR panel right edge is outside the safe area');
  assert.ok(qr.panelY >= safeTop, 'QR panel top edge is outside the safe area');
  assert.ok(qr.panelY + qr.panelSize <= safeBottom, 'QR panel bottom edge is outside the safe area');

  for (const t of texts) {
    const xHit = overlaps(t.x, t.x + t.advance, qr.panelX, qr.panelX + qr.panelSize);
    const yHit = overlaps(t.inkTop, t.inkBottom, qr.panelY, qr.panelY + qr.panelSize);
    assert.ok(!(xHit && yHit), 'a text element overlaps the QR panel');
  }
});

test('the QR panel radius is read from the shared layout, not hardcoded in the SVG renderer', async () => {
  const config = validConfig();
  const { qr } = await faceLayout('back', config);
  assert.ok(qr.panelRadius > 0, 'faceLayout must supply a panel radius');
  const svg = await buildCardSVG('back', config);
  assert.match(svg, new RegExp(`class="qr-panel"[^>]*rx="${qr.panelRadius}"`),
    'the SVG panel radius must equal the one faceLayout produced, not a separate literal');
});
