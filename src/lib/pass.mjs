import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { wordmarkSVG } from './text-path.mjs';
import { circuitSVG } from './circuit.mjs';
import { LOGO_ASPECT, logoRasterFor } from './logo.mjs';

export class PassError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PassError';
  }
}

// HTML-attribute-context escaping for attributedValue. This is the opposite
// rule from vCard's escapeText: there, URI-type values are left unescaped
// because a comma is legal in a URL; here the value sits inside an HTML
// attribute, so '"' or '&' in a URL genuinely must be escaped. '&' must be
// escaped FIRST, or the entities just introduced (e.g. '&quot;') would
// themselves get re-escaped into '&amp;quot;'.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const link = (href, text) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;

// Same derivation pattern as `short` below: a link label read from the
// config value it points at, not a literal, so editing config.json can
// never leave a pass that displays one identity and navigates to another.
// Strips the scheme, an optional leading "www.", and a trailing slash.
function shortUrl(href) {
  return String(href)
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

// Wallet fields have no CSS-style text-transform: whatever casing a field's
// value has in config.json is exactly what renders on the card. Every
// front-of-pass string here already carries its intended display casing
// (content.name is "ALI HAMED", content.roleSecondary is "SOFTWARE
// ENGINEER") except content.role, authored in config.json as "iOS
// Developer" for use elsewhere (e.g. the vCard title). Its intended
// on-card display — full caps but preserving the "iOS" brand term's
// lowercase "i" — already exists as a hardcoded literal in
// src/index.html's <p class="role-secondary">iOS DEVELOPER</p>. This
// reproduces that exact transform here so pass.mjs can derive it from the
// same config.content.role rather than duplicating a second hardcoded
// string that could drift from the first.
function walletRoleCase(text) {
  return String(text).toUpperCase().replace(/\bIOS\b/g, 'iOS');
}

export function buildPassJSON(config) {
  const { apple, content, contacts, url } = config;

  if (!/^[A-Z0-9]{10}$/.test(apple.teamIdentifier ?? '')) {
    throw new PassError(
      `apple.teamIdentifier must be your 10-character Apple Team ID, got ` +
      `"${apple.teamIdentifier ?? ''}". Copy it from developer.apple.com > ` +
      'Membership into config.json.'
    );
  }
  if (!/^pass\.[A-Za-z0-9][A-Za-z0-9.-]*$/.test(apple.passTypeIdentifier ?? '')) {
    throw new PassError(
      `apple.passTypeIdentifier must start with "pass.", got ` +
      `"${apple.passTypeIdentifier ?? ''}". Create it at developer.apple.com > ` +
      'Identifiers > Pass Type IDs.'
    );
  }

  const short = url.CARD_URL.replace(/^https:\/\//, '');

  return {
    formatVersion: 1,
    passTypeIdentifier: apple.passTypeIdentifier,
    teamIdentifier: apple.teamIdentifier,
    organizationName: apple.organizationName,
    serialNumber: apple.serialNumber,
    description: apple.description,

    // Spaced form per Apple's documented examples (e.g. "rgb(23, 187, 82)");
    // PassKit's tolerance for the compact form is unverified on a real
    // device, and a rejected pass silently fails to open with no diagnostic.
    backgroundColor: 'rgb(0, 0, 0)',
    foregroundColor: 'rgb(245, 245, 247)',
    labelColor: 'rgb(134, 134, 139)',

    // iOS draws a diagonal gloss/shine gradient over strip.png by default.
    // strip.png now carries a real alpha cutout at its top edge (the
    // client-requested notch — see the STRIP_NOTCH_* constants and
    // renderStripMaster below); Apple's shine layer is not something this
    // codebase controls or can preview, and there is no way to confirm from
    // here whether it respects that per-pixel alpha or is composited across
    // the strip's full rectangular bounds regardless of it. A gloss sweep
    // crossing straight through the cut as if it were still solid would
    // read as a rendering glitch and undermine the cut illusion the rim
    // stroke is built to sell. Suppressing it is the conservative choice:
    // it keeps the hand-drawn contour and its rim highlight the only
    // lighting effect on the strip, with nothing Apple-drawn able to
    // conflict with them.
    suppressStripShine: true,

    // generic passes support no strip/background image at all, which is why
    // an earlier version of this pass could never look like the approved
    // reference (preview/Apple wallet update.png) — a plain field list on
    // flat black. storeCard is the one PassKit style that gives a front-of-
    // pass image (strip.png, see renderStripAssets below), so the circuit
    // motif + supplied AH logo can appear on the card itself, matching the
    // page. See wallet/README's layout note and the doc-comment above
    // renderStripAssets for the full front-of-pass composition.
    storeCard: {
      // The strip IS the hero (circuit motif + AH logo, baked into
      // strip.png — see renderStripAssets). Wallet overlays primaryFields
      // on top of the strip, so this is deliberately kept to just the name:
      // short and reliably one line, unlike a full sentence, and the strip
      // is composed with its bottom third left solid black (no trace, no
      // logo ink) specifically so this overlay never collides with the
      // artwork regardless of exactly how a given iOS version aligns it.
      primaryFields: [
        { key: 'name', label: '', value: content.name },
      ],
      // Below the strip: two rows. Wallet always renders a field's label
      // (small, labelColor) above its value (larger, foregroundColor), so
      // pairing roleSecondary as the label and role as the value keeps the
      // reference's top-to-bottom order (SOFTWARE ENGINEER, then iOS
      // Developer) even though real Wallet fields have no per-field accent
      // colour to reproduce the reference's blue/grey split — PassKit only
      // exposes the three global colours declared above. content.role is
      // upper-cased (preserving the "iOS" brand casing) to match how this
      // exact string already appears, hardcoded, in src/index.html's
      // role-secondary paragraph — see walletRoleCase below.
      // Wallet renders a field's LABEL small and grey above its VALUE. In the
      // approved reference SOFTWARE ENGINEER is the prominent line and
      // iOS DEVELOPER is secondary — so SOFTWARE ENGINEER must be a VALUE.
      // Putting it in a label (as before) inverted that hierarchy and also
      // read semantically as "a label for iOS Developer", which it is not.
      secondaryFields: [
        { key: 'role2', label: '', value: content.roleSecondary },
      ],
      // iOS DEVELOPER rides as the label above the tagline. That keeps the
      // reference's vertical order — name, SOFTWARE ENGINEER, iOS DEVELOPER,
      // tagline — while giving each line the right visual weight.
      auxiliaryFields: [
        { key: 'tagline', label: walletRoleCase(content.role), value: content.taglineWallet },
      ],
      backFields: [
        { key: 'message', label: '', value: content.message },
        { key: 'cta', label: '', value: content.cta },
        {
          key: 'card', label: 'DIGITAL CARD',
          value: url.CARD_URL, attributedValue: link(url.CARD_URL, short),
        },
        {
          key: 'linkedin', label: 'LINKEDIN',
          value: contacts.linkedin,
          attributedValue: link(contacts.linkedin, shortUrl(contacts.linkedin)),
        },
        {
          key: 'github', label: 'GITHUB',
          value: contacts.github,
          attributedValue: link(contacts.github, shortUrl(contacts.github)),
        },
        {
          key: 'whatsapp', label: 'WHATSAPP',
          value: contacts.phone,
          attributedValue: link(contacts.whatsapp, contacts.phone),
        },
        {
          key: 'email', label: 'EMAIL',
          value: contacts.email,
          attributedValue: link(`mailto:${contacts.email}`, contacts.email),
        },
      ],
    },

    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: url.CARD_URL,
      messageEncoding: 'iso-8859-1',
      // No altText: Wallet renders it as visible text beneath the barcode.
      // Omitting it hides the URL and does not affect scannability.
    }],
  };
}

