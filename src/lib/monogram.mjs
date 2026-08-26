// The "AH" circuit monogram — the centrepiece of the redesigned identity.
//
// This reproduces the approved physical-card mark: not a single-stroke
// pictogram, but layered PCB tracery — multiple nested/parallel traces per
// letter, overshooting stems that terminate at staggered heights, and
// hollow ring nodes (the background shows through the centre) rather than
// filled dots. No text elements are rendered anywhere in this file; every
// contour is a hand-authored path in a fixed local coordinate system.
//
// Every stroke belongs to one of two weight tiers: PRIMARY (the strokes
// that actually form the letters — the A's outer contour, the H's two
// doubled stems and its full-width crossbar) and SECONDARY (the nested
// detail contours, flanking ornament traces, and floating stubs). This
// hierarchy is what keeps the mark legible at small sizes: at 40-80px the
// thin secondary tracery recedes into the background while the bold
// primary strokes still read unmistakably as "A" and "H".
//
// Geometry lives in a fixed VIEW_W x VIEW_H local coordinate system;
// `size` scales the whole mark uniformly via the SVG viewBox, so stroke
// widths and node radii stay proportionate at any rendered size.
// Everything here is pure arithmetic — no randomness, no clock reads — so
// the same options always produce byte-identical SVG.

const VIEW_W = 220;
const VIEW_H = 190;

// Weight tiers, expressed as a fraction of the primary stroke width (the
// `strokeWidth` option). Kept low so secondary/ornamental detail visibly
// recedes rather than competing with the letterforms.
const SECONDARY_WEIGHT = 0.5;
const RING_WEIGHT = 0.55;

// ============================================================= "A" ===
//
// Three nested, parallel contours sharing one splay angle (the classic
// A-leg slope), offset perpendicular to that slope so each inner contour's
// apex sits progressively lower and further inset — exactly what a true
// parallel offset of a V produces. The outer contour is PRIMARY: it is the
// boldest stroke and alone reads as "A" even at small sizes, overshooting
// through the crossbar row down to its own terminal. The mid contour is
// SECONDARY detail tracery, thinner and shorter. The innermost contour is
// the shortest, closes into the classic A triangle (its own crossbar
// forming the closing edge — the counter), and is SECONDARY too — but its
// crossbar edge is reinforced by a PRIMARY-weight overlay (below) so the
// horizontal bar that makes the shape read as "A" stays bold.

const A_CX = 54; // shared vertical axis both legs splay from/to
const A_TAN_THETA = 0.30; // leg slope: dx per dy — shallow enough that a
// long overshoot below the crossbar doesn't run the legs off the canvas
const A_SIN_THETA = A_TAN_THETA / Math.sqrt(1 + A_TAN_THETA * A_TAN_THETA);

const A_APEX_Y_OUTER = 8;
// Perpendicular inset distances (local units) that produce the second and
// third contours by sliding the outer V's apex down its own bisector —
// the geometrically correct way to keep three contours truly parallel.
const A_INSET_MID = 4;
const A_INSET_INNER = 9;
const A_APEX_Y_MID = A_APEX_Y_OUTER + A_INSET_MID / A_SIN_THETA;
const A_APEX_Y_INNER = A_APEX_Y_OUTER + A_INSET_INNER / A_SIN_THETA;

const A_CROSSBAR_Y = 108; // where the inner contour closes
const A_TERM_Y_OUTER = 172; // outer contour's overshoot terminal (lowest)
const A_TERM_Y_MID = 150; // mid contour's overshoot terminal (staggered)
const A_MIDRING_T = 0.45; // fraction from apex to terminal, outer contour only

function aLegX(y, apexY, side) {
  // side: -1 for the left leg, +1 for the right leg
  return A_CX + side * A_TAN_THETA * (y - apexY);
}

function aPoint(y, apexY, side) {
  return { x: aLegX(y, apexY, side), y };
}

function aInnerCrossbarPoints() {
  return [
    aPoint(A_CROSSBAR_Y, A_APEX_Y_INNER, -1),
    aPoint(A_CROSSBAR_Y, A_APEX_Y_INNER, +1),
  ];
}

