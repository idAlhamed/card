import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { wordmarkSVG } from './text-path.mjs';
import { circuitSVG } from './circuit.mjs';
import { LOGO_ASPECT, logoRasterFor } from './logo.mjs';

// Hand-authored glyphs live in src/icons; vendored brand marks in
// vendor/icons; vendored Lucide line icons (buttons, expertise grid, the
// social row's envelope) in vendor/lucide.
const ICON_DIRS = [
  new URL('../icons/', import.meta.url),
  new URL('../../vendor/icons/', import.meta.url),
  new URL('../../vendor/lucide/', import.meta.url),
];

export async function inlineIcon(name) {
  let raw = null;
  for (const dir of ICON_DIRS) {
    try {
      raw = await readFile(new URL(`${name}.svg`, dir), 'utf8');
      break;
    } catch (err) {
      // Only "not in this directory" is expected here. Anything else — a
      // permissions failure, a corrupt read — is a real problem and must
      // surface with its own message and code, not get relabeled "not found".
      if (err.code !== 'ENOENT') throw err;
    }
  }
  if (raw === null) {
    throw new Error(
      `Icon "${name}.svg" not found in src/icons/, vendor/icons/ or vendor/lucide/. ` +
      'For brand marks, run: npm run fetch:assets'
    );
  }

  // Lucide icons are stroke-drawn outlines (`fill="none"`, `stroke="currentColor"`
  // on the <svg> root); the vendored brand marks and the hand-authored email
  // glyph are solid shapes with no fill/stroke of their own, relying on the
  // browser's default black fill. Blindly forcing `fill="currentColor"` onto
  // every icon (the previous behaviour) is correct for the second group but
  // wrong for the first: it fills in the outline icons' interiors instead of
  // just stroking them. So the root `fill` this function stamps on is
  // conditional on what the source file itself declared.
  const isStrokeIcon = /<svg[^>]*\sfill="none"/.test(raw);
  const rootFill = isStrokeIcon ? 'none' : 'currentColor';

  let out = raw
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')      // avoid double announcement
    .trim();

  // Strip role/width/height/fill ONLY from the root <svg ...> tag, never from
  // its children. Lucide's smartphone icon draws its body as
  // `<rect width="14" height="20" .../>` — a previous version of this
  // function stripped width/height from every element, which zeroed that
  // rect's own size (not just the icon's display size) and rendered it
  // invisible.
  out = out.replace(/^<svg\b[^>]*>/, (openTag) =>
    openTag
      .replace(/\s(role|width|height|fill)="[^"]*"/g, '')
      .replace(/^<svg/, `<svg class="icon" aria-hidden="true" fill="${rootFill}"`)
  );

  return out;
}

/**
 * Renders the shared circuit-trace motif (src/lib/circuit.mjs) as the
 * page's decorative background layer. The generated SVG carries its own
 * explicit width/height so it renders correctly on its own; those are
 * stripped in favour of `preserveAspectRatio="xMidYMid slice"` so CSS can
 * scale it to fill its container at any viewport size without distorting
 * the traces' true 45-degree diagonals or letterboxing at odd aspect ratios.
 */
export function renderCircuitBackground(opts = {}) {
  const svg = circuitSVG({ width: 390, height: 844, seed: 'ali-hamed-page', ...opts });
  const out = svg.replace(
    /^<svg xmlns="([^"]+)" width="\d+" height="\d+" (viewBox="[^"]+")/,
    '<svg xmlns="$1" preserveAspectRatio="xMidYMid slice" $2'
  );
  if (out === svg) {
    // circuitSVG()'s own opening-tag format is pinned by its test suite, but
    // guard here too: a silent no-op would ship the background un-cropped
    // (default "meet"), not a hard failure — much easier to miss.
    throw new Error(
      'renderCircuitBackground: circuitSVG() output format changed; update the prefix rewrite.'
    );
  }
  return out;
}

