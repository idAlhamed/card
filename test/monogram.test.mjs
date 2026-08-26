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

test('the colour parameter controls every trace and ring-node stroke', () => {
  const svg = monogramSVG({ color: '#FF00AA' });
  // Traces and ring nodes are stroked in the requested colour.
  assert.match(svg, /stroke="#FF00AA"/);
  assert.doesNotMatch(svg, /stroke="#00B7FF"/); // default colour must not leak in
});

test('ring nodes are hollow — stroked circles, never filled with the accent colour', () => {
  const svg = monogramSVG({ color: '#FF00AA' });
  // The ring-node group is stroke-only (fill="none") and its <circle>
  // elements carry no fill attribute of their own, so whatever sits behind
  // the mark shows through each ring's centre instead of a filled dot.
  const ringGroup = svg.match(/<g fill="none" stroke="[^"]+" stroke-width="[^"]+" stroke-linecap="round">(.*?)<\/g>/);
  assert.ok(ringGroup, 'expected a dedicated stroke-only group for ring nodes');
  const circles = [...ringGroup[1].matchAll(/<circle[^>]*>/g)];
  assert.ok(circles.length > 5, 'expected multiple ring nodes');
  for (const [circle] of circles) {
    assert.doesNotMatch(circle, /fill=/, `ring node circle must not carry its own fill: ${circle}`);
  }
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

// --- Structural regression tests (redesign-foundations round 2 feedback:
// reproduce the approved mark's layered tracery — nested parallel contours
// and hollow ring nodes — rather than a simplified single-stroke pictogram)
// -------------------------------------------------------------------------

function parsePaths(svg) {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => {
    const closed = /Z\s*$/.test(m[1]);
    const points = m[1].match(/[ML]-?[\d.]+,-?[\d.]+/g)
      .map((tok) => tok.slice(1).split(',').map(Number));
    return { points, closed };
  });
}

function parseCircles(svg) {
  return [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"[^>]*>/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]), tag: m[0] }));
}

function viewWidth(svg) {
  return Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]);
}

test('the A is built from three nested contours sharing one apex axis, staggered depth', () => {
  const svg = monogramSVG();
  const vw = viewWidth(svg);
  const paths = parsePaths(svg);
  // The A occupies roughly the left half of the mark's coordinate space.
  const aPaths = paths.filter((p) => p.points.every(([x]) => x < vw * 0.55) && p.points.length === 3);
  assert.equal(aPaths.length, 3, 'expected exactly three 3-point A contours (outer, mid, inner)');

  // Each contour's apex is its topmost (smallest-y) point. All three must
  // share the same x (they are true parallel offsets of one V), and their
  // apex height must strictly increase outer -> mid -> inner (each nested
  // contour sits progressively lower/further inset, as a real perpendicular
  // offset of a V produces).
  const apexes = aPaths
    .map((p) => p.points.reduce((min, pt) => (pt[1] < min[1] ? pt : min)))
    .sort((a, b) => a[1] - b[1]);
  const [outerApex, midApex, innerApex] = apexes;
  assert.equal(outerApex[0], midApex[0], 'outer and mid contour apexes must share the same x-axis');
  assert.equal(outerApex[0], innerApex[0], 'outer and inner contour apexes must share the same x-axis');
  assert.ok(outerApex[1] < midApex[1] && midApex[1] < innerApex[1],
    'apex height must strictly increase from outer to inner contour');
});

test('the innermost A contour closes into a triangle — its crossbar is the closing edge', () => {
  const paths = parsePaths(monogramSVG());
  const closed = paths.filter((p) => p.closed);
  assert.equal(closed.length, 1, 'expected exactly one closed A contour (the classic A counter)');
  const [triangle] = closed;
  assert.equal(triangle.points.length, 3);
  const [left, apex, right] = triangle.points;
  assert.equal(left[1], right[1], 'the closing edge (crossbar) must be horizontal');
  assert.notEqual(left[1], apex[1], 'the crossbar sits below the apex, not through it');
});

