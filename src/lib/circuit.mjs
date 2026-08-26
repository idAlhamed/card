// The circuit-trace background motif shared by the page, the Wallet pass,
// and the print card. Thin orthogonal (horizontal/vertical) traces bend at
// right angles and terminate in round nodes; most nodes are a very dark
// grey, a few are lit in the accent blue. Deterministic: a mulberry32 PRNG
// seeded from `seed` drives every random choice, so the same inputs always
// produce byte-identical SVG — no Math.random(), no Date, no I/O.

const DEFAULT_ACCENT = '#00B7FF';
const DEFAULT_DARK = '#20262E'; // very dark grey — visible on matte black, quiet unlit

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

function pathFromPoints(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/**
 * Renders the circuit-trace background motif as a self-contained SVG string.
 *
 * @param {object} [opts]
 * @param {number} [opts.width=400]        Canvas width, in local SVG units.
 * @param {number} [opts.height=400]       Canvas height, in local SVG units.
 * @param {number} [opts.density=1]        Relative trace density; scales the
 *                                         trace count with the canvas area.
 * @param {number|string} [opts.seed=1]    Deterministic seed. Any value is
 *                                         hashed to a 32-bit int.
 * @param {string} [opts.accentColor]      Colour for the "lit" nodes.
 * @param {string} [opts.baseColor]        Colour for traces and unlit nodes.
 * @param {number} [opts.accentProbability=0.15] Fraction of nodes lit accent.
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
    accentProbability = 0.15,
    gridStep = 16,
    strokeWidth = 1.2,
    background = null,
  } = opts;

  if (!(width > 0)) throw new RangeError(`circuitSVG: width must be > 0, got ${width}`);
  if (!(height > 0)) throw new RangeError(`circuitSVG: height must be > 0, got ${height}`);
  if (!(density > 0)) throw new RangeError(`circuitSVG: density must be > 0, got ${density}`);

  const rand = mulberry32(seedToInt(seed));

  // Trace count scales with canvas area so the motif fills gracefully at any
  // aspect ratio — a 375x123 Wallet strip gets fewer traces than an 856x540
  // card, both at the same visual density.
  const traceCount = Math.max(4, Math.round((density * (width * height)) / 9000));

  const traces = [];
  const nodeRadiusTerminal = strokeWidth * 1.8;

  for (let i = 0; i < traceCount; i++) {
    const startX = snap(rand() * width, gridStep);
    const startY = snap(rand() * height, gridStep);
    const segments = 2 + Math.floor(rand() * 3); // 2..4 segments
    const points = buildTrace(rand, { x: startX, y: startY, gridStep, width, height, segments });
    if (points.length < 2) continue; // trace immediately hit the edge; skip it

    const first = points[0];
    const last = points[points.length - 1];
    const litFirst = rand() < accentProbability;
    const litLast = rand() < accentProbability;

    traces.push({
      d: pathFromPoints(points),
      nodes: [
        { x: first.x, y: first.y, lit: litFirst },
        { x: last.x, y: last.y, lit: litLast },
      ],
    });
  }

  const bg = background
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}" />`
    : '';

  const pathsMarkup = traces
    .map((t) => `<path d="${t.d}" />`)
    .join('');

  const darkNodes = [];
  const litNodes = [];
  for (const t of traces) {
    for (const n of t.nodes) {
      (n.lit ? litNodes : darkNodes).push(`<circle cx="${n.x}" cy="${n.y}" r="${nodeRadiusTerminal}" />`);
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">` +
    bg +
    `<g fill="none" stroke="${baseColor}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${pathsMarkup}</g>` +
    `<g fill="${baseColor}">${darkNodes.join('')}</g>` +
    `<g fill="${accentColor}">${litNodes.join('')}</g>` +
    `</svg>`
  );
}