// --- "H" -------------------------------------------------------------
//
// Each stem is a doubled pair of parallel verticals (outer + inner) —
// together they ARE the letter, so both are PRIMARY weight and both run
// tall with only mild overshoot stagger, reading as one unified stroke at
// a glance. A single PRIMARY crossbar spans the full width between the two
// stem pairs (outer-left to outer-right), physically meeting all four
// verticals, so the shape is unambiguously one connected "H" rather than a
// row of independent bars. A thin single flanking trace sits outside each
// stem — clearly secondary: thinner, much shorter, obviously ornament, not
// part of the letterform. The crossbar carries a short SECONDARY accent
// trace above it with an off-centre ring, plus a couple of short stubs
// that branch off and stop mid-air.

const H_FLANK_L_X = 108;
const H_OUTER_L_X = 124;
const H_INNER_L_X = 138;
const H_INNER_R_X = 179;
const H_OUTER_R_X = 193;
const H_FLANK_R_X = 209;

const H_OUTER_TOP_Y = 6;
const H_OUTER_BOTTOM_Y = 174;
// Inner stem kept close in length to the outer one — a mild stagger, not a
// dramatically shorter trace — so the doubled pair reads as one stem.
const H_INNER_TOP_Y = 18;
const H_INNER_BOTTOM_Y = 162;
// Flank is dramatically shorter than either stem trace — unmistakably
// ornament, never mistaken for part of the letter.
const H_FLANK_TOP_Y = 60;
const H_FLANK_BOTTOM_Y = 118;

const H_CROSS_Y = 108; // shared baseline with the A's crossbar
const H_CROSS_ACCENT_Y = 100;
const H_CROSS_ACCENT_X0 = 165;
const H_CROSS_ACCENT_X1 = 172;
const H_CROSS_RING_X = 172; // "right of centre" ring on the accent trace
const H_STUB_DOWN_X = 146;
const H_STUB_DOWN_Y = 119;
const H_STUB_UP_X = 151;
const H_STUB_UP_Y = 98;

const H_CROSS_CENTER_X = (H_INNER_L_X + H_INNER_R_X) / 2;

// --- assembly ----------------------------------------------------------

function fmt(n) {
  // Trim to a stable, compact representation without floating noise.
  return Math.round(n * 100) / 100;
}

function pathD(points, { close = false } = {}) {
  const [first, ...rest] = points;
  const d = [`M${fmt(first.x)},${fmt(first.y)}`, ...rest.map((p) => `L${fmt(p.x)},${fmt(p.y)}`)];
  if (close) d.push('Z');
  return d.join(' ');
}

function aContours() {
  const outerPath = pathD([
    aPoint(A_TERM_Y_OUTER, A_APEX_Y_OUTER, -1),
    aPoint(A_APEX_Y_OUTER, A_APEX_Y_OUTER, -1), // = apex
    aPoint(A_TERM_Y_OUTER, A_APEX_Y_OUTER, +1),
  ]);
  const midPath = pathD([
    aPoint(A_TERM_Y_MID, A_APEX_Y_MID, -1),
    aPoint(A_APEX_Y_MID, A_APEX_Y_MID, -1),
    aPoint(A_TERM_Y_MID, A_APEX_Y_MID, +1),
  ]);
  // Innermost contour: closes into the classic A triangle. The Z closing
  // segment IS the crossbar — the counter's floor — which is correct here
  // (this is what makes it read as "A"); the outer/mid contours below are
  // never closed into a floor of their own, so the mark as a whole still
  // doesn't read as a house.
  const [crossLeft, crossRight] = aInnerCrossbarPoints();
  const innerPath = pathD([
    crossLeft,
    { x: A_CX, y: A_APEX_Y_INNER }, // apex
    crossRight,
  ], { close: true });
  return { outerPath, midPath, innerPath };
}

