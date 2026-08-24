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

test('uses the spec colours, in Apple\'s documented spaced rgb() format', () => {
  const p = buildPassJSON(validConfig());
  // PassKit's tolerance for the compact 'rgb(0,0,0)' form is unverified on
  // a real device; the spaced form matches Apple's documented examples
  // (e.g. "rgb(23, 187, 82)") and costs nothing to guarantee.
  assert.equal(p.backgroundColor, 'rgb(0, 0, 0)');
  assert.equal(p.foregroundColor, 'rgb(245, 245, 247)');
  assert.equal(p.labelColor, 'rgb(134, 134, 139)');
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

test('escapes " and & in back-field href/text so the anchor cannot break out', () => {
  const c = validConfig();
  // A real-world value: '&' is a common query separator, '"' is the one
  // character that can terminate the href attribute early.
  c.contacts.email = 'ali"o&reilly@example.com';
  const p = buildPassJSON(c);
  const field = p.generic.backFields.find((f) => f.key === 'email');

  // Exact string, not just "doesn't crash": also proves '&' is escaped
  // FIRST, otherwise the '&' introduced by escaping '"' would itself get
  // re-escaped into '&amp;quot;'.
  assert.equal(
    field.attributedValue,
    '<a href="mailto:ali&quot;o&amp;reilly@example.com">ali&quot;o&amp;reilly@example.com</a>'
  );
  // No unescaped '"' anywhere: one would close the href attribute early and
  // let the rest of the string escape into the tag as bare attributes/markup.
  assert.doesNotMatch(field.attributedValue, /href="[^"]*"[^>]/);
  assert.match(field.attributedValue, /^<a href="[^"]*">[^<]*<\/a>$/);
  // The plain-value fallback is untouched HTML-wise (it isn't rendered as markup).
  assert.equal(field.value, 'ali"o&reilly@example.com');
});

test('renders all six required assets at exact sizes', async () => {
  const assets = await renderPassAssets(validConfig());
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

test('renderPassAssets reads the wordmark from config.content.name, not a hardcoded value', async () => {
  const ali = validConfig();
  const jane = validConfig();
  jane.content.name = 'JANE DOE';

  const [aliAssets, janeAssets] = await Promise.all([
    renderPassAssets(ali),
    renderPassAssets(jane),
  ]);

  assert.ok(
    !aliAssets.get('logo.png').equals(janeAssets.get('logo.png')),
    'a name edited in config.json must change the rendered logo, or Ali\'s pass silently drifts from his config'
  );
});

test('the icon monogram is derived from the first two words of config.content.name', async () => {
  const ali = validConfig(); // 'ALI HAMED' -> AH, same as the old hardcoded value
  const adam = validConfig();
  adam.content.name = 'Adam Harris'; // different full name, same AH monogram
  const jane = validConfig();
  jane.content.name = 'Jane Doe'; // different monogram entirely

  const [aliAssets, adamAssets, janeAssets] = await Promise.all([
    renderPassAssets(ali),
    renderPassAssets(adam),
    renderPassAssets(jane),
  ]);

  assert.ok(
    aliAssets.get('icon.png').equals(adamAssets.get('icon.png')),
    'ALI HAMED and Adam Harris both derive the AH monogram and must render identical icons'
  );
  assert.ok(
    !aliAssets.get('icon.png').equals(janeAssets.get('icon.png')),
    'a different monogram must render a different icon'
  );
});

test('a single-word name produces a one-letter monogram without throwing', async () => {
  const c = validConfig();
  c.content.name = 'Cher';
  await assert.doesNotReject(() => renderPassAssets(c));
});
