import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('Inter TTFs are vendored', async () => {
  for (const f of ['Inter-Regular.ttf', 'Inter-SemiBold.ttf']) {
    await assert.doesNotReject(access(new URL(`vendor/fonts/${f}`, root)),
      `missing vendor/fonts/${f} — run: npm run fetch:assets`);
  }
});

test('the OFL licence travels with the font', async () => {
  const licence = await readFile(new URL('vendor/fonts/OFL.txt', root), 'utf8');
  assert.match(licence, /SIL OPEN FONT LICENSE/i);
});

test('brand icons are vendored as single-path SVGs', async () => {
  for (const name of ['linkedin', 'github', 'whatsapp']) {
    const svg = await readFile(new URL(`vendor/icons/${name}.svg`, root), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/, `${name}.svg must use a 24x24 box`);
    assert.match(svg, /<path d="/, `${name}.svg must contain path data`);
  }
});

test('Lucide icons are vendored for the expertise grid and buttons', async () => {
  const names = [
    'smartphone', 'layers', 'gauge', 'app-window', 'cloud-upload',
    'lightbulb', 'code-xml', 'shield-check', 'users',
    'user-plus', 'phone', 'mail',
  ];
  for (const name of names) {
    const svg = await readFile(new URL(`vendor/lucide/${name}.svg`, root), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/, `${name}.svg must use a 24x24 box`);
    assert.match(svg, /stroke="currentColor"/, `${name}.svg must be recolourable via currentColor`);
  }
});

test('the Lucide ISC licence travels with the icons', async () => {
  const licence = await readFile(new URL('vendor/lucide/LICENSE', root), 'utf8');
  assert.match(licence, /ISC License/);
});
