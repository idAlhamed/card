// The circuit-trace background motif shared by the page, the Wallet pass,
// and the print card. Thin orthogonal (horizontal/vertical) traces bend at
// right angles and terminate in round nodes. To read as a real PCB rather
// than scattered lines it has three structural properties, all visible in
// the approved references:
//
//   1. Parallel bundles — most traces travel in groups of 2-4, evenly
//      spaced, turning together at the same points (a translated copy of
//      one "spine" walk, not independent random walks).
//   2. Edge weighting — traces cluster toward the left/right margins and
//      thin out toward the horizontal centre, leaving the middle column
//      clear for whatever content (monogram, type, QR) sits on top.
//   3. Restraint — nearly every trace and node stays a very dark, barely-
//      visible grey; only a handful of nodes are lit in the accent colour,
//      each with a soft glow (layered circles, no SVG filters needed).
//
// Deterministic: a mulberry32 PRNG seeded from `seed` drives every random
// choice, so the same inputs always produce byte-identical SVG — no
// Math.random(), no Date, no I/O.

const DEFAULT_ACCENT = '#00B7FF';
const DEFAULT_DARK = '#2A313B'; // very dark grey — barely visible on matte black, unlit

/** mulberry32: small, fast, deterministic 32-bit PRNG. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes a string seed to a 32-bit int, so callers can pass any string. */
function seedToInt(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function snap(v, step) {
  return Math.round(v / step) * step;
}

/**
 * Samples an x-coordinate biased toward the left/right margins: rand()
 * raised to a power > 1 concentrates mass near 0, so most distances from
 * the nearer edge are small; a coin flip picks which edge. A hard
 * `centerClear` band around the horizontal midpoint is additionally never
 * sampled, guaranteeing real clearance for whatever sits centred on top
 * (monogram, type, QR) rather than merely thinning the average.
 */
function sampleEdgeX(rand, width, power = 2.6, centerClear = 0.14) {
  const halfBand = (centerClear * width) / 2;
  const maxD = Math.max(0, width / 2 - halfBand);
  const d = Math.pow(rand(), power) * maxD;
  return rand() < 0.5 ? d : width - d;
}

/**
 * Generates one orthogonal trace as a random walk of right-angle segments,
 * starting from (x, y). Stops early if it would leave the canvas.
 */
function buildTrace(rand, { x, y, gridStep, width, height, segments }) {
  const points = [{ x, y }];
  let horizontal = rand() < 0.5;
  let cur = { x, y };

  for (let i = 0; i < segments; i++) {
    const steps = 1 + Math.floor(rand() * 3); // 1..3 grid steps long
    const length = gridStep * steps;
    const sign = rand() < 0.5 ? -1 : 1;
    const next = horizontal
      ? { x: cur.x + sign * length, y: cur.y }
      : { x: cur.x, y: cur.y + sign * length };

    if (next.x < 0 || next.x > width || next.y < 0 || next.y > height) break;

    points.push(next);
    cur = next;
    horizontal = !horizontal;
  }
  return points;
}

/** Translates a polyline by a constant vector, clamped to the canvas. */
function translatePoints(points, dx, dy, width, height) {
  return points.map((p) => ({
    x: Math.min(width, Math.max(0, p.x + dx)),
    y: Math.min(height, Math.max(0, p.y + dy)),
  }));
}

function pathFromPoints(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/**
 * Builds one parallel bundle: a "spine" random walk, then 2-4 exact
 * translated copies of it, offset perpendicular to the spine's first
 * segment. Because every copy is a rigid translation of the same walk,
 * they stay a constant distance apart and turn together at every bend —
 * the single strongest "this is a PCB" visual cue.
 */
function buildBundle(rand, { gridStep, width, height, spacing }) {
  const startX = snap(sampleEdgeX(rand, width), gridStep);
  const startY = snap(rand() * height, gridStep);
  const segments = 2 + Math.floor(rand() * 3); // 2..4 segments
  const spine = buildTrace(rand, { x: startX, y: startY, gridStep, width, height, segments });
  if (spine.length < 2) return null;

  const lineCount = 2 + Math.floor(rand() * 3); // 2..4 parallel lines
  const firstHorizontal = spine[0].y === spine[1].y;

  const lines = [];
  for (let k = 0; k < lineCount; k++) {
    const offset = (k - (lineCount - 1) / 2) * spacing;
    const dx = firstHorizontal ? 0 : offset;
    const dy = firstHorizontal ? offset : 0;
    lines.push(translatePoints(spine, dx, dy, width, height));
  }
  return lines;
}

/**
 * Renders the circuit-trace background motif as a self-contained SVG string.
 *
 * @param {object} [opts]
 * @param {number} [opts.width=400]        Canvas width, in local SVG units.
 * @param {number} [opts.height=400]       Canvas height, in local SVG units.
 * @param {number} [opts.density=1]        Relative trace density; scales the
 *                                         total line count with the canvas area.
 * @param {number|string} [opts.seed=1]    Deterministic seed. Any value is
 *                                         hashed to a 32-bit int.
 * @param {string} [opts.accentColor]      Colour for the "lit" nodes and their glow.
 * @param {string} [opts.baseColor]        Colour for traces and unlit nodes.
 * @param {number} [opts.accentProbability=0.05] Fraction of nodes lit accent —
 *                                         deliberately low: a handful of lit
 *                                         points, not a scattering.
 * @param {number} [opts.baseOpacity=0.55] Opacity of traces and unlit nodes,
 *                                         so the unlit tracery stays near-invisible.
 * @param {number} [opts.gridStep=16]      Grid the traces snap to, in local units.
 * @param {number} [opts.strokeWidth=1.2]  Trace stroke width, in local units.
 * @param {string|null} [opts.background=null] Optional solid backing rect colour.
 * @returns {string} A complete `<svg>…</svg>` document.
 */
export function circuitSVG(opts = {}) {
  const {
    width = 400,
    height = 400,
    density = 1,
    seed = 1,
    accentColor = DEFAULT_ACCENT,
    baseColor = DEFAULT_DARK,
    accentProbability = 0.05,
    baseOpacity = 0.55,
    gridStep = 16,
    strokeWidth = 1.2,
    background = null,
  } = opts;

  if (!(width > 0)) throw new RangeError(`circuitSVG: width must be > 0, got ${width}`);
  if (!(height > 0)) throw new RangeError(`circuitSVG: height must be > 0, got ${height}`);
  if (!(density > 0)) throw new RangeError(`circuitSVG: density must be > 0, got ${density}`);

  const rand = mulberry32(seedToInt(seed));

  // Total individual line count scales with canvas area, ~3.5x denser than
  // a naive one-trace-per-cell layout so the wallet strip and page both
  // read as populated circuitry rather than a few faint wanderers.
  const totalLines = Math.max(8, Math.round((density * width * height) / 2500));
  const spacing = Math.max(4, gridStep * 0.6);

  const allLines = [];
  const bundleTarget = totalLines * 0.7; // ~70% of lines come from bundles

  let guard = 0;
  while (allLines.length < bundleTarget && guard < 20000) {
    guard++;
    const bundleLines = buildBundle(rand, { gridStep, width, height, spacing });
    if (!bundleLines) continue;
    for (const pts of bundleLines) allLines.push(pts);
  }

  guard = 0;
  while (allLines.length < totalLines && guard < 20000) {
    guard++;
    const startX = snap(sampleEdgeX(rand, width), gridStep);
    const startY = snap(rand() * height, gridStep);
    const segments = 2 + Math.floor(rand() * 3);
    const pts = buildTrace(rand, { x: startX, y: startY, gridStep, width, height, segments });
    if (pts.length < 2) continue;
    allLines.push(pts);
  }

  const nodeRadius = strokeWidth * 1.8;
  const glowRadius = nodeRadius * 2.6;

  const bg = background
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}" />`
    : '';

  const pathsMarkup = allLines
    .map((pts) => `<path d="${pathFromPoints(pts)}" />`)
    .join('');

  const darkNodes = [];
  const glowNodes = [];
  const litNodes = [];
  for (const pts of allLines) {
    for (const p of [pts[0], pts[pts.length - 1]]) {
      if (rand() < accentProbability) {
        glowNodes.push(`<circle cx="${p.x}" cy="${p.y}" r="${glowRadius}" />`);
        litNodes.push(`<circle cx="${p.x}" cy="${p.y}" r="${nodeRadius}" />`);
      } else {
        darkNodes.push(`<circle cx="${p.x}" cy="${p.y}" r="${nodeRadius}" />`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">` +
    bg +
    `<g fill="none" stroke="${baseColor}" stroke-width="${strokeWidth}" ` +
    `stroke-opacity="${baseOpacity}" stroke-linecap="round" stroke-linejoin="round">${pathsMarkup}</g>` +
    `<g fill="${baseColor}" fill-opacity="${baseOpacity}">${darkNodes.join('')}</g>` +
    `<g fill="${accentColor}" fill-opacity="0.22">${glowNodes.join('')}</g>` +
    `<g fill="${accentColor}">${litNodes.join('')}</g>` +
    `</svg>`
  );
}
