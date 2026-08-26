// The "AH" circuit monogram — the centrepiece of the redesigned identity.
//
// This is NOT a typographic mark: no text elements are rendered anywhere in
// this file. The letterforms are hand-authored from circuit-board strokes —
// orthogonal (vertical/horizontal) segments and 45° diagonals only, the way
// a real PCB trace is routed — with small filled circles ("nodes") at every
// stroke terminal and at the junctions where strokes meet. It must read as
// a monogram first and a circuit second, and stay unmistakably "AH" even at
// small sizes (favicon, Wallet strip, print business-card corner).
//
// Geometry lives in a fixed 220x200 local coordinate system (VIEW_W x
// VIEW_H below); `size` scales the whole mark uniformly via the SVG
// viewBox, so stroke widths and node radii stay proportionate at any
// rendered size. Everything here is pure arithmetic — no randomness, no
// clock reads — so the same options always produce byte-identical SVG.

const VIEW_W = 220;
const VIEW_H = 200;

// --- "A" -------------------------------------------------------------
// Apex at top centre, each leg is one 45° diagonal down to a bend node,
// then a vertical run down to the foot. A horizontal crossbar connects
// the two legs partway down. A small floating ladder glyph sits inside
// the frame purely as circuit-board texture — it touches nothing else.
const A = {
  apex: { x: 60, y: 20 },
  leftBend: { x: 20, y: 60 },
  leftFoot: { x: 20, y: 180 },
  rightBend: { x: 100, y: 60 },
  rightFoot: { x: 100, y: 180 },
  crossbarY: 130,
  ladder: { x0: 45, x1: 75, y0: 78, y1: 108, rungs: 4 },
};

// --- "H" -------------------------------------------------------------
// Two verticals with a horizontal crossbar at mid-height, plus a pair of
// decorative junction nodes on each vertical (reads as solder points along
// a trace, matching the A's bend nodes for visual rhyme).
const H = {
  leftX: 135,
  rightX: 205,
  top: 20,
  bottom: 180,
  crossbarY: 100,
  decorTopY: 60,
  decorBottomY: 140,
};

function ladderPath({ x0, x1, y0, y1, rungs }) {
  const parts = [`M${x0},${y0} L${x0},${y1}`, `M${x1},${y0} L${x1},${y1}`];
  for (let i = 0; i < rungs; i++) {
    const t = rungs === 1 ? 0.5 : i / (rungs - 1);
    const y = y0 + (y1 - y0) * t;
    parts.push(`M${x0},${y} L${x1},${y}`);
  }
  return parts.join(' ');
}

function strokePaths() {
  return [
    // A: left leg (diagonal + vertical), right leg (diagonal + vertical), crossbar.
    `M${A.apex.x},${A.apex.y} L${A.leftBend.x},${A.leftBend.y} L${A.leftFoot.x},${A.leftFoot.y}`,
    `M${A.apex.x},${A.apex.y} L${A.rightBend.x},${A.rightBend.y} L${A.rightFoot.x},${A.rightFoot.y}`,
    `M${A.leftBend.x},${A.crossbarY} L${A.rightBend.x},${A.crossbarY}`,
    // A: inner ladder component.
    ladderPath(A.ladder),
    // H: two verticals, crossbar.
    `M${H.leftX},${H.top} L${H.leftX},${H.bottom}`,
    `M${H.rightX},${H.top} L${H.rightX},${H.bottom}`,
    `M${H.leftX},${H.crossbarY} L${H.rightX},${H.crossbarY}`,
  ];
}

function terminalNodes() {
  return [
    [A.apex.x, A.apex.y], [A.leftFoot.x, A.leftFoot.y], [A.rightFoot.x, A.rightFoot.y],
    [H.leftX, H.top], [H.leftX, H.bottom], [H.rightX, H.top], [H.rightX, H.bottom],
  ];
}

function junctionNodes() {
  return [
    [A.leftBend.x, A.leftBend.y], [A.rightBend.x, A.rightBend.y],
    [A.leftBend.x, A.crossbarY], [A.rightBend.x, A.crossbarY],
    [(H.leftX + H.rightX) / 2, H.crossbarY],
    [H.leftX, H.decorTopY], [H.rightX, H.decorTopY],
    [H.leftX, H.decorBottomY], [H.rightX, H.decorBottomY],
  ];
}

/**
 * Renders the AH circuit monogram as a self-contained SVG string.
 *
 * @param {object} [opts]
 * @param {number} [opts.size=200]      Rendered width in px/pt; height follows
 *                                      the fixed 220:200 aspect ratio.
 * @param {string} [opts.color='#00B7FF'] Stroke + node fill colour. Pass white
 *                                      or black for the mono print variant.
 * @param {number} [opts.strokeWidth=5]  Stroke width in local (220x200) units.
 * @param {string|null} [opts.background=null] Optional solid backing rect
 *                                      colour; omitted (transparent) by default.
 * @returns {string} A complete `<svg>…</svg>` document.
 */
export function monogramSVG(opts = {}) {
  const {
    size = 200,
    color = '#00B7FF',
    strokeWidth = 5,
    background = null,
  } = opts;

  if (!(size > 0)) throw new RangeError(`monogramSVG: size must be > 0, got ${size}`);
  if (!(strokeWidth > 0)) throw new RangeError(`monogramSVG: strokeWidth must be > 0, got ${strokeWidth}`);

  const width = size;
  const height = size * (VIEW_H / VIEW_W);
  const rTerminal = strokeWidth * 1.4;
  const rJunction = strokeWidth * 1.0;

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
