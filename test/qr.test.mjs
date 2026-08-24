import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateQRSVG, generateQRPNG, qrModules, decodeQRPNG, assertQRRoundTrip, QR_OPTIONS,
} from '../src/lib/qr.mjs';

const URL_ = 'https://idalhamed.github.io/card';

test('defaults to error correction Q with a 4-module quiet zone', () => {
  assert.equal(QR_OPTIONS.errorCorrectionLevel, 'Q');
  assert.equal(QR_OPTIONS.margin, 4);
});

test('emits an SVG', async () => {
  const svg = await generateQRSVG(URL_);
  assert.match(svg, /<svg/);
});

test('emits a PNG buffer', async () => {
  const png = await generateQRPNG(URL_);
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
});

test('exposes the raw module matrix', () => {
  const { size, data } = qrModules(URL_);
  assert.ok(size >= 21, 'a QR is at least 21 modules across');
  assert.equal(data.length, size * size);
});

test('a generated QR decodes back to exactly the encoded URL', async () => {
  const png = await generateQRPNG(URL_);
  assert.equal(await decodeQRPNG(png), URL_);
});

test('assertQRRoundTrip passes when the code matches', async () => {
  const png = await generateQRPNG(URL_);
  assert.equal(await assertQRRoundTrip(URL_, png), URL_);
});

test('assertQRRoundTrip throws when the code encodes something else', async () => {
  const png = await generateQRPNG('https://example.com/wrong');
  await assert.rejects(() => assertQRRoundTrip(URL_, png), /round-trip failed/);
});

test('assertQRRoundTrip throws when the image is undecodable', async () => {
  const blank = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64');
  await assert.rejects(() => assertQRRoundTrip(URL_, blank), /could not be decoded/);
});
