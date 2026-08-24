import { mkdir, writeFile, rm, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/lib/config.mjs';
import { generateQRSVG, generateQRPNG, assertQRRoundTrip } from '../src/lib/qr.mjs';
import { buildVCard } from '../src/lib/vcard.mjs';
import { stampHTML, renderTouchIcon, renderOGImage } from '../src/lib/site.mjs';
import { buildPassJSON, renderPassAssets, PassError } from '../src/lib/pass.mjs';
import { buildCardSVG, buildCardPDF } from '../src/lib/print.mjs';
import { nfcReadme } from '../src/lib/docs.mjs';

const root = new URL('../', import.meta.url);
const at = (p) => new URL(p, root);
const strict = process.argv.includes('--strict');
const notices = [];

const config = await loadConfig();
const CARD_URL = config.url.CARD_URL;
console.log(`Building for ${CARD_URL}\n`);

// ---- Site -----------------------------------------------------------------
await rm(at('docs/'), { recursive: true, force: true });
await mkdir(at('docs/assets/'), { recursive: true });

const html = await stampHTML(await readFile(at('src/index.html'), 'utf8'), config);
await writeFile(at('docs/index.html'), html);
await copyFile(at('src/styles.css'), at('docs/styles.css'));
await writeFile(at('docs/ali-hamed.vcf'), buildVCard(config));
console.log('  docs/index.html, styles.css, ali-hamed.vcf');

// ---- QR, with the round-trip guard ----------------------------------------
const qrPNG = await generateQRPNG(CARD_URL);
await assertQRRoundTrip(CARD_URL, qrPNG);     // throws rather than shipping a dead code
await writeFile(at('docs/assets/qr.png'), qrPNG);
await writeFile(at('docs/assets/qr.svg'), await generateQRSVG(CARD_URL));
console.log('  docs/assets/qr.{png,svg}  (round-trip verified)');

await writeFile(at('docs/assets/apple-touch-icon.png'), await renderTouchIcon());
await writeFile(at('docs/assets/og.png'), await renderOGImage(config));
console.log('  docs/assets/apple-touch-icon.png, og.png');

// ---- Wallet ---------------------------------------------------------------
await mkdir(at('wallet/AliHamed.pass/'), { recursive: true });
for (const [name, buf] of await renderPassAssets(config)) {
  await writeFile(at(`wallet/AliHamed.pass/${name}`), buf);
}
console.log('  wallet/AliHamed.pass/  (6 image assets)');

try {
  const pass = buildPassJSON(config);
  await writeFile(at('wallet/AliHamed.pass/pass.json'), JSON.stringify(pass, null, 2));
  console.log('  wallet/AliHamed.pass/pass.json');
} catch (err) {
  if (!(err instanceof PassError)) throw err;
  // Expected until the Pass Type ID exists. The website must not be blocked.
  await rm(at('wallet/AliHamed.pass/pass.json'), { force: true });
  notices.push(
    `pass.json was NOT written: ${err.message}\n` +
    '     Everything else built normally. See wallet/README.md.'
  );
}

// ---- Print ----------------------------------------------------------------
await mkdir(at('print/'), { recursive: true });
for (const face of ['front', 'back']) {
  await writeFile(at(`print/card-${face}.svg`), await buildCardSVG(face, config));
  // CORRECTION 1: this project's directory contains a space, which `.pathname`
  // would percent-encode to %20 — createWriteStream would then try to write
  // into a directory that doesn't exist. fileURLToPath() decodes it back to
  // a real filesystem path.
  await buildCardPDF(face, config, fileURLToPath(at(`print/card-${face}.pdf`)));
}
console.log('  print/card-{front,back}.{svg,pdf}');

// ---- NFC ------------------------------------------------------------------
await mkdir(at('nfc/'), { recursive: true });
await writeFile(at('nfc/README.md'), nfcReadme(config));
console.log('  nfc/README.md');

// ---- Report ---------------------------------------------------------------
console.log('\nBuild complete.');
if (notices.length) {
  console.log('\nOutstanding:');
  for (const n of notices) console.log(`  -  ${n}`);
  if (strict) {
    console.error('\n--strict was set and items are outstanding.');
    process.exit(1);
  }
}
