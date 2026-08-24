import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

test('the root README covers running locally and deploying', async () => {
  const md = await read('README.md');
  assert.match(md, /npm run dev/);
  assert.match(md, /npm run build/);
  assert.match(md, /GitHub Pages/);
  assert.match(md, /\/docs/, 'must name the Pages source folder');
  assert.match(md, /idalhamed\.github\.io\/card/);
});

test('the root README warns against committing the reference images', async () => {
  assert.match(await read('README.md'), /IMG_3890|reference image/i);
});

test('the wallet README lists every signing step and the -legacy caveat', async () => {
  const md = await read('wallet/README.md');
  assert.match(md, /Pass Type ID/);
  assert.match(md, /Certificate Assistant/);
  assert.match(md, /Export 2 items/);
  assert.match(md, /WWDR/);
  assert.match(md, /Team ID/);
  assert.match(md, /-legacy/);
  assert.match(md, /AirDrop/);
});

test('the wallet README states plainly that an unsigned pass will not open', async () => {
  assert.match(await read('wallet/README.md'), /will not open/i);
});

test('the print README carries the printer specifications', async () => {
  const md = await read('print/README.md');
  assert.match(md, /85\.6/);
  assert.match(md, /3\s?mm/);
  // CORRECTION: the brief's original regex — /60,\s?50,\s?50,\s?100|60\/50\/50\/100/ —
  // does not match the prose "CMYK 60 / 50 / 50 / 100" (spaces around the
  // slashes) that the print README actually carries. Tolerate whitespace
  // around each separator while still pinning all four channel values.
  assert.match(md, /60\s*\/\s*50\s*\/\s*50\s*\/\s*100/);
  assert.match(md, /matte/i);
});