function aStubs() {
  // Short, floating connector stubs inside the counter, above and below
  // the crossbar row — detail traces that don't join anything else.
  const aboveY = A_CROSSBAR_Y - 12;
  const belowY = A_CROSSBAR_Y + 14;
  const above = pathD([{ x: A_CX - 13, y: aboveY }, { x: A_CX + 13, y: aboveY }]);
  const below = pathD([{ x: A_CX - 24, y: belowY }, { x: A_CX + 2, y: belowY }]);
  return { above, below, aboveY, belowY };
}

function hStemVerticalPaths() {
  return [
    [H_OUTER_L_X, H_OUTER_TOP_Y, H_OUTER_BOTTOM_Y],
    [H_INNER_L_X, H_INNER_TOP_Y, H_INNER_BOTTOM_Y],
    [H_INNER_R_X, H_INNER_TOP_Y, H_INNER_BOTTOM_Y],
    [H_OUTER_R_X, H_OUTER_TOP_Y, H_OUTER_BOTTOM_Y],
  ].map(([x, y0, y1]) => pathD([{ x, y: y0 }, { x, y: y1 }]));
}

function hFlankVerticalPaths() {
  return [
    [H_FLANK_L_X, H_FLANK_TOP_Y, H_FLANK_BOTTOM_Y],
    [H_FLANK_R_X, H_FLANK_TOP_Y, H_FLANK_BOTTOM_Y],
  ].map(([x, y0, y1]) => pathD([{ x, y: y0 }, { x, y: y1 }]));
}

function hCrossbars() {
  // The main crossbar spans the FULL width between the two outer (stem)
  // verticals — a structural member that physically meets all four main
  // stem traces, not a stub that only touches the inner pair. This is what
  // makes the shape read unambiguously as "H" rather than a row of bars.
  const mainCross = pathD([{ x: H_OUTER_L_X, y: H_CROSS_Y }, { x: H_OUTER_R_X, y: H_CROSS_Y }]);
  const accentCross = pathD([{ x: H_CROSS_ACCENT_X0, y: H_CROSS_ACCENT_Y }, { x: H_CROSS_ACCENT_X1, y: H_CROSS_ACCENT_Y }]);
  return { mainCross, accentCross };
}

function hStubs() {
  const stubDown = pathD([{ x: H_STUB_DOWN_X, y: H_CROSS_Y }, { x: H_STUB_DOWN_X, y: H_STUB_DOWN_Y }]);
  const stubUp = pathD([{ x: H_STUB_UP_X, y: H_CROSS_Y }, { x: H_STUB_UP_X, y: H_STUB_UP_Y }]);
  return { stubDown, stubUp };
}

// ------------------------------------------------------- ring nodes ---
//
// Every node is a hollow ring: a stroked circle with no fill, so whatever
// sits behind (the page background) shows through the centre. Radius is
// the only thing that varies — large at trace terminals, smaller at
// mid-trace and crossbar junctions — never a filled dot. Ring stroke width
// is a single thin RING_WEIGHT tier (not the bold primary weight), so
// rings stay legible rings instead of filling in to blobs at small sizes.

function aRings(rLarge, rMed, rSmall, rMicro) {
  const { aboveY, belowY } = aStubs();
  const midRingY_outer = A_APEX_Y_OUTER + A_MIDRING_T * (A_TERM_Y_OUTER - A_APEX_Y_OUTER);
  return [
    // Apex rings: large on the outer contour, smaller just below it on mid.
    { x: A_CX, y: A_APEX_Y_OUTER, r: rLarge, glow: true },
    { x: A_CX, y: A_APEX_Y_MID, r: rSmall },
    // Ring partway down the outer contour, both diagonals.
    { x: aLegX(midRingY_outer, A_APEX_Y_OUTER, -1), y: midRingY_outer, r: rSmall },
    { x: aLegX(midRingY_outer, A_APEX_Y_OUTER, +1), y: midRingY_outer, r: rSmall },
    // Overshoot terminals below the crossbar, staggered heights.
    { x: aLegX(A_TERM_Y_OUTER, A_APEX_Y_OUTER, -1), y: A_TERM_Y_OUTER, r: rLarge },
    { x: aLegX(A_TERM_Y_OUTER, A_APEX_Y_OUTER, +1), y: A_TERM_Y_OUTER, r: rLarge },
    { x: aLegX(A_TERM_Y_MID, A_APEX_Y_MID, -1), y: A_TERM_Y_MID, r: rMed },
    { x: aLegX(A_TERM_Y_MID, A_APEX_Y_MID, +1), y: A_TERM_Y_MID, r: rMed },
    // Crossbar centre — the inner contour's closing edge.
    { x: A_CX, y: A_CROSSBAR_Y, r: rMed },
    // Floating stub terminals above and below the crossbar.
    { x: A_CX - 13, y: aboveY, r: rMicro },
    { x: A_CX + 13, y: aboveY, r: rMicro },
    { x: A_CX - 24, y: belowY, r: rMicro },
    { x: A_CX + 2, y: belowY, r: rMicro },
  ];
}

