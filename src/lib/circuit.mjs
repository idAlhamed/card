// The circuit-trace background motif shared by the page and the Wallet
// pass. Rebuilt against the client's approved references
// (cropped from preview/Apple wallet update.png and
// preview/Digital page update.png, both retained as the approved references).
// The reference has one strong, consistent signature, reproduced here:
//
//   1. Directional flow — every trace enters from the panel edge and
//      travels inward. Traces anchored to the left half of the canvas run
//      left-to-right; traces anchored to the right half run right-to-left
//      (a mirror image of the same construction). Nothing wanders.
//   2. The signature move — horizontal, then a 45-degree diagonal step,
//      then horizontal again, ending at a terminal node. Some traces take
//      two such steps. There are NO 90-degree corners: every segment is
//      either perfectly horizontal or a true 45-degree diagonal (dx===dy).
//   3. Regular vertical banding — traces stack in evenly spaced rows, like
//      a bus, rather than being scattered at random heights.
//   4. Restraint with real visibility — most traces render in a mid-dark
//      grey, clearly readable against the black (not near-invisible), and
//      a minority (~15-20%) are lit end-to-end in the accent blue and
//      terminate in a filled, glowing dot.
//   5. Terminal-node variety — most nodes are hollow rings (dark centre,
//      grey stroke) in varied radii; a few are hollow rings in accent
//      blue; lit traces end in filled glowing accent dots.
//   6. Centre-clear — traces never enter a band around the horizontal
//      midpoint, so content placed on top (monogram, type, QR) stays
//      legible; reach is also biased shorter on average, so the field
//      thins out approaching that band rather than stopping abruptly at
//      a uniform depth.
//
// Deterministic: a mulberry32 PRNG seeded from `seed` drives every random
// choice, so the same inputs always produce byte-identical SVG — no
// Math.random(), no Date, no I/O.

const DEFAULT_ACCENT = '#00B7FF';
const DEFAULT_BASE = '#4B5563'; // mid-dark slate grey — clearly visible "etched metal", not near-invisible

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
 * Builds one trace as a sequence of points in *local* coordinates, where
 * x=0 is the panel edge and x increases inward. Every segment is either
 * horizontal (dy===0) or a true 45-degree diagonal (|dx|===|dy|) — the
 * "horizontal, step, horizontal, node" signature move, with the option of
 * a second step. `reach` is the maximum inward x the trace may reach
 * (already clamped clear of the centre band by the caller).
 */
function buildFlowTrace(rand, { y, gridStep, reach }) {
  const minLeg = gridStep * 1.25;
  const diagMin = gridStep * 0.6;
  const perStepMin = minLeg + diagMin; // one horizontal leg + its diagonal step
  const minRequired = perStepMin + minLeg; // + the final horizontal leg to the node

  // Too little room for a diagonal step at all: a single short horizontal
  // stub straight to a node. Usually only happens on extreme aspect ratios,
  // but also on a caller-supplied `reach` tight enough that even one grid
  // unit doesn't fit (a narrow contentClearX margin) — `reach` is a hard
  // cap from the caller (kept clear of real content), so it must win over
  // the gridStep floor, never the other way around.
  if (reach < minRequired) {
    return [{ x: 0, y }, { x: Math.max(0, reach), y }];
  }

  const twoSteps = rand() < 0.35 && reach > perStepMin * 2 + minLeg;
  const stepCount = twoSteps ? 2 : 1;

  const points = [{ x: 0, y }];
  let x = 0;
  let cy = y;
  let remaining = reach;

  for (let i = 0; i < stepCount; i++) {
    const stepsLeftAfterThis = stepCount - i - 1;
    // Room that must stay reserved for any later step(s), this step's own
    // diagonal, and the mandatory final horizontal leg — guarantees a
    // diagonal always fits, so every trace gets its signature step.
    const reserve = stepsLeftAfterThis * perStepMin + diagMin + minLeg;
    const room = Math.max(minLeg, remaining - reserve);
    const frac = i === 0 && twoSteps ? 0.3 + rand() * 0.25 : 0.45 + rand() * 0.35;
    let leg = snap(minLeg + (room - minLeg) * frac, gridStep / 2);
    leg = Math.max(minLeg, Math.min(leg, remaining - reserve));
    x += leg;
    remaining -= leg;
    points.push({ x, y: cy });

    const diagRoom = remaining - minLeg - stepsLeftAfterThis * perStepMin;
    const diagMax = Math.max(diagMin, Math.min(gridStep * 1.7, diagRoom));
    const diag = snap(diagMin + rand() * (diagMax - diagMin), gridStep / 4);
    const dir = rand() < 0.5 ? -1 : 1;
    x += diag;
    cy += dir * diag;
    remaining -= diag;
    points.push({ x, y: cy });
  }

  const finalLeg = Math.max(gridStep, remaining);
  x += finalLeg;
  points.push({ x, y: cy });

  return points;
}

