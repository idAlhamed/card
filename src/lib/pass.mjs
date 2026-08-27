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
export function walletRoleCase(text) {
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

    // generic passes support no strip/background image at all, which is why
    // an earlier version of this pass could never look like the approved
    // reference (preview/Apple wallet update.png) — a plain field list on
    // flat black. storeCard is the one PassKit style that gives a front-of-
    // pass image (strip.png, see renderStripAssets below), so the circuit
    // motif + supplied AH logo can appear on the card itself, matching the
    // page. See wallet/README's layout note and the doc-comment above
    // renderStripAssets for the full front-of-pass composition.
    //
    // The client asked for (1) every field centred, (2) SOFTWARE ENGINEER in
    // the logo's blue (#00B7FF) rather than white, and (3) a small centred
    // divider directly beneath iOS DEVELOPER. PassKit's field dictionary
    // supports (1) natively (`textAlignment`), but has no per-field colour
    // (foregroundColor/labelColor are pass-wide, applying to every field
    // alike) and no rule/separator primitive at all — so (2) and (3) are
    // unreachable through native fields. Per the client's own fallback
    // instruction, the whole identity block — AH logo, ALI HAMED, SOFTWARE
    // ENGINEER (blue), iOS DEVELOPER, and the blue divider — is baked into
    // strip.png instead (see renderStripMaster's layout constants below),
    // in that exact top-to-bottom order, so nothing floats above the name
    // out of order. Those three lines are therefore deliberately absent
    // from primaryFields/secondaryFields here — carrying them in both
    // places would duplicate content the client explicitly said not to
    // duplicate. Only the tagline remains as a real field, since it is pure
    // native text (no colour or divider requirement) and centring it is
    // fully supported.
    storeCard: {
      // No primaryFields/secondaryFields: the name and both role lines live
      // in strip.png now (see above and renderStripMaster). An earlier
      // revision put them here, overlaid on/below the strip; that duplicated
      // the content this revision moved into the artwork, so those arrays
      // are simply omitted rather than left empty for no reason.
      //
      // The tagline is the one native field left. `textAlignment` is a real,
      // documented PassKit field-dictionary key — unlike per-field colour or
      // a divider, centring genuinely is natively supported, so it is used
      // directly rather than faked in artwork.
      auxiliaryFields: [
        {
          key: 'tagline', label: '', value: content.taglineWallet,
          textAlignment: 'PKTextAlignmentCenter',
        },
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
// storeCard's strip.png is the pass's hero image. PassKit's field
// dictionary cannot centre-align text with per-field colour, and it has no
// divider/rule primitive at all (see buildPassJSON's doc-comment above), so
// the client's own fallback instruction applies: reproduce the visual
// treatment through artwork instead. This bakes the WHOLE identity block
// into strip.png, in the reference's own top-to-bottom order —
//
//   AH logo -> ALI HAMED -> SOFTWARE ENGINEER (blue #00B7FF) -> iOS
//   DEVELOPER -> a small centred blue divider
//
// — all centred horizontally, over the circuit-trace motif shared with the
// page (src/lib/circuit.mjs, untouched here — only the arguments passed to
// it are specific to this composition). An earlier revision put only the AH
// logo in the strip and overlaid the name/roles as native fields below it;
// moving the whole block here instead is what makes the blue SOFTWARE
// ENGINEER and the divider possible at all, and keeping the WHOLE block
// together — not just the two coloured lines — is what keeps the
// reference's vertical order intact: the strip always renders above every
// field, so splitting the block between strip and fields would put a field
// above the strip's own logo, wrong end first.
//
// Accessibility trade, deliberately accepted by the client to get blue type
// and a divider on a platform that supports neither: text baked into
// strip.png is flattened to pixels, so it is invisible to VoiceOver and
// does not scale with Dynamic Type. The seven back fields (see
// buildPassJSON) are real PassKit text and stay fully accessible; only this
// decorative front-of-pass identity block trades accessibility for the
// requested visual treatment.
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
// composite (circuit + logo + text + divider) is built once at the highest
// density (@3x) and downscaled for @2x/@1x — the same "render large, then
// downscale" principle already used for renderIcon above, just applied the
// other direction (build once at max density, shrink down) since here the
// "large source" is the rasterisation itself, not a pre-existing big
// bitmap. Text lines are rasterised the same way: fontSize/letterSpacing
// are scaled by the same `scale` factor rather than relying on an SVG
// `density`, so their pixel output is exact at every density with no extra
// resampling — see renderStripLine.
const STRIP_W = 375;
const STRIP_H = 123;

// Vertical layout of the strip's baked-in content, top to bottom, in
// logical (1x) points. Font sizes look large on paper because wordmarkSVG
// measures actual glyph ink (cap height) — for this all-caps/no-descender
// content that runs to roughly 70-75% of the nominal font size, not 100%,
// which is what leaves real headroom inside the fixed 123pt strip despite
// five stacked elements. Chosen to preserve the reference's hierarchy (name
// largest, SOFTWARE ENGINEER next, iOS DEVELOPER smallest); the assertion
// in renderStripMaster fails the build outright, at all three densities, if
// a future edit ever makes the block taller than the strip, rather than
// silently clipping or overlapping content on a real device.
//
// preview/Ali-Hamed-Apple-Wallet-Pass-Updated.png (the current approved
// reference) draws this block at proportions that are simply impossible
// here: measured off that image, the logo alone runs ~44% of the identity
// block's total height and the gaps between lines are each nearly as tall
// as a line of text — reproduced at the reference's own ratios, the block
// would need ~142pt inside a strip that only has 123pt total, at every
// density. Scaling everything down uniformly (including the reference's
// airy gaps) would leave the logo and ALI HAMED no larger than before,
// which is not what "bring it as close as PassKit genuinely allows" means.
// So instead: gaps are compressed well below the reference's proportions
// (they are pure breathing room, the cheapest thing to cut), and the
// recovered space is spent on the two things the reference makes clearly
// dominant — the logo and ALI HAMED — both sized up from the previous
// revision. SOFTWARE ENGINEER/iOS DEVELOPER/the divider keep the
// reference's *rhythm* (each notably smaller than the line above it, in
// the same order) without matching its absolute proportions, which the
// fixed 123pt budget cannot hold alongside a generous logo and name.
const STRIP_PAD_TOP = 6;
const STRIP_LOGO_H = 50;
const STRIP_GAP_LOGO_NAME = 6;
const STRIP_NAME_FONT_SIZE = 26;
const STRIP_GAP_NAME_ROLE2 = 4;
const STRIP_ROLE2_FONT_SIZE = 14;
const STRIP_GAP_ROLE2_ROLE = 4;
const STRIP_ROLE_FONT_SIZE = 11;
const STRIP_GAP_ROLE_DIVIDER = 5;
// Reference ratio (divider width : card width) scaled onto STRIP_W is
// ~26pt; 32pt sits close to that while staying legible at @1x.
const STRIP_DIVIDER_W = 32;
const STRIP_DIVIDER_H = 2;
const STRIP_PAD_BOTTOM = 6;
// Letter-spacing-to-font-size ratio shared by SOFTWARE ENGINEER and iOS
// DEVELOPER, matching the tracked-caps look already used for the primary
// field in scripts/make-preview.mjs.
const STRIP_TRACKING_RATIO = 0.13;
// ALI HAMED alone gets wider tracking than the two role lines — the
// reference's name line is visibly more separated, letter to letter, than
// anything else in the block.
const STRIP_NAME_TRACKING_RATIO = 0.22;

// Exact hex the client asked for, and also circuit.mjs's own default
// accentColor — so SOFTWARE ENGINEER and the divider read as the same blue
// as the circuit motif's lit traces/nodes and the supplied AH logo, not a
// near-miss.
const STRIP_ACCENT_COLOR = '#00B7FF';
// Hex form of pass.json's own foregroundColor (rgb(245, 245, 247)) — ALI
// HAMED is rendered in this colour so it matches native field text
// elsewhere on the pass.
const STRIP_FOREGROUND_COLOR = '#F5F5F7';
// rgb(134, 134, 139) as a hex literal, so this file doesn't need to import
// or duplicate the rgb() string used for pass.json's labelColor. iOS
// DEVELOPER is rendered in this colour, matching the reference's secondary
// (grey) weight.
const LABEL_COLOR = '#86868B';

// circuit.mjs's own defaults (DEFAULT_BASE '#4B5563' at baseOpacity 0.7) are
// tuned for the page-sized motif, which has far more room to breathe. At the
// strip's cramped 123pt height the same grey read as light and busy, sitting
// forward and competing with the type instead of receding behind it — the
// reference's unlit traces are dark, quiet, barely-there against the black,
// with only the lit blue minority actually drawing the eye. A darker,
// lower-opacity override for just this composition pulls the unlit traces
// back without touching circuit.mjs's own defaults (still used by the page).
const STRIP_TRACE_BASE_COLOR = '#2A3038';
const STRIP_TRACE_BASE_OPACITY = 0.4;

// Circuit traces are kept clear of a column centred on the strip (mirrors
// CONTENT_CLEAR_X in site.mjs, which does the same for the page's motif).
// Margin around whichever baked-in line is actually widest, measured at
// render time rather than estimated.
const STRIP_CLEAR_MARGIN = 20;

/**
 * Renders `text` as a single rasterised line at this master's pixel scale,
 * returning both the PNG buffer and its exact pixel width/height so the
 * caller can centre it. `fontSize` is expressed in *logical* (1x) points;
 * scaling it (and letter-spacing) by `scale` here — rather than rasterising
 * at 1x and upscaling, or passing an SVG `density` — is what keeps text
 * crisp at every output density with no resampling blur, the same
 * guarantee the logo composite gets from sourcing an appropriately large
 * raster up front.
 */
async function renderStripLine(text, { weight, fontSize, color, scale, trackingRatio = STRIP_TRACKING_RATIO }) {
  const scaledSize = fontSize * scale;
  const svgString = await wordmarkSVG(text, {
    weight,
    fontSize: scaledSize,
    letterSpacing: scaledSize * trackingRatio,
    fill: color,
  });
  const [, w, h] = svgString.match(/width="([\d.]+)" height="([\d.]+)"/);
  const buffer = await sharp(Buffer.from(svgString)).png().toBuffer();
  return { buffer, width: Number(w), height: Number(h) };
}

async function renderStripMaster(config) {
  const { content } = config;
  const scale = 3; // build at @3x; @2x/@1x are downscaled from this buffer
  const dpi = 72 * scale;
  const canvasW = STRIP_W * scale;
  const canvasH = STRIP_H * scale;
  const pt = (v) => Math.round(v * scale); // logical points -> this render's pixels

  // ---- Measure/render every text line up front, at this master's scale --
  // 'regular' is the lightest Inter weight actually vendored (see
  // vendor/fonts/ — only Regular and SemiBold ship; there is no Light in
  // this repo and none may be added). The reference's ALI HAMED reads as a
  // true light weight; regular is the closest this build can get, paired
  // with substantially wider tracking (STRIP_NAME_TRACKING_RATIO) to carry
  // the rest of that "light and airy" impression semibold could not.
  const name = await renderStripLine(content.name, {
    weight: 'regular', fontSize: STRIP_NAME_FONT_SIZE, color: STRIP_FOREGROUND_COLOR, scale,
    trackingRatio: STRIP_NAME_TRACKING_RATIO,
  });
  // Same reasoning as ALI HAMED above: the reference sets SOFTWARE ENGINEER
  // noticeably lighter than the previous semibold rendering, wide-tracked
  // under the name, not as a bold banner in its own right.
  const role2 = await renderStripLine(content.roleSecondary, {
    weight: 'regular', fontSize: STRIP_ROLE2_FONT_SIZE, color: STRIP_ACCENT_COLOR, scale,
  });
  // walletRoleCase upper-cases while preserving "iOS"'s lowercase "i" (see
  // its own doc-comment above) — reused here, not duplicated, so the
  // strip's iOS DEVELOPER can never drift from that transform.
  const role = await renderStripLine(walletRoleCase(content.role), {
    weight: 'regular', fontSize: STRIP_ROLE_FONT_SIZE, color: LABEL_COLOR, scale,
  });

  // ---- Logo, sized directly in this render's own pixel scale (not scaled
  // up from an already-rounded 1x value), keeping rounding error to a small
  // fraction of a pixel --------------------------------------------------
  const logoHeightPx = pt(STRIP_LOGO_H);
  const logoWidthPx = Math.round(logoHeightPx * LOGO_ASPECT);
  const rasterBuffer = await readFile(logoRasterFor(logoWidthPx));
  const logoBuffer = await sharp(rasterBuffer)
    .resize({ width: logoWidthPx, height: logoHeightPx, fit: 'fill' }) // source rasters are already exactly 3:2, so this never distorts
    .toBuffer();

  // ---- Divider: a small filled rect, not text ----------------------------
  const dividerWidthPx = pt(STRIP_DIVIDER_W);
  const dividerHeightPx = pt(STRIP_DIVIDER_H);
  const dividerBuffer = await sharp({
    create: { width: dividerWidthPx, height: dividerHeightPx, channels: 4, background: STRIP_ACCENT_COLOR },
  }).png().toBuffer();

  // ---- Stack everything vertically, each item centred horizontally ------
  const items = [
    { buffer: logoBuffer, width: logoWidthPx, height: logoHeightPx, gapBefore: STRIP_PAD_TOP },
    { buffer: name.buffer, width: name.width, height: name.height, gapBefore: STRIP_GAP_LOGO_NAME },
    { buffer: role2.buffer, width: role2.width, height: role2.height, gapBefore: STRIP_GAP_NAME_ROLE2 },
    { buffer: role.buffer, width: role.width, height: role.height, gapBefore: STRIP_GAP_ROLE2_ROLE },
    { buffer: dividerBuffer, width: dividerWidthPx, height: dividerHeightPx, gapBefore: STRIP_GAP_ROLE_DIVIDER },
  ];

  let cursorY = 0;
  let widestWidthPx = 0;
  const composites = [];
  for (const item of items) {
    cursorY += pt(item.gapBefore);
    composites.push({
      input: item.buffer,
      left: Math.round((canvasW - item.width) / 2),
      top: Math.round(cursorY),
    });
    cursorY += item.height;
    widestWidthPx = Math.max(widestWidthPx, item.width);
  }
  cursorY += pt(STRIP_PAD_BOTTOM);

  // The whole block must fit inside the strip's fixed height at every
  // density — this is the same composition rasterised proportionally
  // larger each time, so checking it once here (at @3x, the tightest
  // rounding case) guarantees @2x/@1x fit too.
  if (cursorY > canvasH) {
    throw new PassError(
      `Wallet strip content (${(cursorY / scale).toFixed(1)}pt) overflows the ` +
      `fixed strip height (${STRIP_H}pt) — shrink the STRIP_* sizing constants ` +
      'in src/lib/pass.mjs.'
    );
  }

  // Same guard, the other axis: the widest baked-in line (always ALI HAMED
  // in practice — the name is both the largest font size and the widest
  // tracking ratio of anything in the block) must fit inside the strip's
  // fixed width too. This matters specifically because STRIP_NAME_TRACKING_RATIO
  // widens the name's measured advance; a sufficiently long config.content.name
  // could in principle push it past canvasW, which composite() would silently
  // clip (Math.round((canvasW - item.width) / 2) goes negative) rather than
  // fail loudly, so it is checked explicitly here instead.
  if (widestWidthPx > canvasW) {
    throw new PassError(
      `Wallet strip content (${(widestWidthPx / scale).toFixed(1)}pt wide) overflows the ` +
      `fixed strip width (${STRIP_W}pt) — shorten config.content.name/roleSecondary or ` +
      'reduce STRIP_NAME_TRACKING_RATIO/STRIP_TRACKING_RATIO in src/lib/pass.mjs.'
    );
  }

  // ---- Circuit background, kept clear of the centred content column -----
  const widestWidthPt = widestWidthPx / scale;
  const contentClearX = [
    (STRIP_W - widestWidthPt) / 2 - STRIP_CLEAR_MARGIN,
    (STRIP_W + widestWidthPt) / 2 + STRIP_CLEAR_MARGIN,
  ];
  const circuitSvgString = circuitSVG({
    width: STRIP_W,
    height: STRIP_H,
    seed: 'ali-hamed-wallet-strip',
    // preview/Ali-Hamed-Apple-Wallet-Pass-Updated.png runs its side circuits
    // the full height of the pass silhouette (~430pt) at a row roughly every
    // 11-12pt — far denser than this strip's previous density:1.4/default
    // gridStep:16 tuning (8 rows in 123pt). The strip only has 123pt of
    // canvas to work with regardless (see this file's header comment on why
    // the motif can't fill the whole card), so matching the reference's row
    // spacing rate, not its absolute row count, is what "as closely as the
    // strip's aspect allows" means here: a smaller gridStep plus higher
    // density packs proportionally more rows into the available height.
    density: 3,
    gridStep: 9,
    strokeWidth: 1,
    contentClearX,
    // See STRIP_TRACE_BASE_COLOR/STRIP_TRACE_BASE_OPACITY above: darker,
    // quieter unlit traces than circuit.mjs's page-tuned defaults, so the
    // motif recedes behind the identity block instead of competing with it.
    baseColor: STRIP_TRACE_BASE_COLOR,
    baseOpacity: STRIP_TRACE_BASE_OPACITY,
  });
  const circuitPng = await sharp(Buffer.from(circuitSvgString), { density: dpi })
    .png().toBuffer();

  return sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: '#000000' },
  })
    .composite([{ input: circuitPng, left: 0, top: 0 }, ...composites])
    .png().toBuffer();
}

async function renderStripAssets(config) {
  const master = await renderStripMaster(config); // 1125x369 (@3x)
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

export async function renderPassAssets(config) {
  const strips = await renderStripAssets(config);
  return new Map([
    ['icon.png', await renderIcon(29)],
    ['icon@2x.png', await renderIcon(58)],
    ['icon@3x.png', await renderIcon(87)],
    ['strip.png', strips.x1],
    ['strip@2x.png', strips.x2],
    ['strip@3x.png', strips.x3],
  ]);
}
