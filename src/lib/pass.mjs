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
      secondaryFields: [
        { key: 'role', label: content.roleSecondary, value: walletRoleCase(content.role) },
      ],
      // The tagline gets its own row beneath that, so it reads as its own
      // line rather than crowding the role pair.
      auxiliaryFields: [
        { key: 'tagline', label: '', value: content.taglineWallet },
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
// produces soft edges on small text (used below by renderLogoTitle).
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

  return sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: '#000000' },
  })
    .composite([
      { input: circuitPng, left: 0, top: 0 },
      { input: logo, left: logoLeft, top: logoTop },
    ])
    .png().toBuffer();
}

async function renderStripAssets() {
  const master = await renderStripMaster(); // 1125x369 (@3x)
  const [x2, x1] = await Promise.all([
    sharp(master).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer(),
    sharp(master).resize(STRIP_W, STRIP_H).png().toBuffer(),
  ]);
  return { x1, x2, x3: master };
}

// logo.png is now the pass TITLE, not the name: a small Apple mark followed
// by "Business Card", in labelColor, so the pass reads as a quiet category
// label when stacked among other passes in Wallet — that's what identifies
// it by type. The name itself moved to primaryFields (see buildPassJSON),
// where Wallet renders it far larger than the 18.8pt the 160x50pt logo slot
// ever allowed at 0.08em tracking.
//
// rgb(134, 134, 139) as a hex literal, so this file doesn't need to import
// or duplicate the rgb() string used for pass.json's labelColor.
const LABEL_COLOR = '#86868B';

const LOGO_TITLE = 'Business Card';

// 0.12em, matching the tracking used for other small-caps label text in
// this system (e.g. a "TECHNOLOGIES" caption) — tight enough to read as a
// caption, not a wordmark competing with the name.
const LOGO_TITLE_TRACKING = 0.06;

// The Apple mark + "Business Card" together sit at roughly this cap height
// inside the 50pt-tall logo slot (~11pt of 50pt): within the client's
// requested "10-12pt" range, small and quiet enough not to compete with
// the primaryField name.
const LOGO_CAP_HEIGHT_RATIO = 13.5 / 50;
// Gap between the Apple mark and "Business Card", as a fraction of the
// 160pt-wide slot.
const LOGO_GAP_RATIO = 6 / 160;

// U+F8FF PRIVATE USE ONE, the Apple logo glyph. Written as an escape, not a
// literal character, so the source file can't have this glyph silently
// mangled or dropped by an editor, terminal, or git filter that doesn't
// round-trip Private Use Area code points reliably.
const APPLE_LOGO_GLYPH = '\uF8FF';

// Renders the real Apple mark via the macOS system "Apple Symbols" font,
// which contains U+F8FF. Inter — the only font vendored into this repo —
// does not contain this glyph (verified: glyph index 0), and there is no
// legitimate alternative: hand-drawing an apple shape would redraw Apple's
// trademark from scratch, and vendoring an Apple-supplied logo image into
// the repo would redistribute it. Rendering the real glyph from the
// operating system's own font at build time, on the client's own Mac, is
// the defensible path — but it means logo.png depends on a font that only
// ships with macOS, so the asset is not guaranteed byte-reproducible on a
// machine without it.
//
// If "Apple Symbols" is missing, SVG text rendering doesn't throw — it
// silently falls back to a missing-glyph box or empty output. So this
// renders a probe glyph first and measures its ink coverage: a real Apple
// mark covers a substantial fraction of its probe canvas; a fallback covers
// close to none. Below that threshold this throws loudly rather than
// shipping a broken pass title.
async function renderAppleMark(targetHeight) {
  const probeSize = 200;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${probeSize}" height="${probeSize}">` +
    `<text x="0" y="${Math.round(probeSize * 0.82)}" font-family="Apple Symbols" ` +
    `font-size="${probeSize}" fill="${LABEL_COLOR}">${APPLE_LOGO_GLYPH}</text></svg>`;
  const rendered = await sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();

  const { data, info } = await sharp(rendered).raw().toBuffer({ resolveWithObject: true });
  let opaquePixels = 0;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] > 16) opaquePixels++;
  }
  const coverage = opaquePixels / (info.width * info.height);
  if (coverage < 0.03) {
    throw new Error(
      'Rendering the Apple logo glyph (U+F8FF) produced almost no visible ' +
      'pixels. "Apple Symbols" is likely unavailable on this machine, so ' +
      'the renderer fell back to a missing-glyph box instead of the real ' +
      'mark. wallet/AliHamed.pass/logo.png cannot be built without it — ' +
      'this build must run on a Mac with the system font installed.'
    );
  }

  return sharp(rendered).trim().resize({ height: targetHeight }).png().toBuffer();
}

async function renderLogoTitle(targetHeight) {
  const svg = await wordmarkSVG(LOGO_TITLE, {
    fontSize: RENDER_SIZE, letterSpacing: RENDER_SIZE * LOGO_TITLE_TRACKING, fill: LABEL_COLOR,
  });
  return sharp(Buffer.from(svg)).resize({ height: targetHeight }).png().toBuffer();
}

// Transparent background: Wallet composites the logo onto backgroundColor.
// The mark and title are rendered at a matched cap height, left-aligned
// flush to the slot's left edge, and vertically centred as a pair — small
// and quiet, so it reads as a title, not a second headline.
async function renderLogo(width, height) {
  const capHeight = Math.round(height * LOGO_CAP_HEIGHT_RATIO);
  const gap = Math.round(width * LOGO_GAP_RATIO);

  const [mark, title] = await Promise.all([
    renderAppleMark(capHeight),
    renderLogoTitle(capHeight),
  ]);
  const { width: markWidth } = await sharp(mark).metadata();
  const top = Math.round((height - capHeight) / 2);

  return sharp({
    create: {
      width, height, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: mark, left: 0, top },
      { input: title, left: markWidth + gap, top },
    ])
    .png().toBuffer();
}

// Every image this renders is now fixed, client-supplied artwork (the AH
// logo) or a fixed composition built from it — none of it varies with
// config.content.name any more (icon.png used to; see renderIcon above).
// _config is accepted-but-unused so build.mjs's call site (which still has
// a config to pass) doesn't need to change, matching the same convention
// already used by site.mjs's renderTouchIcon.
export async function renderPassAssets(_config) {
  const strips = await renderStripAssets();
  return new Map([
    ['icon.png', await renderIcon(29)],
    ['icon@2x.png', await renderIcon(58)],
    ['icon@3x.png', await renderIcon(87)],
    ['logo.png', await renderLogo(160, 50)],
    ['logo@2x.png', await renderLogo(320, 100)],
    ['logo@3x.png', await renderLogo(480, 150)],
    ['strip.png', strips.x1],
    ['strip@2x.png', strips.x2],
    ['strip@3x.png', strips.x3],
  ]);
}
