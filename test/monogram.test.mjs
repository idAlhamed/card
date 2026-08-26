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

// --- Structural regression tests (redesign-foundations round 1 feedback:
// the A must not read as a house) ---------------------------------------

function parsePaths(svg) {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => {
    const points = m[1].match(/[ML]-?[\d.]+,-?[\d.]+/g)
      .map((tok) => tok.slice(1).split(',').map(Number));
    return points;
  });
}

function parseCircles(svg) {
  return [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
}

test('exactly six strokes: two A legs + A crossbar, two H verticals + H crossbar', () => {
  const paths = parsePaths(monogramSVG());
  assert.equal(paths.length, 6);
});

test('the A has a crossbar connecting its two legs (not open, not a closed floor)', () => {
  const paths = parsePaths(monogramSVG());
  // The two A legs share their first point (the apex).
  const apex = paths[0][0];
  const legs = paths.filter((p) => p[0][0] === apex[0] && p[0][1] === apex[1]);
  assert.equal(legs.length, 2, 'both A legs must start at a shared apex point');

  // A crossbar is a two-point horizontal path (constant y) whose endpoints
  // sit strictly between the apex height and the legs' lowest point — i.e.
  // it is not a floor joining the two leg bottoms.
  const legBottoms = legs.map((p) => p[p.length - 1]);
  const crossbar = paths.find((p) => p.length === 2 && p[0][1] === p[1][1]
    && p[0][1] !== apex[1] && !legBottoms.some((b) => b[1] === p[0][1]));
  assert.ok(crossbar, 'expected a horizontal crossbar path distinct from the leg bottoms');
});

test('the A legs are diagonal (splay outward), not vertical walls', () => {
  const paths = parsePaths(monogramSVG());
  const apex = paths[0][0];
  const legs = paths.filter((p) => p[0][0] === apex[0] && p[0][1] === apex[1]);
  for (const leg of legs) {
    const [, knee] = leg; // first segment: apex -> knee
    assert.notEqual(knee[0], apex[0], 'the apex-to-knee segment must move horizontally (diagonal), not stay vertical');
  }
});

test('the A is open at the base — no path joins the two leg bottoms into a floor', () => {
  const paths = parsePaths(monogramSVG());
  const apex = paths[0][0];
  const legs = paths.filter((p) => p[0][0] === apex[0] && p[0][1] === apex[1]);
  const bottoms = legs.map((p) => p[p.length - 1]);
  assert.equal(bottoms.length, 2);
  const [left, right] = bottoms;
  const floor = paths.find((p) => p.length === 2
    && p.some((pt) => pt[0] === left[0] && pt[1] === left[1])
    && p.some((pt) => pt[0] === right[0] && pt[1] === right[1]));
  assert.equal(floor, undefined, 'a path directly connecting both leg-bottom terminals would close the A into a house');
});

test('default stroke width is about 1/40 of the mark height (delicate tracery, not a pictogram)', () => {
  const svg = monogramSVG();
  const [, , vbH] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const strokeWidth = Number(svg.match(/stroke-width="([\d.]+)"/)[1]);
  assert.ok(Math.abs(strokeWidth / Number(vbH) - 1 / 40) < 0.005,
    `expected strokeWidth/height ~ 1/40, got ${strokeWidth}/${vbH}`);
});

test('node diameter is roughly 3x the stroke width, not 8x', () => {
  const svg = monogramSVG();
  const strokeWidth = Number(svg.match(/stroke-width="([\d.]+)"/)[1]);
  const circles = parseCircles(svg);
  assert.ok(circles.length > 0);
  for (const c of circles) {
    const diameterRatio = (c.r * 2) / strokeWidth;
    assert.ok(diameterRatio >= 2 && diameterRatio <= 4,
      `node diameter should be ~3x stroke width, got ${diameterRatio}x`);
  }
});

test('renders legibly at 40px, 80px and 400px (smoke check: real pixels present)', async () => {
  for (const size of [40, 80, 400]) {
    const svg = monogramSVG({ size, color: '#00B7FF', background: '#0A0A0C' });
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    let litPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Any pixel noticeably brighter than the near-black background counts as "lit".
      if (data[i + 2] > 60) litPixels++; // blue channel, since the accent is blue
    }
    assert.ok(litPixels > 0, `expected lit pixels at size ${size}`);
    assert.equal(info.width, size);
  }
});
