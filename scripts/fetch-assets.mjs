// One-time vendoring. Downloads are pinned to exact tags so the build is
// reproducible. Re-running is safe and idempotent.
import { mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);

const INTER_TAG = 'v4.1';
const INTER_ZIP = `https://github.com/rsms/inter/releases/download/${INTER_TAG}/Inter-4.1.zip`;
const ICONS_TAG = '13.0.0';
const ICONS = ['linkedin', 'github', 'whatsapp'];

async function fetchInter() {
  const fontDir = new URL('vendor/fonts/', root);
  await mkdir(fontDir, { recursive: true });
  const zipPath = new URL('Inter.zip', fontDir);

  console.log(`Downloading Inter ${INTER_TAG}...`);
  const res = await fetch(INTER_ZIP);
  if (!res.ok) throw new Error(`Inter download failed: HTTP ${res.status} from ${INTER_ZIP}`);
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));

  // -j junks directory paths, so this survives any layout change inside the zip.
  // fileURLToPath (not .pathname) because this project's directory contains a
  // space, and .pathname would percent-encode it to %20 before it reaches unzip.
  try {
    await run('unzip', ['-o', '-j', fileURLToPath(zipPath),
      '*Inter-Regular.ttf', '*Inter-SemiBold.ttf', '*OFL.txt', '*LICENSE.txt',
      '-d', fileURLToPath(fontDir)]);
  } catch (err) {
    // unzip exits 11 when one of several glob patterns matches nothing, even
    // if the other patterns extracted fine. The real Inter v4.1 zip only
    // ships LICENSE.txt (never OFL.txt), so *OFL.txt always misses — that's
    // expected, not fatal. Only re-throw for a genuine failure.
    if (err.code !== 11) throw err;
  }

  // unzip's exit code alone doesn't prove the fonts landed — exit 11 fires for
  // ANY unmatched pattern, and the code above tolerates it broadly (it only
  // ever expects *OFL.txt to miss). If a future release renames or drops
  // Inter-Regular.ttf or Inter-SemiBold.ttf, that too would exit 11 and get
  // swallowed above. So verify the fonts actually exist before declaring
  // success — never proceed with a missing font.
  for (const f of ['Inter-Regular.ttf', 'Inter-SemiBold.ttf']) {
    try {
      await access(new URL(f, fontDir));
    } catch {
      throw new Error(
        `unzip reported no match for ${f}. The Inter release layout may have ` +
        `changed. Extract it manually — see the fallback instructions below.`
      );
    }
  }

  await rm(zipPath);

  // The zip names its licence LICENSE.txt in some releases; normalise it.
  try {
    await readFile(new URL('OFL.txt', fontDir));
  } catch {
    const alt = await readFile(new URL('LICENSE.txt', fontDir), 'utf8');
    await writeFile(new URL('OFL.txt', fontDir), alt);
  }
  console.log('  vendor/fonts/Inter-{Regular,SemiBold}.ttf');
}

async function fetchIcons() {
  const iconDir = new URL('vendor/icons/', root);
  await mkdir(iconDir, { recursive: true });
  for (const name of ICONS) {
    const url = `https://raw.githubusercontent.com/simple-icons/simple-icons/${ICONS_TAG}/icons/${name}.svg`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Icon download failed: HTTP ${res.status} from ${url}`);
    await writeFile(new URL(`${name}.svg`, iconDir), await res.text());
    console.log(`  vendor/icons/${name}.svg`);
  }
}

try {
  await fetchInter();
  await fetchIcons();
  console.log('\nVendored assets ready. Commit them — the build must work offline.');
} catch (err) {
  console.error(`\nVendoring failed: ${err.message}`);
  console.error('\nManual fallback:');
  console.error(`  1. Download ${INTER_ZIP}`);
  console.error('     Extract Inter-Regular.ttf and Inter-SemiBold.ttf into vendor/fonts/');
  console.error('     Copy the OFL licence to vendor/fonts/OFL.txt');
  console.error(`  2. Save each of these into vendor/icons/<name>.svg:`);
  for (const n of ICONS) {
    console.error(`     https://raw.githubusercontent.com/simple-icons/simple-icons/${ICONS_TAG}/icons/${n}.svg`);
  }
  process.exit(1);
}