export async function stampHTML(html, config) {
  let out = html.replaceAll('{{CARD_URL}}', config.url.CARD_URL);

  if (out.includes('{{CIRCUIT}}')) {
    out = out.replace('{{CIRCUIT}}', renderCircuitBackground());
  }

  // Icon names may contain hyphens (Lucide: "user-plus", "app-window",
  // "cloud-upload", "code-xml", "shield-check").
  for (const match of [...out.matchAll(/\{\{ICON:([a-z-]+)\}\}/g)]) {
    out = out.replace(match[0], await inlineIcon(match[1]));
  }

  // Any surviving token is a typo that would otherwise ship visibly.
  const leftover = out.match(/\{\{[^}]+\}\}/);
  if (leftover) {
    throw new Error(`Unreplaced template token in HTML: ${leftover[0]}`);
  }
  return out;
}

// The apple-touch-icon renders the client-supplied AH logo verbatim, at a
// fixed size, so the Add-to-Home-Screen icon matches the identity used on
// the page itself. It intentionally does NOT depend on config.content.name
// (or anything else in config) any more — the mark is fixed artwork, not a
// name-derived monogram — but still accepts (and ignores) a config argument
// so existing call sites don't need to change.
/** 180x180 Add-to-Home-Screen icon: the supplied AH logo centred on black. */
export async function renderTouchIcon(_config) {
  const width = 144; // leaves an even margin inside the 180x180 canvas
  const height = Math.round(width / LOGO_ASPECT); // 96 — preserves the supplied 1200x800 ratio exactly
  const rasterBuffer = await readFile(logoRasterFor(width)); // sharp() doesn't accept a URL input directly
  const mark = await sharp(rasterBuffer)
    .resize({ width, height, fit: 'fill' }) // source rasters are already exactly 3:2, so this never distorts
    .toBuffer();
  return sharp({
    create: { width: 180, height: 180, channels: 4, background: '#000000' },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer();
}

const OG_CANVAS = { width: 1200, height: 630 };

/**
 * Confirms a rendered wordmark fits within the canvas at the position it will
 * be composited at. A config edit that makes a field too long must fail with
 * a message naming the field and the numbers involved, not sharp's generic
 * "image to composite must have same dimensions as or be smaller than the
 * canvas image", which names no file and no cause.
 */
async function assertFitsCanvas(fieldPath, svgBuffer, { top, left }) {
  const { width, height } = await sharp(svgBuffer).metadata();
  const availableWidth = OG_CANVAS.width - left;
  const availableHeight = OG_CANVAS.height - top;
  if (width > availableWidth || height > availableHeight) {
    throw new Error(
      `config.content.${fieldPath} is too long for the link-preview image: ` +
      `renders ${width}px by ${height}px, but only ${availableWidth}px by ${availableHeight}px ` +
      `is available at top:${top}, left:${left} on a ${OG_CANVAS.width}x${OG_CANVAS.height} canvas. ` +
      'Shorten it, or reduce the fontSize in renderOGImage.'
    );
  }
}

/** 1200x630 link-preview card: the wordmark and role on black. */
export async function renderOGImage(config) {
  const name = Buffer.from(await wordmarkSVG(config.content.name, {
    fontSize: 92, letterSpacing: 13, fill: '#F5F5F7',
  }));
  const role = Buffer.from(await wordmarkSVG(config.content.role, {
    weight: 'regular', fontSize: 38, fill: '#98989D',
  }));

  const namePosition = { top: 262, left: 96 };
  const rolePosition = { top: 380, left: 100 };

  await assertFitsCanvas('name', name, namePosition);
  await assertFitsCanvas('role', role, rolePosition);

  return sharp({
    create: { ...OG_CANVAS, channels: 4, background: '#000000' },
  })
    .composite([
      { input: name, ...namePosition },
      { input: role, ...rolePosition },
    ])
    .png()
    .toBuffer();
}
