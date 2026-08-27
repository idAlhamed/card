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

test('unlit traces render in the given base colour', () => {
  const svg = circuitSVG({
    width: 200, height: 200, seed: 5, baseColor: '#111111',
    accentProbability: 0, // force every trace unlit, so baseColor definitely appears
  });
  assert.match(svg, /stroke="#111111"/);
});

test('lit traces and their terminal nodes render in the given accent colour', () => {
  const svg = circuitSVG({
    width: 200, height: 200, seed: 5, accentColor: '#FF00AA',
    accentProbability: 1, // force every trace lit, to guarantee the accent colour appears
  });
  assert.match(svg, /stroke="#FF00AA"/);
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

// --- Structural regression tests (redesign-foundations round 2 feedback:
// against the approved references, the motif must show directional
// left/right flow, a horizontal -> 45deg-step -> horizontal -> node
// signature with NO 90-degree corners, regular vertical banding, a
// restrained-but-present lit-trace accent, and varied terminal-node
// styling — not sparse, uniform, orthogonal scatter.) ------------------

function parsePaths(svg) {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) =>
    m[1].match(/[ML]-?[\d.]+,-?[\d.]+/g).map((tok) => tok.slice(1).split(',').map(Number)));
}

test('field is substantially denser than the pre-redesign baseline', () => {
  const width = 390, height = 844, density = 1;
  const svg = circuitSVG({ width, height, density, seed: 'density-check' });
  const pathCount = parsePaths(svg).length;
  // The original (too-sparse) implementation produced ~131 lines at this
  // size; the reference reads as a busy, stacked field, not a scatter.
  assert.ok(pathCount > 40, `expected a busy field, got only ${pathCount} traces`);
});

test('every trace segment is horizontal or a true 45-degree diagonal — no 90-degree corners', () => {
  const svg = circuitSVG({ width: 390, height: 844, density: 1, seed: 'angle-check' });
  const paths = parsePaths(svg);
  assert.ok(paths.length > 20);

  let sawDiagonal = false;
  for (const pts of paths) {
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      const isHorizontal = dy === 0 && dx !== 0;
      const isDiagonal45 = dx !== 0 && Math.abs(dx) === Math.abs(dy);
      assert.ok(isHorizontal || isDiagonal45,
        `segment (${dx},${dy}) is neither horizontal nor a true 45-degree diagonal — a 90-degree corner`);
      if (isDiagonal45) sawDiagonal = true;
    }
  }
  assert.ok(sawDiagonal, 'expected at least one 45-degree diagonal step somewhere in the field');
});

test('the signature move: horizontal, 45-degree step, horizontal, terminal node — on nearly every trace', () => {
  const svg = circuitSVG({ width: 390, height: 844, density: 1, seed: 'signature-check' });
  const paths = parsePaths(svg);
  const withDiagonal = paths.filter((pts) => {
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      if (dx !== 0 && Math.abs(dx) === Math.abs(dy)) return true;
    }
    return false;
  });
  assert.ok(withDiagonal.length / paths.length > 0.85,
    `expected nearly every trace to contain the horizontal/45deg-step/horizontal move, got ${withDiagonal.length}/${paths.length}`);

  const withTwoSteps = paths.filter((pts) => {
    let diagonals = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      if (dx !== 0 && Math.abs(dx) === Math.abs(dy)) diagonals++;
    }
    return diagonals >= 2;
  });
  assert.ok(withTwoSteps.length > 0, 'expected at least some traces to take two diagonal steps');
});

test('traces flow directionally inward from the edge they are anchored to', () => {
  const width = 856, height = 540;
  const svg = circuitSVG({ width, height, density: 1, seed: 'flow-check' });
  const paths = parsePaths(svg);

  const leftTraces = paths.filter((p) => p[0][0] === 0);
  const rightTraces = paths.filter((p) => p[0][0] === width);
  assert.ok(leftTraces.length > 0 && rightTraces.length > 0,
    'expected traces anchored to both the left edge (x=0) and the right edge (x=width)');

  for (const pts of leftTraces) {
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i][0] >= pts[i - 1][0], 'left-field trace must travel left-to-right (monotonic x)');
    }
  }
  for (const pts of rightTraces) {
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i][0] <= pts[i - 1][0], 'right-field trace must travel right-to-left (monotonic x)');
    }
  }
});

