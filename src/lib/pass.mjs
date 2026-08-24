import sharp from 'sharp';
import { wordmarkSVG } from './text-path.mjs';

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

    generic: {
      // The name lives in primaryFields, where Wallet renders it at
      // primary-field size — far larger than the 160x50pt logo slot could
      // ever fit it at. logo.png instead carries a small Apple mark +
      // "BUSINESS CARD" title (see renderLogo below), which is what
      // identifies the pass by type when passes are stacked in Wallet.
      primaryFields: [
        { key: 'name', label: '', value: content.name },
      ],
      secondaryFields: [
        { key: 'role', label: 'ROLE', value: content.role },
      ],
      auxiliaryFields: [
        { key: 'stack', label: 'TECHNOLOGIES', value: content.technologies },
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
      altText: short,
    }],
  };
}

// Render large, then downscale: rasterising an SVG at its final small size
// produces soft edges on the 29px icon.
const RENDER_SIZE = 240;

// First letter of each of the first two whitespace-separated words,
// uppercased. 'ALI HAMED' -> 'AH'. A single-word name still yields a
// (one-letter) monogram rather than throwing.
export function monogram(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

async function renderIcon(size, initials) {
  const mark = await wordmarkSVG(initials, {
    fontSize: RENDER_SIZE, letterSpacing: RENDER_SIZE * 0.06, fill: '#F5F5F7',
  });
  const glyph = await sharp(Buffer.from(mark))
    .resize({ width: Math.round(size * 0.62), fit: 'inside' })
    .png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: '#000000' },
  }).composite([{ input: glyph, gravity: 'centre' }]).png().toBuffer();
}

// logo.png is now the pass TITLE, not the name: a small Apple mark followed
// by "BUSINESS CARD", in labelColor, so the pass reads as a quiet category
// label when stacked among other passes in Wallet — that's what identifies
// it by type. The name itself moved to primaryFields (see buildPassJSON),
// where Wallet renders it far larger than the 18.8pt the 160x50pt logo slot
// ever allowed at 0.08em tracking.
//
// rgb(134, 134, 139) as a hex literal, so this file doesn't need to import
// or duplicate the rgb() string used for pass.json's labelColor.
const LABEL_COLOR = '#86868B';

const LOGO_TITLE = 'BUSINESS CARD';

// 0.12em, matching the tracking used for other small-caps label text in
// this system (e.g. a "TECHNOLOGIES" caption) — tight enough to read as a
// caption, not a wordmark competing with the name.
const LOGO_TITLE_TRACKING = 0.12;

// The Apple mark + "BUSINESS CARD" together sit at roughly this cap height
// inside the 50pt-tall logo slot (~11pt of 50pt): within the client's
// requested "10-12pt" range, small and quiet enough not to compete with
// the primaryField name.
const LOGO_CAP_HEIGHT_RATIO = 11 / 50;
// Gap between the Apple mark and "BUSINESS CARD", as a fraction of the
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

// Reads the wordmark from config.content.name rather than hardcoding it, so
// editing the name in config.json doesn't leave the pass icon silently
// stale (the same drift class fixed elsewhere for vCard escaping, the OG
// bounds guard, and the icon error messages). logo.png no longer carries
// the name at all — see renderLogo above — so icon.png (the AH monogram)
// is now the only pass image that varies with config.content.name.
export async function renderPassAssets(config) {
  const name = config.content.name;
  const initials = monogram(name);
  return new Map([
    ['icon.png', await renderIcon(29, initials)],
    ['icon@2x.png', await renderIcon(58, initials)],
    ['icon@3x.png', await renderIcon(87, initials)],
    ['logo.png', await renderLogo(160, 50)],
    ['logo@2x.png', await renderLogo(320, 100)],
    ['logo@3x.png', await renderLogo(480, 150)],
  ]);
}
