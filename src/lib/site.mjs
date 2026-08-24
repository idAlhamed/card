import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { wordmarkSVG } from './text-path.mjs';

// Hand-authored glyphs live in src/icons; vendored brand marks in vendor/icons.
const ICON_DIRS = [
  new URL('../icons/', import.meta.url),
  new URL('../../vendor/icons/', import.meta.url),
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
      `Icon "${name}.svg" not found in src/icons/ or vendor/icons/. ` +
      'For brand marks, run: npm run fetch:assets'
    );
  }
  return raw
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')      // avoid double announcement
    .replace(/\s(role|width|height|fill)="[^"]*"/g, '')
    .replace(/<svg/, '<svg class="icon" aria-hidden="true" fill="currentColor"')
    .trim();
}

export async function stampHTML(html, config) {
  let out = html.replaceAll('{{CARD_URL}}', config.url.CARD_URL);

  for (const match of [...out.matchAll(/\{\{ICON:([a-z]+)\}\}/g)]) {
    out = out.replace(match[0], await inlineIcon(match[1]));
  }

  // Any surviving token is a typo that would otherwise ship visibly.
  const leftover = out.match(/\{\{[^}]+\}\}/);
  if (leftover) {
    throw new Error(`Unreplaced template token in HTML: ${leftover[0]}`);
  }
  return out;
}

/** 180x180 Add-to-Home-Screen icon: "AH" centred on black. */
export async function renderTouchIcon() {
  const mark = await wordmarkSVG('AH', {
    fontSize: 74, letterSpacing: 3, fill: '#F5F5F7',
  });
  return sharp({
    create: { width: 180, height: 180, channels: 4, background: '#000000' },
  })
    .composite([{ input: Buffer.from(mark), gravity: 'centre' }])
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