/** Mirrors a local-coordinate trace (x=0 at the edge, growing inward) onto
 *  the right half of the canvas: x -> width - x. Flow direction is
 *  preserved (still edge-to-interior), just pointing the other way. */
function mirrorTrace(points, width) {
  return points.map((p) => ({ x: width - p.x, y: p.y }));
}

function pathFromPoints(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/**
 * Builds one edge field (all traces anchored to one side) as rows of
 * evenly spaced traces flowing inward. Row spacing is regular (a "bus"),
 * with light jitter so it doesn't look mechanically perfect. Each trace's
 * reach is independently sampled below the field's max reach, biased
 * toward shorter, so the field thins out approaching the centre-clear
 * band rather than every trace stopping at the same depth.
 */
function buildEdgeField(rand, { width, height, gridStep, density, maxReach }) {
  const rowStep = Math.max(gridStep * 0.75, (gridStep * 1.4) / density);
  const rowCount = Math.max(3, Math.round(height / rowStep));

  const traces = [];
  for (let i = 0; i < rowCount; i++) {
    if (rand() < 0.05) continue; // occasional skipped row keeps it from feeling mechanical
    const jitter = (rand() - 0.5) * rowStep * 0.3;
    // Snapped to whole units: keeps every later +diag/-diag addition and
    // subtraction exact in floating point (no accumulated epsilon drift
    // that would make a true 45-degree diagonal fail a dx===dy check).
    const y = snap(Math.min(height, Math.max(0, (i + 0.5) * rowStep + jitter)), 1);
    // gridStep*3 is a "don't bother with a barely-there trace" floor for the
    // typical case where maxReach is plentiful; it must never push the
    // sampled reach past maxReach itself, which is a hard cap from the
    // caller (kept clear of real content when contentClearX is in play).
    const reach = Math.min(maxReach, Math.max(gridStep * 3, maxReach * (0.35 + Math.pow(rand(), 1.6) * 0.65)));
    const points = buildFlowTrace(rand, { y, gridStep, reach });
    traces.push(points);
  }
  return traces;
}

/**
 * Renders the circuit-trace background motif as a self-contained SVG string.
 *
 * @param {object} [opts]
 * @param {number} [opts.width=400]        Canvas width, in local SVG units.
 * @param {number} [opts.height=400]       Canvas height, in local SVG units.
 * @param {number} [opts.density=1]        Relative trace density; scales
 *                                         row count (and so total trace
 *                                         count) with the canvas.
 * @param {number|string} [opts.seed=1]    Deterministic seed. Any value is
 *                                         hashed to a 32-bit int.
 * @param {string} [opts.accentColor]      Colour for lit traces/nodes and their glow.
 * @param {string} [opts.baseColor]        Colour for unlit traces and hollow nodes.
 * @param {number} [opts.accentProbability=0.17] Fraction of traces lit end-to-end
 *                                         in the accent colour (~15-20% per spec).
 * @param {number} [opts.baseOpacity=0.7]  Opacity of unlit traces — a mid-dark
 *                                         grey that reads clearly, not near-invisible.
 * @param {number} [opts.gridStep=16]      Grid unit traces snap lengths to,
 *                                         in local units; also the base row spacing.
 * @param {number} [opts.strokeWidth=1.2]  Trace stroke width, in local units.
 * @param {string|null} [opts.background=null] Optional solid backing rect colour.
 * @param {[number, number]|null} [opts.contentClearX=null] Explicit hard-clear
 *                                         x-range, in local units, e.g. [x0, x1].
 *                                         When given, this — not `centerClear` —
 *                                         defines the exclusion zone: no trace,
 *                                         hollow node, lit node or its glow may
 *                                         be drawn with any point inside [x0, x1]
 *                                         (a safety margin covering the worst-case
 *                                         glow radius is reserved automatically).
 *                                         Lets a caller key the clear zone to a
 *                                         real content column instead of a fixed
 *                                         fraction of the canvas width. Ignored
 *                                         when null (the default legacy
 *                                         width-fraction band is used instead).
 * @param {number} [opts.centerClear=0.14] Fraction of width kept hard-clear
 *                                         around the midpoint. Ignored when
 *                                         `contentClearX` is given.
 * @param {number} [opts.glowOpacity=0.22] Fill opacity of the soft glow layer
 *                                         behind each lit terminal node.
 * @param {number} [opts.glowRadiusMultiplier=2.4] How much larger a lit node's
 *                                         glow circle is than the node itself.
 * @param {number} [opts.accentStrokeOpacity=1] Stroke opacity of lit traces and
 *                                         hollow accent-coloured nodes — lets a
 *                                         caller make the accent read quieter
 *                                         without changing its hue.
 * @param {number} [opts.maxNodeRadius=Infinity] Hard cap, in local units, on
 *                                         any terminal node's own radius
 *                                         (hollow or lit) before glow is
 *                                         applied — lets a caller keep a
 *                                         cramped composition from producing
 *                                         an outsized node that reads as a
 *                                         blob rather than a dot. Ignored
 *                                         (no cap) by default, so the
 *                                         page-tuned default radius spread
 *                                         is unaffected.
 * @returns {string} A complete `<svg>…</svg>` document.
 */
export function circuitSVG(opts = {}) {
  const {
    width = 400,
    height = 400,
    density = 1,
    seed = 1,
    accentColor = DEFAULT_ACCENT,
    baseColor = DEFAULT_BASE,
    accentProbability = 0.17,
    baseOpacity = 0.7,
    gridStep = 16,
    strokeWidth = 1.2,
    background = null,
    contentClearX = null,
    centerClear = 0.14,
    glowOpacity = 0.22,
    glowRadiusMultiplier = 2.4,
    accentStrokeOpacity = 1,
    maxNodeRadius = Infinity,
  } = opts;

  if (!(width > 0)) throw new RangeError(`circuitSVG: width must be > 0, got ${width}`);
  if (!(height > 0)) throw new RangeError(`circuitSVG: height must be > 0, got ${height}`);
  if (!(density > 0)) throw new RangeError(`circuitSVG: density must be > 0, got ${density}`);

  const rand = mulberry32(seedToInt(seed));

  const center = width / 2;
  // Node radii are drawn from baseNodeR * (0.65 + rand()*1.6), so 2.25x
  // baseNodeR is the true worst case — computed up front (it only depends
  // on strokeWidth) so contentClearX can reserve room for the largest
  // possible glow before any trace is generated. maxNodeRadius (when a
  // caller passes one) caps that worst case lower, same as it caps every
  // individual node's own radius below.
  const baseNodeR = strokeWidth * 2.2;
  const maxNodeR = Math.min(baseNodeR * 2.25, maxNodeRadius);

  let maxReach;
  if (contentClearX) {
    // Explicit exclusion zone keyed to a real content column, rather than a
    // fraction of the whole canvas: nothing — trace, node, or glow — may be
    // drawn with any point inside [x0, x1]. `rawReach` is how far a trace
    // may travel inward before its *path* would cross the boundary; the
    // extra `nodeSafety` margin also keeps a lit terminal's glow circle
    // (the widest thing a trace can end in) from bleeding across it.
    const [x0, x1] = contentClearX;
    const rawReach = Math.max(0, Math.min(x0, width - x1));
    const nodeSafety = maxNodeR * glowRadiusMultiplier;
    // No gridStep*3 "don't make traces absurdly short" floor here (unlike
    // the legacy branch below) — with a tight, real content-column margin,
    // enforcing a cosmetic minimum length could only be done by letting
    // traces (or their glow) overshoot into the excluded content column,
    // exactly the bug this parameter exists to prevent. Correctness wins;
    // traces just run shorter near a tight margin, which reads as the
    // field thinning out — consistent with the rest of the motif.
    maxReach = Math.max(0, rawReach - nodeSafety);
  } else {
    const centerClearHalf = (centerClear * width) / 2; // fraction of width kept hard-clear around the midpoint
    maxReach = Math.max(gridStep * 3, center - centerClearHalf);
  }

  const leftTraces = buildEdgeField(rand, { width, height, gridStep, density, maxReach });
  const rightTracesLocal = buildEdgeField(rand, { width, height, gridStep, density, maxReach });
  const rightTraces = rightTracesLocal.map((pts) => mirrorTrace(pts, width));

  const allTraces = [...leftTraces, ...rightTraces];

  // Decide per-trace whether it's lit, and each terminal node's radius /
  // hollow-blue variant, up front — one draw sequence, fully deterministic.
  const lit = [];
  const nodes = []; // { x, y, r, kind: 'lit' | 'hollow' | 'hollowAccent' }
  for (const pts of allTraces) {
    const isLit = rand() < accentProbability;
    lit.push(isLit);
    const r = Math.min(baseNodeR * (0.65 + rand() * 1.6), maxNodeRadius);
    const terminal = pts[pts.length - 1];
    if (isLit) {
      nodes.push({ x: terminal.x, y: terminal.y, r, kind: 'lit' });
    } else if (rand() < 0.08) {
      nodes.push({ x: terminal.x, y: terminal.y, r, kind: 'hollowAccent' });
    } else {
      nodes.push({ x: terminal.x, y: terminal.y, r, kind: 'hollow' });
    }
  }

  const bg = background
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}" />`
    : '';

  const unlitPaths = [];
  const litPaths = [];
  allTraces.forEach((pts, i) => {
    const d = pathFromPoints(pts);
    (lit[i] ? litPaths : unlitPaths).push(`<path d="${d}" />`);
  });

  const hollowNodes = [];
  const hollowAccentNodes = [];
  const glowNodes = [];
  const litNodes = [];
  for (const n of nodes) {
    if (n.kind === 'lit') {
      glowNodes.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.r * glowRadiusMultiplier}" />`);
      litNodes.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.r}" />`);
    } else if (n.kind === 'hollowAccent') {
      hollowAccentNodes.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.r}" />`);
    } else {
      hollowNodes.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.r}" />`);
    }
  }

  const hollowStrokeWidth = Math.max(0.6, strokeWidth * 0.85);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">` +
    bg +
    // Unlit traces: mid-dark grey, clearly visible.
    `<g fill="none" stroke="${baseColor}" stroke-width="${strokeWidth}" ` +
    `stroke-opacity="${baseOpacity}" stroke-linecap="round" stroke-linejoin="round">${unlitPaths.join('')}</g>` +
    // Lit traces: full accent colour along their entire length.
    `<g fill="none" stroke="${accentColor}" stroke-width="${strokeWidth}" ` +
    `stroke-opacity="${accentStrokeOpacity}" stroke-linecap="round" stroke-linejoin="round">${litPaths.join('')}</g>` +
    // Hollow terminal nodes: dark centre (transparent — the panel behind
    // shows through), grey or accent stroke, varied radii.
    `<g fill="none" stroke="${baseColor}" stroke-width="${hollowStrokeWidth}" stroke-opacity="${baseOpacity}">${hollowNodes.join('')}</g>` +
    `<g fill="none" stroke="${accentColor}" stroke-width="${hollowStrokeWidth}" stroke-opacity="${accentStrokeOpacity}">${hollowAccentNodes.join('')}</g>` +
    // Lit terminal nodes: soft glow layer behind a solid filled dot.
    `<g fill="${accentColor}" fill-opacity="${glowOpacity}">${glowNodes.join('')}</g>` +
    `<g fill="${accentColor}">${litNodes.join('')}</g>` +
    `</svg>`
  );
}
