import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
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
  const meta = await sharp(await renderTouchIcon()).metadata();
  assert.equal(meta.width, 180);
  assert.equal(meta.height, 180);
});

test('renders a 1200x630 OG image', async () => {
  const meta = await sharp(await renderOGImage(validConfig())).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
});