function hRings(rLarge, rMed, rSmall, rMicro) {
  return [
    // Outer stems: full overshoot, largest terminal rings, one with a glow.
    { x: H_OUTER_L_X, y: H_OUTER_TOP_Y, r: rLarge },
    { x: H_OUTER_L_X, y: H_OUTER_BOTTOM_Y, r: rLarge },
    { x: H_OUTER_R_X, y: H_OUTER_TOP_Y, r: rLarge, glow: true },
    { x: H_OUTER_R_X, y: H_OUTER_BOTTOM_Y, r: rLarge },
    // Inner stems: mildly staggered overshoot, medium rings.
    { x: H_INNER_L_X, y: H_INNER_TOP_Y, r: rMed },
    { x: H_INNER_L_X, y: H_INNER_BOTTOM_Y, r: rMed },
    { x: H_INNER_R_X, y: H_INNER_TOP_Y, r: rMed },
    { x: H_INNER_R_X, y: H_INNER_BOTTOM_Y, r: rMed },
    // Thin flanking traces: shortest, smallest rings — obviously ornament.
    { x: H_FLANK_L_X, y: H_FLANK_TOP_Y, r: rMicro },
    { x: H_FLANK_L_X, y: H_FLANK_BOTTOM_Y, r: rMicro },
    { x: H_FLANK_R_X, y: H_FLANK_TOP_Y, r: rMicro },
    { x: H_FLANK_R_X, y: H_FLANK_BOTTOM_Y, r: rMicro },
    // Crossbar: centre ring on the main trace, a second off-centre ring on
    // the short accent trace above it.
    { x: H_CROSS_CENTER_X, y: H_CROSS_Y, r: rMed },
    { x: H_CROSS_RING_X, y: H_CROSS_ACCENT_Y, r: rSmall },
    // Stubs branching off the crossbar, stopping mid-air.
    { x: H_STUB_DOWN_X, y: H_STUB_DOWN_Y, r: rMicro },
    { x: H_STUB_UP_X, y: H_STUB_UP_Y, r: rMicro },
  ];
}

function primaryStrokePaths() {
  const { outerPath } = aContours();
  const [crossLeft, crossRight] = aInnerCrossbarPoints();
  // Reinforces the A's crossbar at full weight without disturbing the
  // (secondary-weight) closed inner contour it's part of.
  const crossbarEmphasis = pathD([crossLeft, crossRight]);
  const { mainCross } = hCrossbars();
  return [outerPath, crossbarEmphasis, ...hStemVerticalPaths(), mainCross];
}

function secondaryStrokePaths() {
  const { midPath, innerPath } = aContours();
  const { above, below } = aStubs();
  const { accentCross } = hCrossbars();
  const { stubDown, stubUp } = hStubs();
  return [midPath, innerPath, above, below, ...hFlankVerticalPaths(), accentCross, stubDown, stubUp];
}

function ringNodes(rLarge, rMed, rSmall, rMicro) {
  return [...aRings(rLarge, rMed, rSmall, rMicro), ...hRings(rLarge, rMed, rSmall, rMicro)];
}

