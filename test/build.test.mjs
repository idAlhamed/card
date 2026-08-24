import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
// CORRECTION 1: this project's directory contains a space, which `.pathname`
// would percent-encode to %20 — Node would then fail to find the module.
// fileURLToPath() decodes it back to a real filesystem path.
const script = fileURLToPath(new URL('scripts/build.mjs', root));

test('the build completes and reports the Team ID as outstanding', async () => {
  const { stdout } = await run('node', [script]);
  assert.match(stdout, /Team ID/i, 'must tell Ali what is still missing');
  assert.match(stdout, /Build complete/);
});

test('produces every site artifact', async () => {
  for (const f of ['index.html', 'styles.css', 'ali-hamed.vcf',
    'assets/qr.svg', 'assets/qr.png', 'assets/apple-touch-icon.png', 'assets/og.png']) {
    await assert.doesNotReject(access(new URL(`docs/${f}`, root)), `missing docs/${f}`);
  }
});

test('the built page carries the real URL and no surviving tokens', async () => {
  const html = await readFile(new URL('docs/index.html', root), 'utf8');
  assert.ok(html.includes('https://idalhamed.github.io/card'));
  assert.doesNotMatch(html, /\{\{/, 'a template token survived into the output');
  assert.match(html, /<svg class="icon"/, 'icons must be inlined');
});

test('produces the print artwork', async () => {
  for (const f of ['card-front.svg', 'card-back.svg', 'card-front.pdf', 'card-back.pdf']) {
    await assert.doesNotReject(access(new URL(`print/${f}`, root)), `missing print/${f}`);
  }
});

test('produces the pass assets even without a Team ID', async () => {
  for (const f of ['icon.png', 'logo.png', 'logo@3x.png']) {
    await assert.doesNotReject(access(new URL(`wallet/AliHamed.pass/${f}`, root)));
  }
});

test('writes the NFC guide with the live URL', async () => {
  const md = await readFile(new URL('nfc/README.md', root), 'utf8');
  assert.ok(md.includes('https://idalhamed.github.io/card'));
});

test('--strict fails while the Team ID is unset', async () => {
  await assert.rejects(() => run('node', [script, '--strict']), (err) => {
    assert.notEqual(err.code, 0);
    return true;
  });
});
