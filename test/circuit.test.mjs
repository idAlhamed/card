import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { circuitSVG } from '../src/lib/circuit.mjs';

test('renders a well-formed self-contained SVG', () => {
  const svg = circuitSVG({ width: 300, height: 200, seed: 1 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /viewBox="0 0 300 200"/);
});

test('is deterministic across two calls with identical options', () => {
  const opts = { width: 375, height: 123, density: 1.5, seed: 42 };
  assert.equal(circuitSVG(opts), circuitSVG(opts));
});

test('is deterministic across two calls with a string seed', () => {
  const opts = { width: 200, height: 200, seed: 'ali-hamed-wallet' };
  assert.equal(circuitSVG(opts), circuitSVG(opts));
});

test('a different seed produces different output', () => {
  const a = circuitSVG({ width: 200, height: 200, seed: 1 });
  const b = circuitSVG({ width: 200, height: 200, seed: 2 });
  assert.notEqual(a, b);
});

test('never calls Math.random or reads the clock', () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let called = false;
  Math.random = () => { called = true; return originalRandom(); };
  Date.now = () => { called = true; return originalNow(); };
  try {
    circuitSVG({ width: 500, height: 300, seed: 7, density: 2 });
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
  assert.equal(called, false, 'circuitSVG must not touch Math.random or Date.now');
});

test('respects width and height parameters', () => {
  const svg = circuitSVG({ width: 856, height: 540, seed: 3 });
  assert.match(svg, /width="856"/);
  assert.match(svg, /height="540"/);
});

test('respects accent and base colour parameters', () => {
  const svg = circuitSVG({
    width: 200, height: 200, seed: 5, accentColor: '#FF00AA', baseColor: '#111111',
    accentProbability: 1, // force every node lit, to guarantee the accent colour appears
  });
  assert.match(svg, /stroke="#111111"/);
  assert.match(svg, /fill="#FF00AA"/);
});

test('a higher density produces more trace paths', () => {
  const sparse = circuitSVG({ width: 400, height: 400, seed: 9, density: 0.3 });
  const dense = circuitSVG({ width: 400, height: 400, seed: 9, density: 3 });
  const countPaths = (svg) => (svg.match(/<path /g) || []).length;
  assert.ok(countPaths(dense) > countPaths(sparse));
});

test('rejects non-positive dimensions', () => {
  assert.throws(() => circuitSVG({ width: 0, height: 100 }), RangeError);
  assert.throws(() => circuitSVG({ width: 100, height: -5 }), RangeError);
  assert.throws(() => circuitSVG({ width: 100, height: 100, density: 0 }), RangeError);
});

test('fills gracefully at very different aspect ratios (wide strip vs near-square)', () => {
  const strip = circuitSVG({ width: 375, height: 123, seed: 1 });
  const square = circuitSVG({ width: 400, height: 400, seed: 1 });
  assert.match(strip, /viewBox="0 0 375 123"/);
  assert.match(square, /viewBox="0 0 400 400"/);
});

test('renders to a real raster image via sharp', async () => {
  const svg = circuitSVG({ width: 320, height: 240, seed: 11 });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 320);
  assert.equal(meta.height, 240);
});
