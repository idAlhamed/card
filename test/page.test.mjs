import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/lib/config.mjs';

const src = (f) => readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');

// A comparison normaliser for matching config values against authored HTML
// in src/index.html — not an output escaper (unlike pass.mjs's escapeHtml,
// which produces HTML this project actually ships).
const escapeHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// The page uses a typographic apostrophe; config uses a straight one.
const normalise = (s) => s.replace(/[‘’]/g, "'");

// Redesign-foundations content: new copy consumed by the Wallet pass and
// print artwork, and by the page once a later phase rebuilds it. Not yet
// wired into src/index.html, so it's excluded here the same way fullName is.
const NOT_YET_ON_PAGE = new Set(['roleSecondary', 'taglineWallet', 'taglinePage', 'taglineCardFront', 'expertise']);

test('page copy matches config.json exactly', async () => {
  const config = await loadConfig();
  const html = normalise(await src('index.html'));
  for (const [key, value] of Object.entries(config.content)) {
    if (key === 'fullName') continue;   // used in the vCard, not rendered
    if (NOT_YET_ON_PAGE.has(key)) continue;
    assert.ok(html.includes(escapeHTML(normalise(value))),
      `src/index.html is missing content.${key}: "${value}"`);
  }
});

test('every contact href is present', async () => {
  const config = await loadConfig();
  const html = await src('index.html');
  for (const key of ['linkedin', 'github', 'discord', 'whatsapp']) {
    assert.ok(html.includes(`href="${config.contacts[key]}"`), `missing ${key} href`);
  }
  assert.ok(html.includes(`href="mailto:${config.contacts.email}"`), 'missing mailto href');
});

test('the Discord row records the username from config', async () => {
  const config = await loadConfig();
  const html = await src('index.html');
  assert.ok(html.includes(`aria-label="Discord — ${config.contacts.discordUsername}"`),
    'the Discord anchor must carry the username from config.contacts.discordUsername');
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

// © ® ™ are Extended_Pictographic but are typographic marks, not emoji.
// Strip them ONLY when bare; followed by VS16 (U+FE0F) they are genuine emoji.
const stripTypographicMarks = (s) => s.replace(/[©®™](?!️)/gu, '');
const isEmojiFree = (s) => !/\p{Extended_Pictographic}/u.test(stripTypographicMarks(s));

test('no emoji anywhere in the page', async () => {
  // \p{Extended_Pictographic} alone false-positives on © and ® (U+00A9, U+00AE):
  // Unicode marks them Extended_Pictographic=Yes but Emoji_Presentation=No, so
  // they render as plain text, not pictographs, unless forced with U+FE0F. The
  // footer's "© 2026 Ali Hamed" (verbatim from config.content.footer) must not
  // trip a page-wide emoji ban, so bare typographic marks (© ® ™) are stripped
  // before testing; a mark forced into emoji presentation with VS16 is left in
  // place and still flagged.
  assert.ok(isEmojiFree(await src('index.html')));
});

test('the emoji guard flags a text-presentation emoji', () => {
  // ❤ (U+2764 HEAVY BLACK HEART) defaults to text presentation, so a naive
  // \p{Emoji_Presentation} check would miss it. Extended_Pictographic still
  // catches it once bare ©/®/™ are stripped.
  assert.equal(isEmojiFree('love ❤'), false, 'a bare text-presentation emoji must be flagged');
});

test('the emoji guard allows the real footer line', () => {
  assert.equal(isEmojiFree('© 2026 Ali Hamed'), true, 'the copyright sign must not be flagged as emoji');
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

// Extracts the body of a brace-delimited block by counting braces, not by
// regex greediness — @media (prefers-reduced-motion: reduce) nests rule
// blocks inside it, and a naive `{([\s\S]*)}` either stops at the first
// inner `}` (non-greedy) or wrongly assumes the block is the last thing in
// the file (greedy to end-of-file). This works regardless of position.
function extractBlockBody(css, headerRegex) {
  const headerMatch = css.match(headerRegex);
  assert.ok(headerMatch, `block header not found: ${headerRegex}`);
  const bodyStart = css.indexOf(headerMatch[0]) + headerMatch[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  assert.equal(depth, 0, 'unbalanced braces: block never closes');
  return css.slice(bodyStart, i - 1);
}

test('reduced motion is honoured', async () => {
  const css = await src('styles.css');
  const body = extractBlockBody(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
  assert.match(body, /animation:\s*none/, 'must neutralise the entry animation');
  assert.match(body, /transition:\s*none/, 'must neutralise transitions');
  assert.match(body, /transform:\s*none/,
    'must neutralise the press transform itself, not merely its transition');
});