// Render large, then downscale: rasterising an SVG at its final small size
// produces soft edges on small text.
const RENDER_SIZE = 240;

// icon.png is the client-supplied AH logo, not a derived text monogram — a
// generated "AH" monogram was rejected by the client outright (see
// src/lib/logo.mjs's header comment), and re-deriving one here would be
// exactly that. This mirrors renderTouchIcon in site.mjs: the mark is fixed
// artwork, centred on a black square with an even margin, and — like the
// touch icon — it does NOT vary with config.content.name at all (the old
// text-monogram path did; that drift is now moot because the image is fixed
// regardless of name).
//
// 0.8 margin ratio matches renderTouchIcon's 144-of-180 proportion, so the
// mark reads at the same relative size everywhere it appears.
const ICON_MARGIN_RATIO = 0.8;

async function renderIcon(size) {
  const width = Math.round(size * ICON_MARGIN_RATIO);
  const height = Math.round(width / LOGO_ASPECT); // preserves the supplied 1200x800 ratio
  const rasterBuffer = await readFile(logoRasterFor(width));
  const mark = await sharp(rasterBuffer)
    .resize({ width, height, fit: 'fill' }) // source rasters are already exactly 3:2, so this never distorts
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: '#000000' },
  }).composite([{ input: mark, gravity: 'centre' }]).png().toBuffer();
}

