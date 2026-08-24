import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { chmod, writeFile, unlink } from 'node:fs/promises';
import { inlineIcon, stampHTML, renderTouchIcon, renderOGImage } from '../src/lib/site.mjs';
import { validConfig } from './fixtures.mjs';

test('inlines an icon as a class-tagged, hidden SVG', async () => {
  const svg = await inlineIcon('linkedin');
  assert.match(svg, /^<svg/);
  assert.match(svg, /class="icon"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /fill="currentColor"/);
  assert.doesNotMatch(svg, /<title>/, 'titles would be announced twice by screen readers');
});

test('inlines the hand-authored envelope too', async () => {
  assert.match(await inlineIcon('email'), /class="icon"/);
});

test('names the file when an icon is missing', async () => {
  await assert.rejects(() => inlineIcon('mastodon'), /mastodon\.svg/);
});

test('replaces every CARD_URL token', async () => {
  const out = await stampHTML('<a href="{{CARD_URL}}">x</a>{{CARD_URL}}', validConfig());
  assert.equal(out, '<a href="https://idalhamed.github.io/card">x</a>https://idalhamed.github.io/card');
});

test('replaces icon tokens', async () => {
  const out = await stampHTML('{{ICON:github}}', validConfig());
  assert.match(out, /<svg[^>]*class="icon"/);
});

test('throws when any token survives', async () => {
  await assert.rejects(() => stampHTML('<p>{{TYPOD_TOKEN}}</p>', validConfig()),
    /TYPOD_TOKEN/);
});

test('renders a 180x180 touch icon', async () => {
  const meta = await sharp(await renderTouchIcon(validConfig())).metadata();
  assert.equal(meta.width, 180);
  assert.equal(meta.height, 180);
});

test('renderTouchIcon reads the monogram from config.content.name, not a hardcoded "AH"', async () => {
  const ali = validConfig(); // 'ALI HAMED' -> AH, same as the old hardcoded value
  const adam = validConfig();
  adam.content.name = 'Adam Harris'; // different full name, same AH monogram
  const jane = validConfig();
  jane.content.name = 'Jane Doe'; // different monogram entirely

  const [aliIcon, adamIcon, janeIcon] = await Promise.all([
    renderTouchIcon(ali), renderTouchIcon(adam), renderTouchIcon(jane),
  ]);

  assert.ok(
    aliIcon.equals(adamIcon),
    'ALI HAMED and Adam Harris both derive the AH monogram and must render byte-identical icons'
  );
  assert.ok(
    !aliIcon.equals(janeIcon),
    'a different monogram must render a different icon'
  );
});

test('renders a 1200x630 OG image', async () => {
  const meta = await sharp(await renderOGImage(validConfig())).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
});

test('surfaces a real I/O error from icon lookup instead of a misleading "not found" message', async () => {
  // A non-ENOENT failure (permissions, corrupt read, etc.) must not be
  // swallowed and reported as "not found" — that message tells someone to
  // run fetch:assets, which does nothing for a permissions problem and
  // doesn't even manage this hand-authored file.
  const path = new URL('../src/icons/__unreadable-test-icon__.svg', import.meta.url);
  await writeFile(path, '<svg></svg>');
  await chmod(path, 0o000);
  try {
    await assert.rejects(
      () => inlineIcon('__unreadable-test-icon__'),
      (err) => {
        assert.equal(err.code, 'EACCES');
        assert.doesNotMatch(err.message, /not found in src\/icons/);
        return true;
      }
    );
  } finally {
    await chmod(path, 0o644);
    await unlink(path);
  }
});

test('renderOGImage throws a legible error naming the field when copy overflows the canvas', async () => {
  // A config edit that makes content.role too long must not surface as
  // sharp's generic "image to composite must have same dimensions as or be
  // smaller than the canvas image" — it must name the offending config
  // field and both the rendered and available widths.
  const config = validConfig();
  config.content.role = 'iOS Developer, Swift Engineer, and Product Builder '.repeat(5);
  await assert.rejects(
    () => renderOGImage(config),
    (err) => {
      assert.match(err.message, /config\.content\.role/);
      assert.match(err.message, /renders \d+px/);
      assert.match(err.message, /available/);
      return true;
    }
  );
});
