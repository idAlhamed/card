import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFont, textToPath, wordmarkSVG } from '../src/lib/text-path.mjs';

test('loads Inter SemiBold', async () => {
  const font = await loadFont('semibold');
  assert.ok(font.unitsPerEm > 0);
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