// ---- strip.png ----------------------------------------------------------
// storeCard's strip.png is the pass's hero image: the circuit-trace motif
// shared with the page (src/lib/circuit.mjs, untouched here — only the
// arguments passed to it are specific to this composition) with the
// supplied AH logo composited on top, centred in a "top band" that leaves
// the bottom ~28% of the strip solid black. That reserved band is what lets
// buildPassJSON's primaryFields (the name) safely overlay the strip — see
// the comment there — because nothing in the strip artwork occupies that
// vertical range.
//
// PassKit strip sizes are 375x123 / 750x246 / 1125x369, a straight 1x/2x/3x
// of one artwork (Apple's Wallet HIG). Rather than calling circuitSVG() at
// three different nominal pixel sizes — which would reseed its PRNG
// differently at each size and produce three visibly different patterns,
// not a clean multiple of the same artwork — this renders ONE vector
// composition at the logical 375x123 size and rasterises it at increasing
// density (SVG DPI) to get pixel-exact 2x/3x output, confirmed empirically:
// sharp treats an unitless SVG width as px at a 72dpi baseline, so density
// 72/144/216 yields exactly 375x123 / 750x246 / 1125x369. The full
// composite (circuit + logo) is then built once at the highest density
// (@3x) and downscaled for @2x/@1x — the same "render large, then
// downscale" principle already used for renderIcon/renderLogo above, just
// applied the other direction (build once at max density, shrink down)
// since here the "large source" is the rasterisation itself, not a
// pre-existing big bitmap.
const STRIP_W = 375;
const STRIP_H = 123;
// Fraction of the strip kept solid black at the bottom — see the class
// comment above.
const STRIP_BOTTOM_CLEAR = 0.28;
const STRIP_TOP_BAND = STRIP_H - Math.round(STRIP_H * STRIP_BOTTOM_CLEAR); // 89pt
// How tall the AH logo renders within that top band, as a fraction of it —
// leaves an even margin around the mark so it doesn't crowd the strip's
// own edges or the bottom-clear boundary.
const STRIP_LOGO_HEIGHT_RATIO = 0.75;
// Circuit traces are kept clear of a column centred on the logo (mirrors
// CONTENT_CLEAR_X in site.mjs, which does the same for the page's motif).
// This only needs to be approximately right — it is a safety margin passed
// to circuitSVG, not a pixel-exact composite — so an un-rounded estimate of
// the logo's footprint is good enough here.
const STRIP_CLEAR_MARGIN = 24;
const STRIP_APPROX_LOGO_H = STRIP_TOP_BAND * STRIP_LOGO_HEIGHT_RATIO;
const STRIP_APPROX_LOGO_W = STRIP_APPROX_LOGO_H * LOGO_ASPECT;
const STRIP_CONTENT_CLEAR_X = [
  Math.round((STRIP_W - STRIP_APPROX_LOGO_W) / 2 - STRIP_CLEAR_MARGIN),
  Math.round((STRIP_W + STRIP_APPROX_LOGO_W) / 2 + STRIP_CLEAR_MARGIN),
];

