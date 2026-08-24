import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/lib/config.mjs';

const src = (f) => readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');

const escapeHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// The page uses a typographic apostrophe; config uses a straight one.
const normalise = (s) => s.replace(/[‘’]/g, "'");

test('page copy matches config.json exactly', async () => {
  const config = await loadConfig();
  const html = normalise(await src('index.html'));
  for (const [key, value] of Object.entries(config.content)) {
    if (key === 'fullName') continue;   // used in the vCard, not rendered
    assert.ok(html.includes(escapeHTML(normalise(value))),
      `src/index.html is missing content.${key}: "${value}"`);
  }
});

test('every contact href is present', async () => {
  const config = await loadConfig();
  const html = await src('index.html');
  for (const key of ['linkedin', 'github', 'whatsapp']) {
    assert.ok(html.includes(`href="${config.contacts[key]}"`), `missing ${key} href`);
  }
  assert.ok(html.includes(`href="mailto:${config.contacts.email}"`), 'missing mailto href');
});

test('CARD_URL never appears literally in authored source', async () => {
  for (const file of ['index.html', 'styles.css']) {
    assert.doesNotMatch(await src(file), /idalhamed\.github\.io/,
      `${file} hardcodes the destination; use the {{CARD_URL}} token`);
  }
});

test('exactly one h1, and it is the name', async () => {
  const html = await src('index.html');
  assert.equal(html.match(/<h1/g).length, 1);
  assert.match(html, /<h1[^>]*>ALI HAMED<\/h1>/);
});

test('external links are rel-protected', async () => {
  const html = await src('index.html');
  for (const m of html.matchAll(/<a\s+href="https:\/\/(?!wa\.me)[^"]+"[^>]*>/g)) {
    assert.match(m[0], /rel="noopener noreferrer"/, `unprotected external link: ${m[0]}`);
  }
});

test('the Add to Wallet anchor is present but commented out', async () => {
  const html = await src('index.html');
  const commented = html.match(/<!--[\s\S]*?Add to Apple Wallet[\s\S]*?-->/);
  assert.ok(commented, 'the Wallet anchor must exist as a comment, ready to enable');
  assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /pkpass/,
    'no live .pkpass link may ship until device verification');
});

test('no emoji anywhere in the page', async () => {
  // \p{Extended_Pictographic} alone false-positives on © and ® (U+00A9, U+00AE):
  // Unicode marks them Extended_Pictographic=Yes but Emoji_Presentation=No, so
  // they render as plain text, not pictographs, unless forced with U+FE0F. The
  // footer's "© 2026 Ali Hamed" (verbatim from config.content.footer) must not
  // trip a page-wide emoji ban, so match only characters that actually render
  // as emoji: default emoji presentation, or Extended_Pictographic forced by a
  // variation selector.
  assert.doesNotMatch(await src('index.html'), /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u);
});

test('the banned grey is not used', async () => {
  assert.doesNotMatch(await src('styles.css'), /#6E6E73/i);
});

test('all six colour tokens are declared', async () => {
  const css = await src('styles.css');
  for (const t of ['--text-primary:#F5F5F7', '--text-secondary:#98989D',
    '--text-tertiary:#86868B', '--hairline:', '--surface:', '--surface-pressed:']) {
    assert.ok(css.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')), `missing token ${t}`);
  }
});

test('reduced motion is honoured', async () => {
  const css = await src('styles.css');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
