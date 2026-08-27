// The AH logo is CLIENT-SUPPLIED FINISHED ARTWORK. It is used verbatim.
//
// Do not redraw, recreate, trace, reinterpret, simplify, optimise or modify
// it in any way. Its geometry, proportions, circuit traces, nodes, spacing,
// stroke appearance and aspect ratio are fixed by the supplied files. This
// module only LOCATES and READS them — it never rewrites their contents.
//
// A previous generated monogram was rejected and removed; nothing here
// regenerates a mark.
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

/** The master vector. Use wherever vector artwork is supported. */
export const LOGO_SVG = new URL('preview/ah-logo.svg', root);

/** Supplied raster exports, keyed by their natural width. */
export const LOGO_RASTERS = {
  300: new URL('preview/ah-logo-300x200.png', root),
  600: new URL('preview/ah-logo-600x400.png', root),
  1200: new URL('preview/ah-logo-1200x800.png', root),
};

/** Supplied print artwork. Use for print output where appropriate. */
export const LOGO_PRINT_PDF = new URL('preview/ah-logo-print.pdf', root);

/** The supplied artwork's aspect ratio (1200x800). Must be preserved. */
export const LOGO_ASPECT = 1200 / 800;

/** Returns the master SVG exactly as supplied — no transformation applied. */
export async function logoSVG() {
  return readFile(LOGO_SVG, 'utf8');
}

/** Returns the master SVG as a Buffer, for rasterisers that want bytes. */
export async function logoSVGBuffer() {
  return readFile(LOGO_SVG);
}

/**
 * Picks the supplied raster whose natural width is the smallest one at or
 * above `targetWidth`, so the logo is never upscaled past its export.
 * Falls back to the largest supplied export.
 */
export function logoRasterFor(targetWidth) {
  const widths = Object.keys(LOGO_RASTERS).map(Number).sort((a, b) => a - b);
  const pick = widths.find((w) => w >= targetWidth) ?? widths[widths.length - 1];
  return LOGO_RASTERS[pick];
}

/** Height that preserves the supplied aspect ratio for a given width. */
export function logoHeightFor(width) {
  return width / LOGO_ASPECT;
}
