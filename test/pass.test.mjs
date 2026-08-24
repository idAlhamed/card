import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildPassJSON, renderPassAssets, PassError } from '../src/lib/pass.mjs';
import { validConfig } from './fixtures.mjs';

test('refuses to build while the Team ID is unset', () => {
  const c = validConfig();
  c.apple.teamIdentifier = '';
  assert.throws(() => buildPassJSON(c), /teamIdentifier/);
});

test('the Team ID error points at the outstanding manual step', () => {
  const c = validConfig();
  c.apple.teamIdentifier = '';
  assert.throws(() => buildPassJSON(c), /Membership/);
});

test('rejects a malformed Team ID', () => {
  const c = validConfig();
  c.apple.teamIdentifier = 'TOO-SHORT';
  assert.throws(() => buildPassJSON(c), PassError);
});

test('rejects a Pass Type ID missing the pass. prefix', () => {
  const c = validConfig();
  c.apple.passTypeIdentifier = 'com.alihamed.card';
  assert.throws(() => buildPassJSON(c), /pass\./);
});

test('the barcode message is exactly CARD_URL', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.barcodes[0].message, 'https://idalhamed.github.io/card');
  assert.equal(p.barcodes[0].format, 'PKBarcodeFormatQR');
  assert.equal(p.barcodes[0].messageEncoding, 'iso-8859-1');
});

test('uses the spec colours', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.backgroundColor, 'rgb(0,0,0)');
  assert.equal(p.foregroundColor, 'rgb(245,245,247)');
  assert.equal(p.labelColor, 'rgb(134,134,139)');
});

test('the primary field is the role, not the name', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.generic.primaryFields[0].value, 'iOS Developer');
  const all = JSON.stringify(p.generic.primaryFields);
  assert.doesNotMatch(all, /ALI HAMED/, 'the name belongs in logo.png, not a field');
});

test('technologies appear with preserved casing', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.generic.secondaryFields[0].value, 'Swift · SwiftUI · UIKit');
});

test('all four contacts are tappable on the back', () => {
  const back = buildPassJSON(validConfig()).generic.backFields;
  for (const key of ['linkedin', 'github', 'whatsapp', 'email']) {
    const field = back.find((f) => f.key === key);
    assert.ok(field, `missing back field ${key}`);
    assert.match(field.attributedValue, /^<a href="/);
    assert.ok(field.value, 'a plain value must exist as fallback');
  }
});

test('omits the update web service', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.webServiceURL, undefined);
  assert.equal(p.authenticationToken, undefined);
});

test('no Apple mark or reference anywhere in the pass', () => {
  assert.doesNotMatch(JSON.stringify(buildPassJSON(validConfig())), /apple/i);
});

test('renders all six required assets at exact sizes', async () => {
  const assets = await renderPassAssets();
  const expected = {
    'icon.png': [29, 29], 'icon@2x.png': [58, 58], 'icon@3x.png': [87, 87],
    'logo.png': [160, 50], 'logo@2x.png': [320, 100], 'logo@3x.png': [480, 150],
  };
  assert.deepEqual([...assets.keys()].sort(), Object.keys(expected).sort());
  for (const [name, [w, h]] of Object.entries(expected)) {
    const meta = await sharp(assets.get(name)).metadata();
    assert.equal(meta.width, w, `${name} width`);
    assert.equal(meta.height, h, `${name} height`);
    assert.equal(meta.format, 'png');
  }
});