// ---- top contour (client-requested curved/cut notch) --------------------
// PassKit gives the pass itself no shape key — its rounded-rect silhouette
// is drawn by iOS and cannot change from here. But this pass carries no
// logo.png and no header fields (both removed at the client's request), so
// strip.png's own top row is the first artwork pixel a user sees. That
// makes a notch cut INTO the strip artwork the only lever available to
// approximate the reference's curved top edge (preview/Apple wallet
// update.png).
//
// The notch is carved with real alpha: fully transparent above the curve,
// so the pass's own backgroundColor (rgb(0, 0, 0)) shows through. A bare
// alpha hole alone would be invisible on a real device, though — the
// backgroundColor and the strip's own fill are both pure black, so cutting
// a hole just reveals more identical black. A thin rim-light stroke traced
// exactly along the cut boundary (below, in renderStripNotchLayers) is what
// actually makes the cut read as a cut, the same way the reference itself
// relies on a light bezel line rather than a colour change to sell the cut.
//
// Proportions are measured directly off the reference image: the notch
// spans ~10.4% of the full pass width, and its depth is ~28% of its own
// width (130px wide by 37px deep, at the reference's own render scale).
// Applied to strip's real 375pt width — which, unlike the preview canvas,
// IS the literal point width PassKit renders on an iPhone — that yields a
// modest, subtle dip, matching how understated the cut reads in the
// reference itself: a detail, not a dominant shape.
const STRIP_NOTCH_WIDTH = 44;   // pt — ~375 * 0.104, rounded
const STRIP_NOTCH_DEPTH = 13;   // pt — ~width * 0.284 (measured depth/width), rounded
const STRIP_NOTCH_STROKE = 'rgba(255, 255, 255, 0.35)'; // matches the reference's measured brightness at the cut edge
const STRIP_NOTCH_STROKE_WIDTH = 1.4; // pt

// The cut boundary: a cubic-bezier "S" curve with a horizontal tangent at
// both outer corners and at the apex, so it reads as one smooth scoop
// (matching the reference's rounded fillets) rather than a sharp V. Open
// path, in strip-logical pt coordinates (0,0 at the strip's top-left);
// callers close it into a shape (for the mask) or stroke it as-is (for the
// rim light).
function stripNotchCurveD() {
  const cx = STRIP_W / 2;
  const half = STRIP_NOTCH_WIDTH / 2;
  const left = cx - half;
  const right = cx + half;
  const apexY = STRIP_NOTCH_DEPTH;
  const k = half * 0.6; // horizontal control-point offset that shapes the ease
  return (
    `M ${left},0 ` +
    `C ${left + k},0 ${cx - half * 0.4},${apexY} ${cx},${apexY} ` +
    `C ${cx + half * 0.4},${apexY} ${right - k},0 ${right},0`
  );
}

// Renders the two pixel layers the notch needs, both at the given canvas
// pixel size and both driven by the exact same vector curve (via an SVG
// viewBox that maps strip-logical pt coordinates to canvas pixels) — so the
// shape scales identically at every density instead of being redrawn three
// times.
//   mask:   opaque (alpha 255) everywhere except the notch, which is fully
//           transparent (alpha 0). Applied with a 'dest-in' blend to punch
//           the hole through the opaque circuit+logo composite.
//   stroke: the rim-light line alone, transparent elsewhere. Composited
//           back on top AFTER the mask, unmasked, so the highlight survives
//           even where it crosses the now-transparent notch.
async function renderStripNotchLayers(canvasW, canvasH) {
  const curve = stripNotchCurveD();
  const viewBox = `0 0 ${STRIP_W} ${STRIP_H}`;

  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="${viewBox}">
    <path fill-rule="evenodd" fill="#fff"
      d="M0,0 H${STRIP_W} V${STRIP_H} H0 Z ${curve} Z" />
  </svg>`;
  const strokeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="${viewBox}">
    <path d="${curve}" fill="none" stroke="${STRIP_NOTCH_STROKE}"
      stroke-width="${STRIP_NOTCH_STROKE_WIDTH}" stroke-linecap="round" />
  </svg>`;

  const [mask, stroke] = await Promise.all([
    sharp(Buffer.from(maskSvg)).png().toBuffer(),
    sharp(Buffer.from(strokeSvg)).png().toBuffer(),
  ]);
  return { mask, stroke };
}

