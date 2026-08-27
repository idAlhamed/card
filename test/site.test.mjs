import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { chmod, writeFile, unlink } from 'node:fs/promises';
import {
  inlineIcon, stampHTML, renderTouchIcon, renderOGImage, renderCircuitBackground,
} from '../src/lib/site.mjs';
import { validConfig } from './fixtures.mjs';

test('inlines an icon as a class-tagged, hidden SVG', async () => {
  const svg = await inlineIcon('linkedin');
  assert.match(svg, /^<svg/);
  assert.match(svg, /class="icon"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /fill="currentColor"/);
  assert.doesNotMatch(svg, /<title>/, 'titles would be announced twice by screen readers');
});

// The hand-authored src/icons/email.svg was removed: the redesigned page uses
// Lucide's `mail` instead, so nothing referenced it any more.
test('inlines the Lucide mail icon used for the email link', async () => {
  assert.match(await inlineIcon('mail'), /class="icon"/);
});

test('finds vendored Lucide line icons too', async () => {
  assert.match(await inlineIcon('user-plus'), /class="icon"/);
});

// Lucide icons are stroke-drawn outlines (`fill="none"` on the source
// <svg>). The old blanket `fill="currentColor"` override (correct for the
// solid brand marks) would fill their interiors solid instead of leaving
// them as clean outlines, breaking the thin-line style the redesign uses
// throughout (buttons, the expertise grid, the email icon).
test('preserves fill="none" on stroke-drawn icons instead of filling them solid', async () => {
  const svg = await inlineIcon('phone');
  assert.match(svg, /class="icon"[^>]*fill="none"/);
  assert.match(svg, /stroke="currentColor"/);
});

test('still fills solid icons with currentColor', async () => {
  const svg = await inlineIcon('linkedin');
  assert.match(svg, /class="icon"[^>]*fill="currentColor"/);
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

test('replaces hyphenated icon tokens too (Lucide names like "user-plus", "app-window")', async () => {
  const out = await stampHTML('{{ICON:user-plus}} {{ICON:app-window}}', validConfig());
  assert.doesNotMatch(out, /\{\{/);
  assert.equal((out.match(/<svg class="icon"/g) ?? []).length, 2);
});

test('replaces the circuit background token with a self-contained, aspect-preserving SVG', async () => {
  const out = await stampHTML('<div class="circuit">{{CIRCUIT}}</div>', validConfig());
  assert.doesNotMatch(out, /\{\{/);
  assert.match(out, /<div class="circuit"><svg[^>]*preserveAspectRatio="xMidYMid slice"[^>]*>/);
});

test('renderCircuitBackground() is deterministic and self-contained', () => {
  assert.equal(renderCircuitBackground(), renderCircuitBackground());
  const svg = renderCircuitBackground();
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" preserveAspectRatio="xMidYMid slice"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /<\/svg>$/);
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

// The touch icon now renders the client-supplied AH logo verbatim rather
// than a name-derived monogram, so the Add-to-Home-Screen icon matches the
// identity used on the page itself — it must NOT vary with config.content.name
// any more (the opposite of the old monogram-based behaviour this replaces).
test('renderTouchIcon renders the fixed supplied logo, independent of config.content.name', async () => {
  const ali = validConfig();
  const jane = validConfig();
  jane.content.name = 'Jane Doe';

  const [aliIcon, janeIcon] = await Promise.all([renderTouchIcon(ali), renderTouchIcon(jane)]);

  assert.ok(
    aliIcon.equals(janeIcon),
    'the touch icon must be the fixed supplied logo, not a name-derived mark'
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
  // Written into vendor/lucide/ (src/icons/ no longer exists — its only file,
  // the hand-authored envelope, was removed as unused).
  const path = new URL('../vendor/lucide/__unreadable-test-icon__.svg', import.meta.url);
  await writeFile(path, '<svg></svg>');
  await chmod(path, 0o000);
  try {
    await assert.rejects(
      () => inlineIcon('__unreadable-test-icon__'),
      (err) => {
        assert.equal(err.code, 'EACCES');
        assert.doesNotMatch(err.message, /not found in/);
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
