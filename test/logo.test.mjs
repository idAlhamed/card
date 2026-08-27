import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  logoSVG, logoRasterFor, logoHeightFor, LOGO_ASPECT,
  LOGO_SVG, LOGO_RASTERS, LOGO_PRINT_PDF,
} from '../src/lib/logo.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');

test('every supplied logo asset is present', async () => {
  for (const url of [LOGO_SVG, LOGO_PRINT_PDF, ...Object.values(LOGO_RASTERS)]) {
    await assert.doesNotReject(readFile(url), `missing supplied asset: ${url}`);
  }
});

// The client's instruction is explicit: the supplied artwork must never be
// redrawn, traced, simplified, optimised or modified. This asserts the module
// hands back the file's exact bytes.
test('logoSVG() returns the supplied file verbatim, byte for byte', async () => {
  const fromDisk = await readFile(LOGO_SVG, 'utf8');
  assert.equal(sha(Buffer.from(await logoSVG())), sha(Buffer.from(fromDisk)));
});

test('the supplied aspect ratio is 1200x800 and is preserved', () => {
  assert.equal(LOGO_ASPECT, 1200 / 800);
  assert.equal(logoHeightFor(600), 400);
  assert.equal(logoHeightFor(1200), 800);
});

test('raster selection never upscales past a supplied export', () => {
  assert.equal(logoRasterFor(200), LOGO_RASTERS[300]);
  assert.equal(logoRasterFor(300), LOGO_RASTERS[300]);
  assert.equal(logoRasterFor(301), LOGO_RASTERS[600]);
  assert.equal(logoRasterFor(1200), LOGO_RASTERS[1200]);
  assert.equal(logoRasterFor(5000), LOGO_RASTERS[1200], 'falls back to the largest supplied export');
});

test('no generated monogram module remains in the project', async () => {
  await assert.rejects(
    readFile(new URL('../src/lib/monogram.mjs', import.meta.url)),
    'the rejected generated monogram must not exist');
});
