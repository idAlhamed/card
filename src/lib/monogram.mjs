// The "AH" circuit monogram — the centrepiece of the redesigned identity.
//
// This is NOT a typographic mark: no text elements are rendered anywhere in
// this file. The letterforms are hand-authored from circuit-board strokes —
// diagonals and verticals/horizontals only, the way a real PCB trace is
// routed — with small filled circles ("nodes") at every stroke terminal and
// at the junctions where strokes meet or bend. It must read as a monogram
// first and a circuit second, and stay unmistakably "AH" even at small
// sizes (favicon, Wallet strip, print business-card corner).
//
// Geometry lives in a fixed 250x200 local coordinate system (VIEW_W x
// VIEW_H below); `size` scales the whole mark uniformly via the SVG
// viewBox, so stroke widths and node radii stay proportionate at any
// rendered size. Everything here is pure arithmetic — no randomness, no
// clock reads — so the same options always produce byte-identical SVG.

const VIEW_W = 250;
const VIEW_H = 200;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// --- "A" -------------------------------------------------------------
// A single apex node, two legs splaying out as straight diagonals — the
// one feature that reads as "A" before anything else — open at the base
// (no floor closing them off), a horizontal crossbar at ~40% height with
// a junction node where it meets each leg, and a short vertical stub past
// each leg's knee down to a terminal node.
const A_APEX = { x: 70, y: 15 };
const A_LEFT_KNEE = { x: 15, y: 150 };
const A_RIGHT_KNEE = { x: 125, y: 150 };
const A_STUB_BOTTOM_Y = 180;
const A_CROSSBAR_T = 0.4; // fraction of the way from apex to knee

const A_LEFT_CROSS = {
  x: lerp(A_APEX.x, A_LEFT_KNEE.x, A_CROSSBAR_T),
  y: lerp(A_APEX.y, A_LEFT_KNEE.y, A_CROSSBAR_T),
};
const A_RIGHT_CROSS = {
  x: lerp(A_APEX.x, A_RIGHT_KNEE.x, A_CROSSBAR_T),
  y: lerp(A_APEX.y, A_RIGHT_KNEE.y, A_CROSSBAR_T),
};

// --- "H" -------------------------------------------------------------
// Two verticals given the same trace character as the A: a short top stub
// down to a knee, the main run, then a short bottom stub down to a
// terminal node. A horizontal crossbar at mid-height carries a junction
// node at each end and one at its midpoint.
const H_LEFT_X = 165;
const H_RIGHT_X = 235;
const H_TOP_Y = 15;
const H_TOP_KNEE_Y = 40;
const H_BOTTOM_KNEE_Y = 155;
const H_BOTTOM_Y = 180;
const H_CROSSBAR_Y = (A_APEX.y + A_STUB_BOTTOM_Y) / 2; // 97.5, shared mid-band with the A

function strokePaths() {
  return [
    // A: left leg (diagonal to knee, then stub), right leg (mirror), crossbar.
    `M${A_APEX.x},${A_APEX.y} L${A_LEFT_KNEE.x},${A_LEFT_KNEE.y} L${A_LEFT_KNEE.x},${A_STUB_BOTTOM_Y}`,
    `M${A_APEX.x},${A_APEX.y} L${A_RIGHT_KNEE.x},${A_RIGHT_KNEE.y} L${A_RIGHT_KNEE.x},${A_STUB_BOTTOM_Y}`,
    `M${A_LEFT_CROSS.x},${A_LEFT_CROSS.y} L${A_RIGHT_CROSS.x},${A_RIGHT_CROSS.y}`,
    // H: left vertical (top stub, knee, main run, knee, bottom stub) — drawn as
    // one straight path since the stubs are collinear with the main run.
    `M${H_LEFT_X},${H_TOP_Y} L${H_LEFT_X},${H_BOTTOM_Y}`,
    `M${H_RIGHT_X},${H_TOP_Y} L${H_RIGHT_X},${H_BOTTOM_Y}`,
    `M${H_LEFT_X},${H_CROSSBAR_Y} L${H_RIGHT_X},${H_CROSSBAR_Y}`,
  ];
}

function terminalNodes() {
  return [
    [A_APEX.x, A_APEX.y],
    [A_LEFT_KNEE.x, A_STUB_BOTTOM_Y],
    [A_RIGHT_KNEE.x, A_STUB_BOTTOM_Y],
    [H_LEFT_X, H_TOP_Y], [H_LEFT_X, H_BOTTOM_Y],
    [H_RIGHT_X, H_TOP_Y], [H_RIGHT_X, H_BOTTOM_Y],
  ];
}

function junctionNodes() {
  return [
    [A_LEFT_KNEE.x, A_LEFT_KNEE.y], [A_RIGHT_KNEE.x, A_RIGHT_KNEE.y],
    [A_LEFT_CROSS.x, A_LEFT_CROSS.y], [A_RIGHT_CROSS.x, A_RIGHT_CROSS.y],
    [H_LEFT_X, H_TOP_KNEE_Y], [H_RIGHT_X, H_TOP_KNEE_Y],
    [H_LEFT_X, H_BOTTOM_KNEE_Y], [H_RIGHT_X, H_BOTTOM_KNEE_Y],
    [H_LEFT_X, H_CROSSBAR_Y], [H_RIGHT_X, H_CROSSBAR_Y],
    [(H_LEFT_X + H_RIGHT_X) / 2, H_CROSSBAR_Y],
  ];
}

/**
 * Renders the AH circuit monogram as a self-contained SVG string.
 *
 * @param {object} [opts]
 * @param {number} [opts.size=200]      Rendered width in px/pt; height follows
 *                                      the fixed 250:200 aspect ratio.
 * @param {string} [opts.color='#00B7FF'] Stroke + node fill colour. Pass white
 *                                      or black for the mono print variant.
 * @param {number} [opts.strokeWidth]    Stroke width in local (250x200) units.
 *                                      Defaults to VIEW_H/40 — delicate circuit
 *                                      tracery, not a bold pictogram stroke.
 * @param {string|null} [opts.background=null] Optional solid backing rect
 *                                      colour; omitted (transparent) by default.
 * @returns {string} A complete `<svg>…</svg>` document.
 */
export function monogramSVG(opts = {}) {
  const {
    size = 200,
    color = '#00B7FF',
    strokeWidth = VIEW_H / 40,
    background = null,
  } = opts;

  if (!(size > 0)) throw new RangeError(`monogramSVG: size must be > 0, got ${size}`);
  if (!(strokeWidth > 0)) throw new RangeError(`monogramSVG: strokeWidth must be > 0, got ${strokeWidth}`);

  const width = size;
  const height = size * (VIEW_H / VIEW_W);
  // Node diameter ~3x the stroke width so nodes read as trace terminals,
  // not as the dominant shape. Terminals sit a touch larger than junctions.
  const rTerminal = strokeWidth * 1.5;
  const rJunction = strokeWidth * 1.15;

  const bg = background
    ? `<rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="${background}" />`
    : '';

  const strokes = strokePaths()
    .map((d) => `<path d="${d}" />`)
    .join('');

  const terminals = terminalNodes()
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${rTerminal}" />`)
    .join('');

  const junctions = junctionNodes()
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${rJunction}" />`)
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="AH monogram">` +
    bg +
    `<g fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${strokes}</g>` +
    `<g fill="${color}">${terminals}${junctions}</g>` +
    `</svg>`
  );
}
