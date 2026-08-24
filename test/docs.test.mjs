import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nfcReadme } from '../src/lib/docs.mjs';
import { validConfig } from './fixtures.mjs';

test('the NFC guide embeds the real URL, never a placeholder', () => {
  const md = nfcReadme(validConfig());
  assert.ok(md.includes('https://idalhamed.github.io/card'));
  assert.doesNotMatch(md, /CARD_URL|YOUR_|<url>/);
});

test('names a concrete tag type and app', () => {
  const md = nfcReadme(validConfig());
  assert.match(md, /NTAG21[356]/);
  assert.match(md, /NFC Tools/);
});

test('states that locking is irreversible', () => {
  assert.match(nfcReadme(validConfig()), /irreversible|permanent/i);
});

test('follows the URL when config changes', () => {
  const c = validConfig();
  c.url.CARD_URL = 'https://alihamed.com';
  assert.ok(nfcReadme(c).includes('https://alihamed.com'));
});