test('traces stack in regular vertical bands, not random scatter', () => {
  const width = 856, height = 540;
  const svg = circuitSVG({ width, height, density: 1, seed: 'band-check' });
  const paths = parsePaths(svg);
  const leftYs = paths.filter((p) => p[0][0] === 0).map((p) => p[0][1]).sort((a, b) => a - b);
  assert.ok(leftYs.length > 3);

  const gaps = leftYs.slice(1).map((y, i) => y - leftYs[i]);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  // Regular banding means row-to-row spacing stays close to the mean, not
  // wildly scattered (which would produce a much larger relative spread).
  const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - meanGap)));
  assert.ok(maxDeviation < meanGap * 1.5,
    `expected fairly even row spacing, mean gap ${meanGap}, max deviation ${maxDeviation}`);
});

test('traces never enter the centre-clear band around the horizontal midpoint', () => {
  const width = 856, height = 540;
  const svg = circuitSVG({ width, height, density: 1, seed: 'center-check' });
  const paths = parsePaths(svg);
  const centerBandHalf = width * 0.07; // matches the 14%-of-width hard clear band
  for (const pts of paths) {
    for (const [x] of pts) {
      assert.ok(Math.abs(x - width / 2) >= centerBandHalf,
        `point at x=${x} falls inside the guaranteed centre-clear band`);
    }
  }
});

test('roughly 15-20% of traces are lit end-to-end in the accent colour', () => {
  const svg = circuitSVG({ width: 390, height: 844, density: 1, seed: 'lit-ratio-check' });
  const total = parsePaths(svg).length;
  const litGroup = svg.match(/<g fill="none" stroke="#00B7FF"[^>]*>([\s\S]*?)<\/g>/)[1];
  const lit = (litGroup.match(/<path /g) || []).length;
  const ratio = lit / total;
  assert.ok(ratio > 0.08 && ratio < 0.3, `expected roughly 15-20% of traces lit, got ${(ratio * 100).toFixed(1)}%`);
});

test('lit terminal nodes get a soft glow: a translucent larger circle behind the solid dot', () => {
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

test('most terminal nodes are hollow rings (unfilled) with varied radii', () => {
  const svg = circuitSVG({ width: 390, height: 844, density: 1, seed: 'hollow-check', accentProbability: 0 });
  // Both the unlit-trace-path group and the hollow-node group share the
  // "fill=none stroke=baseColor" prefix; pick the one that actually holds
  // <circle> elements rather than <path> elements.
  const groups = [...svg.matchAll(/<g fill="none" stroke="#4B5563"[^>]*>([\s\S]*?)<\/g>/g)].map((m) => m[1]);
  const hollowGroup = groups.find((g) => g.includes('<circle'));
  assert.ok(hollowGroup, 'expected a hollow-node group with base-coloured circles');
  const radii = [...hollowGroup.matchAll(/<circle cx="[\d.]+" cy="[\d.]+" r="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(radii.length > 10, 'expected many hollow terminal nodes');
  const distinct = new Set(radii.map((r) => r.toFixed(2)));
  assert.ok(distinct.size > 3, `expected noticeably varied node radii, got ${distinct.size} distinct values`);
  assert.ok(Math.max(...radii) / Math.min(...radii) > 1.5, 'expected a meaningful spread between smallest and largest node');
});

test('a few unlit-trace terminal nodes are hollow rings in the accent colour', () => {
  const svg = circuitSVG({ width: 390, height: 844, density: 1, seed: 'hollow-accent-check', accentProbability: 0 });
  const hollowAccentGroup = svg.match(/<g fill="none" stroke="#00B7FF" stroke-width="[\d.]+" stroke-opacity="1">([\s\S]*?)<\/g>/)[1];
  const count = (hollowAccentGroup.match(/<circle/g) || []).length;
  assert.ok(count > 0, 'expected at least one hollow accent-coloured node among unlit traces');
});

test('baseOpacity controls how visible the unlit traces are', () => {
  const svg = circuitSVG({ width: 200, height: 200, seed: 1, baseOpacity: 0.33 });
  assert.match(svg, /stroke-opacity="0.33"/);
});

test('unlit traces default to a mid-dark grey that reads clearly, not near-invisible', () => {
  const svg = circuitSVG({ width: 200, height: 200, seed: 1 });
  assert.match(svg, /stroke="#4B5563"/);
  assert.match(svg, /stroke-opacity="0\.7"/);
});