test('the outer and mid A contours stay open — no path joins their leg-bottoms into a floor', () => {
  const svg = monogramSVG();
  const vw = viewWidth(svg);
  const paths = parsePaths(svg);
  const aPaths = paths.filter((p) => p.points.every(([x]) => x < vw * 0.55) && p.points.length === 3 && !p.closed);
  assert.equal(aPaths.length, 2, 'expected two open A contours (outer + mid)');
  for (const contour of aPaths) {
    const bottoms = [contour.points[0], contour.points[2]];
    // A "floor" would be a separate 2-point path directly connecting the
    // two bottom terminals — not the contour's own apex-spanning path.
    const floor = paths.find((p) => p !== contour && p.points.length === 2
      && p.points.some((pt) => pt[0] === bottoms[0][0] && pt[1] === bottoms[0][1])
      && p.points.some((pt) => pt[0] === bottoms[1][0] && pt[1] === bottoms[1][1]));
    assert.equal(floor, undefined,
      'a path directly joining both leg-bottom terminals would close the contour into a house');
  }
});

test('the A legs are diagonal (splay outward), not vertical walls', () => {
  const svg = monogramSVG();
  const vw = viewWidth(svg);
  const paths = parsePaths(svg);
  const aPaths = paths.filter((p) => p.points.every(([x]) => x < vw * 0.55) && p.points.length === 3);
  for (const { points } of aPaths) {
    const [bottomLeft, apex, bottomRight] = points;
    assert.notEqual(apex[0], bottomLeft[0], 'left leg must move horizontally as well as vertically');
    assert.notEqual(apex[0], bottomRight[0], 'right leg must move horizontally as well as vertically');
  }
});

// Long constant-x paths are the H's stem traces; the short ones near the
// crossbar are floating stubs, not stems.
function hStemVerticals(svg) {
  const vw = viewWidth(svg);
  const paths = parsePaths(svg);
  return paths.filter((p) => p.points.length === 2
    && p.points[0][0] === p.points[1][0] // constant x = vertical
    && p.points[0][0] >= vw * 0.45
    && Math.abs(p.points[1][1] - p.points[0][1]) > 20); // stems, not stubs
}

test('the H has six distinct vertical stem traces: doubled stems plus thin flanking traces', () => {
  const svg = monogramSVG();
  const verticals = hStemVerticals(svg);
  const xs = verticals.map((p) => p.points[0][0]);
  assert.equal(verticals.length, 6, 'expected six vertical H stem traces (2 outer + 2 inner + 2 flank)');
  assert.equal(new Set(xs).size, 6, 'all six stem traces must sit at distinct x positions');
});

test('the H stems overshoot the crossbar at staggered (non-aligned) heights', () => {
  const svg = monogramSVG();
  const verticals = hStemVerticals(svg);
  const tops = new Set(verticals.map((p) => Math.min(p.points[0][1], p.points[1][1])));
  const bottoms = new Set(verticals.map((p) => Math.max(p.points[0][1], p.points[1][1])));
  assert.ok(tops.size > 1, 'stem tops must be staggered, not aligned');
  assert.ok(bottoms.size > 1, 'stem bottoms must be staggered, not aligned');
});

test('the H crossbar carries two ring nodes: one centred, one off-centre', () => {
  const svg = monogramSVG();
  const vw = viewWidth(svg);
  const paths = parsePaths(svg);
  // The main crossbar: a long horizontal 2-point path spanning the H's
  // inner stem pair.
  const mainCrossbar = paths.find((p) => p.points.length === 2
    && p.points[0][1] === p.points[1][1]
    && p.points[0][0] >= vw * 0.45
    && Math.abs(p.points[1][0] - p.points[0][0]) > 20);
  assert.ok(mainCrossbar, 'expected a long horizontal H crossbar trace');
  const crossbarY = mainCrossbar.points[0][1];

  const circles = parseCircles(svg).filter((c) => c.x >= vw * 0.45);
  const crossbarRings = circles.filter((c) => Math.abs(c.y - crossbarY) < 15);
  assert.ok(crossbarRings.length >= 2, 'expected at least two ring nodes near the H crossbar');
  const xs = new Set(crossbarRings.map((c) => c.x));
  assert.ok(xs.size >= 2, 'crossbar ring nodes must sit at distinct x positions (centre + off-centre)');
});

// Weight-tier groups are marked with an HTML comment immediately before
// their <g>, so tests can pull each tier's own stroke-width rather than
// grabbing whichever `stroke-width=` happens to appear first in the markup.
function tierStrokeWidth(svg, marker) {
  const re = new RegExp(`<!-- ${marker} --><g[^>]*stroke-width="([\\d.]+)"`);
  const m = svg.match(re);
  assert.ok(m, `expected a "${marker}" group with its own stroke-width`);
  return Number(m[1]);
}

