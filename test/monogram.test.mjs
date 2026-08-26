import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { monogramSVG } from '../src/lib/monogram.mjs';

test('renders a well-formed self-contained SVG', () => {
  const svg = monogramSVG();
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  // No text elements anywhere — this is a drawn mark, not typography.
  assert.doesNotMatch(svg, /<text/);
});

test('is deterministic across two calls with identical options', () => {
  const opts = { size: 300, color: '#FFFFFF', strokeWidth: 6 };
  assert.equal(monogramSVG(opts), monogramSVG(opts));
});

test('default output is deterministic across calls with no options', () => {
  assert.equal(monogramSVG(), monogramSVG());
});

test('the colour parameter controls both stroke and node fill', () => {
  const svg = monogramSVG({ color: '#FF00AA' });
  assert.match(svg, /stroke="#FF00AA"/);
  assert.match(svg, /fill="#FF00AA"/);
  assert.doesNotMatch(svg, /#00B7FF/); // default colour must not leak in
});

test('the size parameter scales the rendered width', () => {
  const small = monogramSVG({ size: 100 });
  const large = monogramSVG({ size: 400 });
  const widthOf = (svg) => Number(svg.match(/width="([\d.]+)"/)[1]);
  assert.equal(widthOf(small), 100);
  assert.equal(widthOf(large), 400);
  assert.equal(widthOf(large) / widthOf(small), 4);
});

test('height follows the fixed aspect ratio derived from the viewBox', () => {
  const svg = monogramSVG({ size: 220 });
  const [, vbW, vbH] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const height = Number(svg.match(/height="([\d.]+)"/)[1]);
  assert.equal(height, 220 * (Number(vbH) / Number(vbW)));
});

test('rejects a non-positive size', () => {
  assert.throws(() => monogramSVG({ size: 0 }), RangeError);
  assert.throws(() => monogramSVG({ size: -10 }), RangeError);
});

test('an optional background rect can be requested', () => {
  const withBg = monogramSVG({ background: '#000000' });
  const withoutBg = monogramSVG();
  assert.match(withBg, /<rect[^>]*fill="#000000"/);
  assert.doesNotMatch(withoutBg, /<rect/);
});

test('renders to a real raster image via sharp', async () => {
  const svg = monogramSVG({ size: 256, color: '#00B7FF' });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 256);
  assert.ok(meta.height > 0);
});
