import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../wallet/sign-pass.sh', import.meta.url));

async function runIn(env = {}) {
  try {
    const { stdout, stderr } = await run('bash', [script], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('exits non-zero and names the missing certificate', async () => {
  const certs = await mkdtemp(join(tmpdir(), 'certs-'));
  const passDir = await mkdtemp(join(tmpdir(), 'pass-'));
  await mkdir(join(passDir, 'AliHamed.pass'), { recursive: true });
  await writeFile(join(passDir, 'AliHamed.pass', 'pass.json'), '{}');

  const r = await runIn({ PASS_CERT_DIR: certs, PASS_BUNDLE_DIR: join(passDir, 'AliHamed.pass') });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /No \.p12/);
  assert.match(r.stderr, /Keychain Access/, 'must name the outstanding manual step');
});

test('exits non-zero when the pass bundle has not been built', async () => {
  const certs = await mkdtemp(join(tmpdir(), 'certs-'));
  const r = await runIn({ PASS_CERT_DIR: certs, PASS_BUNDLE_DIR: '/nonexistent/AliHamed.pass' });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /npm run build/);
});

test('never writes a .pkpass when a guard trips', async () => {
  const certs = await mkdtemp(join(tmpdir(), 'certs-'));
  const dist = await mkdtemp(join(tmpdir(), 'dist-'));
  await runIn({ PASS_CERT_DIR: certs, PASS_DIST_DIR: dist, PASS_BUNDLE_DIR: '/nonexistent' });
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(dist), []);
});
