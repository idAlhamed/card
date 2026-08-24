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
  // Not pinned to today's literal domain: CARD_URL is set only in
  // config.json, and this README quotes it purely as an example — pinning
  // the literal here would fail npm test on nothing but a config.json edit,
  // with a failure that looks like a config-loader bug rather than a stale doc.
  assert.match(md, /\*\*Live:\*\*\s*https:\/\/\S+/, 'must show a live URL example');
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
