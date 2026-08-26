// Renders review previews for the redesign-foundations phase: the AH
// circuit monogram and the circuit-trace background motif, so they can be
// checked visually before the page/pass/print phases consume them. Nothing
// here is a build artifact — everything lands under preview/_foundations/.
//
// Deterministic: no timestamps, no randomness, no network access. Running
// it twice on an unchanged tree produces byte-identical output.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { monogramSVG } from '../src/lib/monogram.mjs';
import { circuitSVG } from '../src/lib/circuit.mjs';

const root = new URL('../', import.meta.url);
const outDir = new URL('preview/_foundations/', root);

const BLACK = '#0A0A0C';
const ACCENT = '#00B7FF';

async function render(name, svg) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(new URL(name, outDir), png);
  console.log(`  preview/_foundations/${name}  (${png.length} bytes)`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  // Monogram: blue-on-black (the page/wallet treatment) and white-on-black
  // (the mono variant needed for print).
  await render('monogram-blue.png', monogramSVG({ size: 480, color: ACCENT, background: BLACK }));
  await render('monogram-white.png', monogramSVG({ size: 480, color: '#FFFFFF', background: BLACK }));

  // Circuit motif at the three target aspect ratios: a phone page, a
  // 375x123pt Wallet strip, and an 85.6x54mm card (rendered at 10px/mm).
  await render('circuit-page.png', circuitSVG({
    width: 390, height: 844, seed: 'page', density: 1, background: BLACK,
  }));
  await render('circuit-wallet-strip.png', circuitSVG({
    width: 375, height: 123, seed: 'wallet', density: 1.4, background: BLACK,
  }));
  await render('circuit-card.png', circuitSVG({
    width: 856, height: 540, seed: 'card', density: 0.8, background: BLACK,
  }));

  console.log('\nFoundations previews rendered under preview/_foundations/.');
}

main();
