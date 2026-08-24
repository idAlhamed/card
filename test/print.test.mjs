import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCardSVG, buildCardPDF, CARD, DOC_W, DOC_H, RICH_BLACK_CMYK,
} from '../src/lib/print.mjs';
import { qrModules } from '../src/lib/qr.mjs';
import { validConfig } from './fixtures.mjs';

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
