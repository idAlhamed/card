import { mkdir, writeFile, rm, copyFile, readFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, ConfigError } from '../src/lib/config.mjs';
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

// --config <path> lets tests point at an alternate config.json (e.g. one
// crafted to fail validation, or to overflow a rendered field) without
// touching the real config.json. Absent in normal use, so `loadConfig()`
// keeps its default of the project's own config.json.
const configFlagIndex = process.argv.indexOf('--config');
const configOverride = configFlagIndex !== -1
  ? pathToFileURL(process.argv[configFlagIndex + 1])
  : undefined;

// A malformed config.json is the failure Ali is most likely to hit — he can
// hand-edit it directly — so it must not surface as a raw stack trace.
// Anything other than ConfigError is unexpected and still crashes loudly.
let config;
try {
  config = configOverride ? await loadConfig(configOverride) : await loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(err.message);
  process.exit(1);
}

const CARD_URL = config.url.CARD_URL;
console.log(`Building for ${CARD_URL}\n`);

// ---- Site -------------------------------------------------------------
// docs/ is what GitHub Pages serves live. Everything below is built into a
// staging directory first; only once every step here has succeeded do we
// remove the old docs/ and rename the staging directory into place. Without
// this, a failure partway through (the QR round-trip assertion firing, an
// overlong field overflowing the OG image, anything) would leave docs/
// wiped or half-written — replacing a working live site with a broken one,
// with no rollback and nothing on disk distinguishing "built" from "died
// halfway through". rename() is atomic within a filesystem, which this is.
const staging = at('docs.tmp/');
const liveDocs = at('docs/');
const inStaging = (p) => new URL(p, staging);

await rm(staging, { recursive: true, force: true }); // clear a dead leftover from a crashed run
await mkdir(inStaging('assets/'), { recursive: true });

try {
  const html = await stampHTML(await readFile(at('src/index.html'), 'utf8'), config);
  await writeFile(inStaging('index.html'), html);
  await copyFile(at('src/styles.css'), inStaging('styles.css'));
  await writeFile(inStaging('ali-hamed.vcf'), buildVCard(config));
  console.log('  docs/index.html, styles.css, ali-hamed.vcf  (staged)');

  // ---- QR, with the round-trip guard -----------------------------------
  const qrPNG = await generateQRPNG(CARD_URL);
  await assertQRRoundTrip(CARD_URL, qrPNG);   // throws rather than shipping a dead code
  await writeFile(inStaging('assets/qr.png'), qrPNG);
  await writeFile(inStaging('assets/qr.svg'), await generateQRSVG(CARD_URL));
  console.log('  docs/assets/qr.{png,svg}  (round-trip verified, staged)');

  await writeFile(inStaging('assets/apple-touch-icon.png'), await renderTouchIcon(config));
  await writeFile(inStaging('assets/og.png'), await renderOGImage(config));
  console.log('  docs/assets/apple-touch-icon.png, og.png  (staged)');
} catch (err) {
  await rm(staging, { recursive: true, force: true }); // no dead staging dir left for next run
  throw err;
}

await rm(liveDocs, { recursive: true, force: true });
await rename(staging, liveDocs);
console.log('  docs/  (staged site swapped into place)');

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