async function renderStripMaster() {
  const scale = 3; // build at @3x; @2x/@1x are downscaled from this buffer
  const dpi = 72 * scale;

  const circuitSvgString = circuitSVG({
    width: STRIP_W,
    height: STRIP_TOP_BAND,
    seed: 'ali-hamed-wallet-strip',
    density: 1.4, // matches the approved preview/_foundations/circuit-wallet-strip.png tuning
    contentClearX: STRIP_CONTENT_CLEAR_X,
  });
  const circuitPng = await sharp(Buffer.from(circuitSvgString), { density: dpi })
    .png().toBuffer();

  // Exact-aspect logo composite, computed directly at this render's pixel
  // scale (not scaled up from an already-rounded 1x value), keeping
  // rounding error to a small fraction of a pixel.
  const logoHeightPx = Math.round(STRIP_TOP_BAND * scale * STRIP_LOGO_HEIGHT_RATIO);
  const logoWidthPx = Math.round(logoHeightPx * LOGO_ASPECT);
  const rasterBuffer = await readFile(logoRasterFor(logoWidthPx));
  const logo = await sharp(rasterBuffer)
    .resize({ width: logoWidthPx, height: logoHeightPx, fit: 'fill' })
    .toBuffer();

  const canvasW = STRIP_W * scale;
  const canvasH = STRIP_H * scale;
  const logoLeft = Math.round((canvasW - logoWidthPx) / 2);
  const logoTop = Math.round((STRIP_TOP_BAND * scale - logoHeightPx) / 2);

  const base = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: '#000000' },
  })
    .composite([
      { input: circuitPng, left: 0, top: 0 },
      { input: logo, left: logoLeft, top: logoTop },
    ])
    .png().toBuffer();

  // Carve the top-edge notch: mask first (punches the alpha hole through
  // the opaque circuit+logo composite), then the rim-light stroke on top,
  // unmasked, so it stays visible across the cut. See the constants and
  // renderStripNotchLayers doc-comments above for why both steps exist.
  const { mask, stroke } = await renderStripNotchLayers(canvasW, canvasH);
  const masked = await sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return sharp(masked).composite([{ input: stroke, blend: 'over' }]).png().toBuffer();
}

async function renderStripAssets() {
  const master = await renderStripMaster(); // 1125x369 (@3x)
  const [x2, x1] = await Promise.all([
    sharp(master).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer(),
    sharp(master).resize(STRIP_W, STRIP_H).png().toBuffer(),
  ]);
  return { x1, x2, x3: master };
}

// The pass carries NO logo.png. The client asked for the Apple mark and the
// "Business Card" title to be removed entirely, with the supplied AH logo as
// the only identity mark — it lives in strip.png, which is the visual focus.
// logo.png is optional in PassKit (only icon.png is required), so the slot is
// simply left empty rather than filled with a substitute label.

// rgb(134, 134, 139) as a hex literal, so this file doesn't need to import
// or duplicate the rgb() string used for pass.json's labelColor.
const LABEL_COLOR = '#86868B';

export async function renderPassAssets(_config) {
  const strips = await renderStripAssets();
  return new Map([
    ['icon.png', await renderIcon(29)],
    ['icon@2x.png', await renderIcon(58)],
    ['icon@3x.png', await renderIcon(87)],
    ['strip.png', strips.x1],
    ['strip@2x.png', strips.x2],
    ['strip@3x.png', strips.x3],
  ]);
}
