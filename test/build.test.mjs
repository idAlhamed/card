import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
// CORRECTION 1: this project's directory contains a space, which `.pathname`
// would percent-encode to %20 — Node would then fail to find the module.
// fileURLToPath() decodes it back to a real filesystem path.
const script = fileURLToPath(new URL('scripts/build.mjs', root));

const hash = async (url) => createHash('sha256').update(await readFile(url)).digest('hex');

test('the build completes and reports the Team ID as outstanding', async () => {
  const { stdout } = await run('node', [script]);
  assert.match(stdout, /Team ID/i, 'must tell Ali what is still missing');
  assert.match(stdout, /Build complete/);
});

test('leaves the live docs/ untouched when a build step fails after it would previously have been wiped', async () => {
  // Baseline: the docs/ the previous test just built successfully.
  const beforeHtml = await hash(new URL('docs/index.html', root));
  const beforeOg = await hash(new URL('docs/assets/og.png', root));

  // Force a real, late-stage failure — renderOGImage's own overflow guard —
  // via an otherwise-valid config with an absurdly long content.name. This
  // fires after html/css/vcf and the QR assets would already have been
  // written under the pre-fix code, which is exactly the scenario that used
  // to leave a half-written site in the live docs/.
  const dir = await mkdtemp(join(tmpdir(), 'ali-card-build-test-'));
  const configPath = join(dir, 'config.json');
  const rawConfig = JSON.parse(await readFile(new URL('config.json', root), 'utf8'));
  rawConfig.content.name = 'A'.repeat(400);
  await writeFile(configPath, JSON.stringify(rawConfig));

  try {
    await assert.rejects(() => run('node', [script, '--config', configPath]));

    // The live docs/ must be byte-identical to before the failed run.
    assert.equal(await hash(new URL('docs/index.html', root)), beforeHtml,
      'a failed build must not touch the live docs/index.html');
    assert.equal(await hash(new URL('docs/assets/og.png', root)), beforeOg,
      'a failed build must not touch the live docs/assets/og.png');

    // No dead staging directory left behind for the next run to trip over.
    await assert.rejects(access(new URL('docs.tmp/', root)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  // A normal build afterwards must still succeed and reproduce the same site.
  const { stdout } = await run('node', [script]);
  assert.match(stdout, /Build complete/);
  assert.equal(await hash(new URL('docs/index.html', root)), beforeHtml,
    'a normal rebuild must reproduce the same docs/index.html');
  assert.equal(await hash(new URL('docs/assets/og.png', root)), beforeOg,
    'a normal rebuild must reproduce the same docs/assets/og.png');
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
    assert.equal(err.code, 1, 'the notice-to-failure path exits exactly 1');
    return true;
  });
});

test('a malformed config fails cleanly, with no stack trace', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ali-card-build-test-'));
  const configPath = join(dir, 'config.json');
  const rawConfig = JSON.parse(await readFile(new URL('config.json', root), 'utf8'));
  rawConfig.url.CARD_URL = 'YOUR_URL_HERE'; // a placeholder, per ConfigError's PLACEHOLDER guard
  await writeFile(configPath, JSON.stringify(rawConfig));

  try {
    await assert.rejects(() => run('node', [script, '--config', configPath]), (err) => {
      assert.equal(err.code, 1, 'a bad config exits exactly 1');
      assert.match(err.stderr, /placeholder/i, 'the ConfigError message must reach the user');
      assert.doesNotMatch(err.stderr, /\s+at\s/, 'no stack trace for an expected config error');
      assert.doesNotMatch(err.stderr, /Node\.js v/, 'no Node crash footer for an expected config error');
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
