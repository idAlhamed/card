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

// --- Structural regression tests (redesign-foundations round 1 feedback:
// too sparse, no bundles, uniformly scattered) ---------------------------

function parsePaths(svg) {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) =>
    m[1].match(/[ML]-?[\d.]+,-?[\d.]+/g).map((tok) => tok.slice(1).split(',').map(Number)));
}

test('trace density is roughly 3.5x the old one-per-9000-area-units baseline', () => {
  const width = 390, height = 844, density = 1;
  const svg = circuitSVG({ width, height, density, seed: 'density-check' });
  const pathCount = parsePaths(svg).length;
  const expected = Math.round((density * width * height) / 2500);
  // Guard loops can undershoot slightly when bundles keep landing out of
  // bounds; allow some slack rather than pinning the exact count.
  assert.ok(pathCount >= expected * 0.7,
    `expected roughly ${expected} lines, got ${pathCount}`);
  assert.ok(pathCount > 100, `${pathCount} lines is not meaningfully denser than the old sparse layout`);
});

test('most traces travel in parallel bundles — groups of 2-4 congruent, translated paths', () => {
  const svg = circuitSVG({ width: 390, height: 844, density: 1, seed: 'bundle-check' });
  const paths = parsePaths(svg);

  // Two paths are "parallel copies" if their consecutive-point deltas are
  // identical (a rigid translation preserves every segment's dx/dy).
  const shapeKey = (pts) => pts.slice(1).map((p, i) => `${p[0] - pts[i][0]},${p[1] - pts[i][1]}`).join('|');
  const groups = new Map();
  for (const p of paths) {
    const key = shapeKey(p);
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const bundledLines = [...groups.values()].filter((n) => n >= 2).reduce((a, b) => a + b, 0);
  assert.ok(bundledLines / paths.length > 0.5,
    `expected most lines to belong to a bundle of >=2 congruent paths, got ${bundledLines}/${paths.length}`);

  const someBundleOfThreeOrFour = [...groups.values()].some((n) => n === 3 || n === 4);
  assert.ok(someBundleOfThreeOrFour, 'expected at least one bundle of exactly 3 or 4 parallel lines');
});

test('traces cluster toward the left/right margins and leave a clear centre band', () => {
  const width = 856, height = 540;
  const svg = circuitSVG({ width, height, density: 1, seed: 'edge-check' });
  const paths = parsePaths(svg);
  const startXs = paths.map((p) => p[0][0]);

  const centerBandHalf = width * 0.07; // matches the ~14%-of-width hard clear band
  const inCenter = startXs.filter((x) => Math.abs(x - width / 2) < centerBandHalf);
  assert.equal(inCenter.length, 0, 'no trace should start inside the guaranteed centre-clear band');

  const marginZone = width * 0.3;
  const nearEdges = startXs.filter((x) => x < marginZone || x > width - marginZone).length;
  assert.ok(nearEdges / startXs.length > 0.6,
    `expected most traces to start near the margins, got ${nearEdges}/${startXs.length}`);
});

test('lit nodes get a soft glow: a translucent larger circle behind the solid node', () => {
  const svg = circuitSVG({
    width: 200, height: 200, seed: 5, accentColor: '#FF00AA', accentProbability: 1,
  });
  assert.match(svg, /fill-opacity="0.22"/, 'expected a translucent glow layer');
  const glowGroup = svg.match(/<g fill="#FF00AA" fill-opacity="0.22">([\s\S]*?)<\/g>/)[1];
  const solidGroup = svg.match(/<g fill="#FF00AA">([\s\S]*?)<\/g>/)[1];
  const glowCircles = [...glowGroup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
  const solidCircles = [...solidGroup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
  assert.ok(glowCircles.length > 0 && solidCircles.length > 0);
  assert.equal(glowCircles.length, solidCircles.length);
  for (let i = 0; i < glowCircles.length; i++) {
    assert.equal(glowCircles[i][1], solidCircles[i][1], 'glow must sit at the same cx as its node');
    assert.equal(glowCircles[i][2], solidCircles[i][2], 'glow must sit at the same cy as its node');
    assert.ok(Number(glowCircles[i][3]) > Number(solidCircles[i][3]), 'glow radius must exceed the node radius');
  }
});

test('nearly all traces stay dark: lit nodes are a small minority by default', () => {
  const svg = circuitSVG({ width: 400, height: 800, density: 1, seed: 'restraint-check' });
  const darkGroup = svg.match(/<g fill="#2A313B"[^>]*>([\s\S]*?)<\/g>/)[1];
  const litGroup = svg.match(/<g fill="#00B7FF">([\s\S]*?)<\/g>/)[1];
  const countCircles = (s) => (s.match(/<circle/g) || []).length;
  const dark = countCircles(darkGroup);
  const lit = countCircles(litGroup);
  assert.ok(lit > 0, 'expected at least a few lit nodes');
  assert.ok(lit / (dark + lit) < 0.15, `expected lit nodes to be a small minority, got ${lit}/${dark + lit}`);
});

test('baseOpacity controls how faint the unlit traces are', () => {
  const svg = circuitSVG({ width: 200, height: 200, seed: 1, baseOpacity: 0.33 });
  assert.match(svg, /stroke-opacity="0.33"/);
});