/**
 * Renders the AH circuit monogram as a self-contained SVG string.
 *
 * @param {object} [opts]
 * @param {number} [opts.size=200]      Rendered width in px/pt; height follows
 *                                      the fixed VIEW_H:VIEW_W aspect ratio.
 * @param {string} [opts.color='#00B7FF'] Trace stroke + ring-node stroke
 *                                      colour. Pass white or black for the
 *                                      mono print variant. Never used as a
 *                                      fill (aside from the restrained glow
 *                                      accents) — every letterform shape is
 *                                      stroke-only.
 * @param {number} [opts.strokeWidth]    PRIMARY stroke width, in local
 *                                      (VIEW_W x VIEW_H) units — the weight
 *                                      of the strokes that actually form the
 *                                      letters. Secondary/ornamental strokes
 *                                      and ring nodes are drawn thinner,
 *                                      proportional to this value. Defaults
 *                                      to VIEW_H/70 — fine tracery, not a
 *                                      bold pictogram stroke.
 * @param {string|null} [opts.background=null] Optional solid backing rect
 *                                      colour; omitted (transparent) by default.
 * @returns {string} A complete `<svg>…</svg>` document.
 */
export function monogramSVG(opts = {}) {
  const {
    size = 200,
    color = '#00B7FF',
    strokeWidth = VIEW_H / 70,
    background = null,
  } = opts;

  if (!(size > 0)) throw new RangeError(`monogramSVG: size must be > 0, got ${size}`);
  if (!(strokeWidth > 0)) throw new RangeError(`monogramSVG: strokeWidth must be > 0, got ${strokeWidth}`);

  const width = size;
  const height = size * (VIEW_H / VIEW_W);
  const secondaryStrokeWidth = strokeWidth * SECONDARY_WEIGHT;
  const ringStrokeWidth = strokeWidth * RING_WEIGHT;

  // Ring radii: large at overshoot terminals, medium at crossbar/inner
  // junctions, small at mid-trace rings, micro at floating stub terminals.
  // Kept as a restrained, fixed set of four sizes (not a continuum) so the
  // mark stays legible instead of turning to mush at small render sizes.
  const rLarge = strokeWidth * 2.1;
  const rMed = strokeWidth * 1.55;
  const rSmall = strokeWidth * 1.15;
  const rMicro = strokeWidth * 0.85;

  const bg = background
    ? `<rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="${background}" />`
    : '';

  const primaryStrokes = primaryStrokePaths().map((d) => `<path d="${d}" />`).join('');
  const secondaryStrokes = secondaryStrokePaths().map((d) => `<path d="${d}" />`).join('');

  const rings = ringNodes(rLarge, rMed, rSmall, rMicro);
  const hasGlow = rings.some((n) => n.glow);
  const defs = hasGlow
    ? `<defs><filter id="ah-mono-glow" x="-150%" y="-150%" width="400%" height="400%">` +
      `<feGaussianBlur stdDeviation="${fmt(strokeWidth * 1.4)}" /></filter></defs>`
    : '';
  const glowCircles = rings
    .filter((n) => n.glow)
    .map((n) => `<circle cx="${fmt(n.x)}" cy="${fmt(n.y)}" r="${fmt(n.r * 1.9)}" ` +
      `fill="${color}" opacity="0.35" filter="url(#ah-mono-glow)" />`)
    .join('');
  const ringCircles = rings
    .map((n) => `<circle cx="${fmt(n.x)}" cy="${fmt(n.y)}" r="${fmt(n.r)}" />`)
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="AH monogram">` +
    bg +
    defs +
    `<!-- glow --><g fill="none">${glowCircles}</g>` +
    `<!-- secondary strokes --><g fill="none" stroke="${color}" stroke-width="${fmt(secondaryStrokeWidth)}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${secondaryStrokes}</g>` +
    `<!-- primary strokes --><g fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${primaryStrokes}</g>` +
    `<!-- ring nodes --><g fill="none" stroke="${color}" stroke-width="${fmt(ringStrokeWidth)}" stroke-linecap="round">${ringCircles}</g>` +
    `</svg>`
  );
}