test('ring node radii are restrained to a small, varied set of sizes (terminals larger than junctions)', () => {
  const svg = monogramSVG();
  const primaryWidth = tierStrokeWidth(svg, 'primary strokes');
  const ringGroup = svg.match(/<!-- ring nodes --><g[^>]*>(.*?)<\/g>/)[1];
  const radii = [...ringGroup.matchAll(/r="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(radii.length > 10, 'expected many ring nodes across both letters');
  const distinct = new Set(radii);
  assert.ok(distinct.size >= 3 && distinct.size <= 5,
    `expected a small, restrained set of ring sizes, got ${distinct.size}`);
  for (const r of radii) {
    // Radii are sized relative to the PRIMARY (letter-forming) stroke
    // weight, since that's the weight callers actually control via
    // opts.strokeWidth.
    const ratio = (r * 2) / primaryWidth;
    assert.ok(ratio >= 1 && ratio <= 5, `ring diameter should stay within a legible range, got ${ratio}x primary stroke width`);
  }
});

test('default primary stroke width is fine tracery — about 1/70 of the mark height', () => {
  const svg = monogramSVG();
  const [, , vbH] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const primaryWidth = tierStrokeWidth(svg, 'primary strokes');
  assert.ok(Math.abs(primaryWidth / Number(vbH) - 1 / 70) < 0.005,
    `expected primary strokeWidth/height ~ 1/70, got ${primaryWidth}/${vbH}`);
});

test('secondary/ornamental strokes and ring nodes are visibly lighter than the primary letterform strokes', () => {
  // This is the weight hierarchy that keeps the mark legible at small
  // sizes: the strokes that actually form "A" and "H" must dominate, with
  // detail tracery and ring outlines receding rather than competing.
  const svg = monogramSVG();
  const primaryWidth = tierStrokeWidth(svg, 'primary strokes');
  const secondaryWidth = tierStrokeWidth(svg, 'secondary strokes');
  const ringWidth = tierStrokeWidth(svg, 'ring nodes');
  assert.ok(secondaryWidth < primaryWidth, 'secondary strokes must be thinner than primary strokes');
  assert.ok(ringWidth < primaryWidth, 'ring node outlines must be thinner than primary strokes');
  assert.ok(secondaryWidth <= primaryWidth * 0.7, 'secondary strokes must be meaningfully lighter, not just marginally');
});

test('the H main crossbar spans the full width between the two outer stems, at primary weight', () => {
  const svg = monogramSVG();
  const vw = viewWidth(svg);
  const primaryGroup = svg.match(/<!-- primary strokes --><g[^>]*>(.*?)<\/g>/)[1];
  const primaryPaths = parsePaths(`<g>${primaryGroup}</g>`);

  const stemVerticals = primaryPaths.filter((p) => p.points.length === 2
    && p.points[0][0] === p.points[1][0] && p.points[0][0] >= vw * 0.45);
  assert.equal(stemVerticals.length, 4, 'expected the four main H stem traces at primary weight');
  const stemXs = stemVerticals.map((p) => p.points[0][0]);
  const leftmost = Math.min(...stemXs);
  const rightmost = Math.max(...stemXs);

  const mainCrossbar = primaryPaths.find((p) => p.points.length === 2
    && p.points[0][1] === p.points[1][1] && p.points[0][0] >= vw * 0.45);
  assert.ok(mainCrossbar, 'expected the main H crossbar in the primary-weight group');
  const crossXs = [mainCrossbar.points[0][0], mainCrossbar.points[1][0]];
  assert.equal(Math.min(...crossXs), leftmost, 'crossbar must reach the leftmost (outer) stem');
  assert.equal(Math.max(...crossXs), rightmost, 'crossbar must reach the rightmost (outer) stem');
});

test('a few nodes carry a soft outer glow, rendered behind the ring (not replacing it)', () => {
  const svg = monogramSVG();
  assert.match(svg, /feGaussianBlur/, 'expected a blur filter for the glow accents');
  const glowCircles = [...svg.matchAll(/<circle[^>]*filter="url\(#[^)]+\)"[^>]*>/g)];
  assert.ok(glowCircles.length >= 1 && glowCircles.length <= 4,
    'glow should be restrained to a few nodes, not applied everywhere');
});

test('renders legibly at 40px, 80px, 200px and 400px (smoke check: real pixels present)', async () => {
  for (const size of [40, 80, 200, 400]) {
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
