import opentype from 'opentype.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FONTS = {
  regular: new URL('../../vendor/fonts/Inter-Regular.ttf', import.meta.url),
  semibold: new URL('../../vendor/fonts/Inter-SemiBold.ttf', import.meta.url),
};

const cache = new Map();

export async function loadFont(weight = 'semibold') {
  if (!FONTS[weight]) {
    throw new Error(`Unknown font weight "${weight}". Available: ${Object.keys(FONTS).join(', ')}`);
  }
  if (!cache.has(weight)) {
    let buf;
    try {
      buf = await readFile(FONTS[weight]);
    } catch {
      throw new Error(
        `Missing ${fileURLToPath(FONTS[weight])}. Run: npm run fetch:assets`
      );
    }
    // opentype.parse needs a plain ArrayBuffer, not a Node Buffer view.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    cache.set(weight, opentype.parse(ab));
  }
  return cache.get(weight);
}

/**
 * Lays out `text` glyph by glyph so letter-spacing can be applied.
 * The baseline sits at y = 0, so `box.y1` is negative for cap-height glyphs.
 */
export function textToPath(font, text, { fontSize = 100, letterSpacing = 0 } = {}) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const combined = new opentype.Path();
  let x = 0;
  for (const glyph of glyphs) {
    combined.extend(glyph.getPath(x, 0, fontSize));
    x += glyph.advanceWidth * scale + letterSpacing;
  }
  // The trailing letter-space is not part of the visible advance.
  const advance = glyphs.length ? x - letterSpacing : 0;
  return { d: combined.toPathData(3), advance, box: combined.getBoundingBox() };
}

export async function wordmarkSVG(text, {
  weight = 'semibold',
  fontSize = 100,
  letterSpacing = 0,
  fill = '#F5F5F7',
  padding = 0,
} = {}) {
  const font = await loadFont(weight);
  const { d, advance, box } = textToPath(font, text, { fontSize, letterSpacing });
  const width = advance + padding * 2;
  const height = (box.y2 - box.y1) + padding * 2;
  const dy = -box.y1 + padding;   // lift the baseline so ink starts at `padding`
  const w = width.toFixed(2);
  const h = height.toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">` +
    `<path transform="translate(${padding.toFixed(2)} ${dy.toFixed(2)})" ` +
    `d="${d}" fill="${fill}"/></svg>`;
}
