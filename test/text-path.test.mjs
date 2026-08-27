import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { loadFont, textToPath, wordmarkSVG } from '../src/lib/text-path.mjs';

test('loads Inter SemiBold', async () => {
  const font = await loadFont('semibold');
  assert.ok(font.unitsPerEm > 0);
});

test('loads Inter Light', async () => {
  const font = await loadFont('light');
  assert.ok(font.unitsPerEm > 0);
});

// Proves Light is a genuinely distinct, lighter font — not Regular silently
// substituted under the 'light' key. Each vendored file's own name table
// entry is checked directly (rather than trusting the filename), and the
// three weights are confirmed to actually differ from one another.
test('the three vendored weights are genuinely distinct fonts, not aliases of one file', async () => {
  const [light, regular, semibold] = await Promise.all([
    loadFont('light'), loadFont('regular'), loadFont('semibold'),
  ]);
  assert.equal(light.names.fullName.en, 'Inter Light');
  assert.equal(regular.names.fullName.en, 'Inter Regular');
  assert.equal(semibold.names.fullName.en, 'Inter SemiBold');
  assert.equal(light.tables.os2.usWeightClass, 300);
  assert.equal(regular.tables.os2.usWeightClass, 400);
  assert.equal(semibold.tables.os2.usWeightClass, 600);
});

// Proves 'light' is genuinely rasterised as a lighter weight, not silently
// falling back to 'regular' (which would look like success on every other
// test here — same API, same glyphs, no thrown error). Two independent
// signals: (1) the raw glyph path data for the same string differs between
// weights (a font that failed to load and fell back would produce
// byte-identical path data), and (2) rendering both to a raster and
// measuring ink-pixel coverage over the same bounding box shows Light
// paints measurably less ink than Regular, which in turn paints less than
// SemiBold — the expected order for genuinely different stroke weights.
test('light renders as measurably lighter ink than regular, not a silent fallback', async () => {
  const text = 'SOFTWARE ENGINEER';
  const opts = { fontSize: 200, letterSpacing: 200 * 0.13, fill: '#FFFFFF' };

  const [lightFont, regularFont, semiboldFont] = await Promise.all([
    loadFont('light'), loadFont('regular'), loadFont('semibold'),
  ]);
  const lightPath = textToPath(lightFont, text, opts);
  const regularPath = textToPath(regularFont, text, opts);
  assert.notEqual(lightPath.d, regularPath.d,
    'light and regular produced byte-identical path data — light is not actually being rasterised');

  async function fillRatio(weight) {
    const svg = await wordmarkSVG(text, { weight, ...opts });
    const [, wStr, hStr] = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
    const w = Math.ceil(Number(wStr));
    const h = Math.ceil(Number(hStr));
    const { data, info } = await sharp(Buffer.from(svg)).raw().ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    let ink = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] > 40) ink++;
    }
    return ink / (w * h);
  }

  const lightRatio = await fillRatio('light');
  const regularRatio = await fillRatio('regular');
  const semiboldRatio = await fillRatio('semibold');
  assert.ok(lightRatio > 0, 'light produced no ink at all');
  assert.ok(
    lightRatio < regularRatio && regularRatio < semiboldRatio,
    `expected ink coverage light (${lightRatio.toFixed(4)}) < regular ` +
    `(${regularRatio.toFixed(4)}) < semibold (${semiboldRatio.toFixed(4)})`
  );
});

test('rejects an unknown weight with a helpful message', async () => {
  await assert.rejects(() => loadFont('ultrablack'), /Unknown font weight/);
});

test('produces SVG path data', async () => {
  const font = await loadFont('semibold');
  const { d, advance } = textToPath(font, 'ALI HAMED', { fontSize: 100 });
  assert.match(d, /^M/);
  assert.ok(advance > 100, 'a nine-character wordmark should be wider than 100 units');
});

test('letter-spacing widens the advance by exactly (glyphs - 1) * spacing', async () => {
  const font = await loadFont('semibold');
  const text = 'ALI HAMED';
  const tight = textToPath(font, text, { fontSize: 100, letterSpacing: 0 });
  const loose = textToPath(font, text, { fontSize: 100, letterSpacing: 14 });
  const expected = tight.advance + (text.length - 1) * 14;
  assert.ok(Math.abs(loose.advance - expected) < 0.01);
});

test('empty text produces a zero advance rather than throwing', async () => {
  const font = await loadFont('semibold');
  assert.equal(textToPath(font, '', { fontSize: 100 }).advance, 0);
});

test('wordmarkSVG emits a self-contained single-path SVG', async () => {
  const svg = await wordmarkSVG('ALI HAMED', { fontSize: 60, letterSpacing: 8, fill: '#F5F5F7' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /fill="#F5F5F7"/);
  assert.equal(svg.match(/<path/g).length, 1, 'all glyphs must merge into one path');
  assert.doesNotMatch(svg, /<text/, 'text must be outlined, never left live');
});
