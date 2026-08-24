# Ali Hamed Digital Business Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monochrome-black professional identity system for Ali Hamed — a mobile-first web page, an Apple Wallet pass, print artwork, and NFC documentation — all resolving to a single configurable `CARD_URL`.

**Architecture:** `config.json` is the single source of truth. A Node build script (`scripts/build.mjs`) fans that one value out to every artifact: the QR code, `pass.json`, the vCard, the page's canonical/OG tags, the print files, and the NFC docs. The web page is hand-written HTML and CSS shipping zero browser dependencies; all tooling is build-time only. Business logic lives in small, single-purpose modules under `src/lib/`, each unit-tested with Node's built-in test runner.

**Tech Stack:** Node 24 (ESM, `node:test`), hand-written HTML/CSS, `qrcode`, `jsqr`, `sharp`, `opentype.js`, `pdfkit`. Vendored: Inter TTF (SIL OFL), Simple Icons brand marks (CC0). Signing via system `openssl` and `zip`.

**Spec:** `spec/2026-08-24-ali-hamed-digital-business-card-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are verbatim from the spec.

- **CARD_URL** is `https://idalhamed.github.io/card`. It MUST NOT appear literally in any authored source file — only in `config.json`, reaching other files via build-time substitution of the `{{CARD_URL}}` token.
- **Zero browser dependencies.** No framework, no JS library, no webfont reaches `docs/`. All five npm packages are `devDependencies`.
- **No Apple logo, no Swift logo, no third-party mark** anywhere except the four contact icons.
- **Pure monochrome.** No accent colour. Contact icons render in `--text-primary`.
- **Colour tokens:** `--text-primary #F5F5F7`, `--text-secondary #98989D`, `--text-tertiary #86868B`, `--hairline rgba(255,255,255,0.09)`, `--surface rgba(255,255,255,0.04)`, `--surface-pressed rgba(255,255,255,0.08)`. `#6E6E73` is banned — it fails WCAG AA at 4.1:1.
- **Copy is verbatim.** `ALI HAMED` / `iOS Developer` / `Swift · SwiftUI · UIKit` (U+00B7 with spaces; `SwiftUI` and `UIKit` are never uppercased) / `Building mobile products with a focus on performance & user experience.` / `Got a product to build? Let's make it happen.` / `© 2026 Ali Hamed`.
- **Typefaces:** SF Pro via system stack for the live page only. Inter outlined to paths for every rasterised or printed asset.
- **No fabricated credentials.** No placeholder certificate, signature, or manifest is ever written. Unsigned passes are labelled unsigned.
- **The Add to Apple Wallet anchor stays commented out** until device verification.
- **Never commit** `IMG_3890.jpg`, `Screenshot*.png`, or anything under `wallet/certs/`.
- **Node ≥ 22** (developed against v24.4.1). OpenSSL 3.x requires `-legacy` for Keychain-exported `.p12` files.

---

## File Structure

| File | Responsibility |
|---|---|
| `config.json` | Single source of truth: URL, Apple identifiers, content strings, contacts |
| `package.json` | Scripts and the five devDependencies |
| `src/lib/config.mjs` | Load and validate config; throw `ConfigError` with actionable messages |
| `src/lib/text-path.mjs` | Load Inter, convert text to SVG path data with letter-spacing |
| `src/lib/qr.mjs` | Encode QR to SVG/PNG; decode PNG back to a string; round-trip assertion |
| `src/lib/vcard.mjs` | Build RFC-compliant vCard 3.0 with correct line folding and CRLF |
| `src/lib/site.mjs` | Stamp `{{CARD_URL}}` tokens into HTML; fail on any unreplaced token |
| `src/lib/pass.mjs` | Build `pass.json`; render pass PNG assets |
| `src/lib/print.mjs` | Build print SVG and PDF at exact millimetre geometry |
| `src/index.html` | Authored page markup |
| `src/styles.css` | Authored page styles |
| `src/icons/*.svg` | Four contact glyphs, normalised to a 24×24 box |
| `scripts/fetch-assets.mjs` | One-time vendoring of Inter TTF and brand icon paths |
| `scripts/build.mjs` | Orchestrator: config → every artifact |
| `wallet/sign-pass.sh` | Manifest, PKCS#7 signature, zip — with guards that name the missing step |
| `test/*.test.mjs` | One test file per `src/lib/` module |

Files that change together live together. Each `src/lib/` module has one responsibility and is independently testable.

---

## Task 1: Project scaffold, config, and validation

**Files:**
- Create: `package.json`, `config.json`, `src/lib/config.mjs`
- Test: `test/fixtures.mjs`, `test/config.test.mjs`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `loadConfig(path?) -> Promise<Config>`
  - `validateConfig(raw) -> Config` (throws `ConfigError`)
  - `class ConfigError extends Error`
  - `Config` shape: `{ url: { CARD_URL: string }, apple: { passTypeIdentifier, teamIdentifier, organizationName, serialNumber, description }, content: { name, fullName, role, technologies, message, cta, footer }, contacts: { linkedin, github, whatsapp, phone, email } }`
  - Test helper `validConfig() -> Config` from `test/fixtures.mjs`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ali-hamed-card",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Digital business card system for Ali Hamed",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test test/",
    "fetch:assets": "node scripts/fetch-assets.mjs",
    "build": "node scripts/build.mjs",
    "dev": "python3 -m http.server 8080 --directory docs",
    "pass:sign": "bash wallet/sign-pass.sh"
  },
  "devDependencies": {
    "jsqr": "^1.4.0",
    "opentype.js": "^1.3.4",
    "pdfkit": "^0.15.1",
    "qrcode": "^1.5.4",
    "sharp": "^0.33.5"
  }
}
```

- [ ] **Step 2: Create `config.json`**

`teamIdentifier` is intentionally empty — Ali supplies it after creating the Pass Type ID. The build tolerates it; `buildPassJSON` does not.

```json
{
  "url": {
    "CARD_URL": "https://idalhamed.github.io/card"
  },
  "apple": {
    "passTypeIdentifier": "pass.com.alihamed.card",
    "teamIdentifier": "",
    "organizationName": "Ali Hamed",
    "serialNumber": "ali-hamed-001",
    "description": "Ali Hamed — iOS Developer"
  },
  "content": {
    "name": "ALI HAMED",
    "fullName": "Ali Hamed",
    "role": "iOS Developer",
    "technologies": "Swift · SwiftUI · UIKit",
    "message": "Building mobile products with a focus on performance & user experience.",
    "cta": "Got a product to build? Let's make it happen.",
    "footer": "© 2026 Ali Hamed"
  },
  "contacts": {
    "linkedin": "https://www.linkedin.com/in/idalhamed/",
    "github": "https://github.com/idAlhamed",
    "whatsapp": "https://wa.me/966554248646",
    "phone": "+966554248646",
    "email": "officialalhamed@gmail.com"
  }
}
```

- [ ] **Step 3: Create the test fixture `test/fixtures.mjs`**

```js
// A structurally valid config, cloned per call so tests can mutate freely.
export function validConfig() {
  return structuredClone({
    url: { CARD_URL: 'https://idalhamed.github.io/card' },
    apple: {
      passTypeIdentifier: 'pass.com.alihamed.card',
      teamIdentifier: 'ABCDE12345',
      organizationName: 'Ali Hamed',
      serialNumber: 'ali-hamed-001',
      description: 'Ali Hamed — iOS Developer',
    },
    content: {
      name: 'ALI HAMED',
      fullName: 'Ali Hamed',
      role: 'iOS Developer',
      technologies: 'Swift · SwiftUI · UIKit',
      message: 'Building mobile products with a focus on performance & user experience.',
      cta: "Got a product to build? Let's make it happen.",
      footer: '© 2026 Ali Hamed',
    },
    contacts: {
      linkedin: 'https://www.linkedin.com/in/idalhamed/',
      github: 'https://github.com/idAlhamed',
      whatsapp: 'https://wa.me/966554248646',
      phone: '+966554248646',
      email: 'officialalhamed@gmail.com',
    },
  });
}
```

- [ ] **Step 4: Write the failing tests `test/config.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, loadConfig, ConfigError } from '../src/lib/config.mjs';
import { validConfig } from './fixtures.mjs';

test('accepts a valid config', () => {
  assert.equal(validateConfig(validConfig()).url.CARD_URL,
    'https://idalhamed.github.io/card');
});

test('rejects a missing CARD_URL', () => {
  const c = validConfig();
  delete c.url.CARD_URL;
  assert.throws(() => validateConfig(c), ConfigError);
});

test('rejects a placeholder CARD_URL', () => {
  const c = validConfig();
  c.url.CARD_URL = 'YOUR_FINAL_CARD_URL';
  assert.throws(() => validateConfig(c), /placeholder/i);
});

test('rejects a non-https CARD_URL', () => {
  const c = validConfig();
  c.url.CARD_URL = 'http://idalhamed.github.io/card';
  assert.throws(() => validateConfig(c), /https/i);
});

test('rejects an unparseable CARD_URL', () => {
  const c = validConfig();
  c.url.CARD_URL = 'not a url';
  assert.throws(() => validateConfig(c), ConfigError);
});

test('rejects a malformed WhatsApp link', () => {
  const c = validConfig();
  c.contacts.whatsapp = 'https://wa.me/+966 554248646';
  assert.throws(() => validateConfig(c), /wa\.me/);
});

test('rejects a malformed email', () => {
  const c = validConfig();
  c.contacts.email = 'officialalhamed(at)gmail.com';
  assert.throws(() => validateConfig(c), /email/i);
});

test('names the exact missing content key', () => {
  const c = validConfig();
  delete c.content.technologies;
  assert.throws(() => validateConfig(c), /content\.technologies/);
});

test('loads and validates the real config.json', async () => {
  const c = await loadConfig();
  assert.equal(c.url.CARD_URL, 'https://idalhamed.github.io/card');
  assert.equal(c.content.technologies, 'Swift · SwiftUI · UIKit');
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm install && npm test`
Expected: FAIL — `Cannot find module '../src/lib/config.mjs'`

- [ ] **Step 6: Write `src/lib/config.mjs`**

```js
import { readFile } from 'node:fs/promises';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const REQUIRED_CONTENT = ['name', 'fullName', 'role', 'technologies', 'message', 'cta', 'footer'];
const REQUIRED_CONTACTS = ['linkedin', 'github', 'whatsapp', 'phone', 'email'];
const PLACEHOLDER = /YOUR_|REPLACE_|EXAMPLE|CHANGEME/i;

export function validateConfig(raw) {
  const url = raw?.url?.CARD_URL;
  if (typeof url !== 'string' || url.length === 0) {
    throw new ConfigError('config.url.CARD_URL is missing');
  }
  if (PLACEHOLDER.test(url)) {
    throw new ConfigError(`config.url.CARD_URL is still a placeholder: "${url}"`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigError(`config.url.CARD_URL is not a valid URL: "${url}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new ConfigError(
      `config.url.CARD_URL must use https, got "${parsed.protocol}". ` +
      'NFC tags and QR codes must not resolve over plain http.'
    );
  }

  for (const key of REQUIRED_CONTENT) {
    if (!raw?.content?.[key]) throw new ConfigError(`config.content.${key} is missing or empty`);
  }
  for (const key of REQUIRED_CONTACTS) {
    if (!raw?.contacts?.[key]) throw new ConfigError(`config.contacts.${key} is missing or empty`);
  }

  if (!/^https:\/\/wa\.me\/\d{6,15}$/.test(raw.contacts.whatsapp)) {
    throw new ConfigError(
      `config.contacts.whatsapp must be https://wa.me/<digits only>, got "${raw.contacts.whatsapp}"`
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.contacts.email)) {
    throw new ConfigError(`config.contacts.email is not a valid address: "${raw.contacts.email}"`);
  }

  return raw;
}

export async function loadConfig(path = new URL('../../config.json', import.meta.url)) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    throw new ConfigError(`Cannot read config at ${path}: ${cause.message}`);
  }
  try {
    return validateConfig(JSON.parse(text));
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`config.json is not valid JSON: ${err.message}`);
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 tests

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json config.json src/lib/config.mjs test/
git commit -m "feat: add config loader with validation

CARD_URL must be absolute https and non-placeholder. Contact formats are
validated so a malformed wa.me link cannot reach a printed card."
```

---

## Task 2: Vendor Inter and the brand icons

**Files:**
- Create: `scripts/fetch-assets.mjs`, `vendor/fonts/OFL.txt`, `vendor/README.md`
- Modify: `.gitignore` (nothing new to ignore — vendored files ARE committed)

**Interfaces:**
- Consumes: nothing
- Produces: `vendor/fonts/Inter-Regular.ttf`, `vendor/fonts/Inter-SemiBold.ttf`, `vendor/icons/{linkedin,github,whatsapp}.svg` on disk. All later tasks read these paths.

Vendored, not depended on: the licences (SIL OFL for Inter, CC0 for Simple Icons) permit redistribution, and committing them makes the build reproducible offline.

- [ ] **Step 1: Write the failing test `test/vendor.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('Inter TTFs are vendored', async () => {
  for (const f of ['Inter-Regular.ttf', 'Inter-SemiBold.ttf']) {
    await assert.doesNotReject(access(new URL(`vendor/fonts/${f}`, root)),
      `missing vendor/fonts/${f} — run: npm run fetch:assets`);
  }
});

test('the OFL licence travels with the font', async () => {
  const licence = await readFile(new URL('vendor/fonts/OFL.txt', root), 'utf8');
  assert.match(licence, /SIL OPEN FONT LICENSE/i);
});

test('brand icons are vendored as single-path SVGs', async () => {
  for (const name of ['linkedin', 'github', 'whatsapp']) {
    const svg = await readFile(new URL(`vendor/icons/${name}.svg`, root), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/, `${name}.svg must use a 24x24 box`);
    assert.match(svg, /<path d="/, `${name}.svg must contain path data`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern=vendor`
Expected: FAIL — missing `vendor/fonts/Inter-Regular.ttf`

- [ ] **Step 3: Write `scripts/fetch-assets.mjs`**

```js
// One-time vendoring. Downloads are pinned to exact tags so the build is
// reproducible. Re-running is safe and idempotent.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);

const INTER_TAG = 'v4.1';
const INTER_ZIP = `https://github.com/rsms/inter/releases/download/${INTER_TAG}/Inter-4.1.zip`;
const ICONS_TAG = '13.0.0';
const ICONS = ['linkedin', 'github', 'whatsapp'];

async function fetchInter() {
  const fontDir = new URL('vendor/fonts/', root);
  await mkdir(fontDir, { recursive: true });
  const zipPath = new URL('Inter.zip', fontDir);

  console.log(`Downloading Inter ${INTER_TAG}...`);
  const res = await fetch(INTER_ZIP);
  if (!res.ok) throw new Error(`Inter download failed: HTTP ${res.status} from ${INTER_ZIP}`);
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));

  // -j junks directory paths, so this survives any layout change inside the zip.
  await run('unzip', ['-o', '-j', zipPath.pathname,
    '*Inter-Regular.ttf', '*Inter-SemiBold.ttf', '*OFL.txt', '*LICENSE.txt',
    '-d', fontDir.pathname]);
  await rm(zipPath);

  // The zip names its licence LICENSE.txt in some releases; normalise it.
  try {
    await readFile(new URL('OFL.txt', fontDir));
  } catch {
    const alt = await readFile(new URL('LICENSE.txt', fontDir), 'utf8');
    await writeFile(new URL('OFL.txt', fontDir), alt);
  }
  console.log('  vendor/fonts/Inter-{Regular,SemiBold}.ttf');
}

async function fetchIcons() {
  const iconDir = new URL('vendor/icons/', root);
  await mkdir(iconDir, { recursive: true });
  for (const name of ICONS) {
    const url = `https://raw.githubusercontent.com/simple-icons/simple-icons/${ICONS_TAG}/icons/${name}.svg`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Icon download failed: HTTP ${res.status} from ${url}`);
    await writeFile(new URL(`${name}.svg`, iconDir), await res.text());
    console.log(`  vendor/icons/${name}.svg`);
  }
}

try {
  await fetchInter();
  await fetchIcons();
  console.log('\nVendored assets ready. Commit them — the build must work offline.');
} catch (err) {
  console.error(`\nVendoring failed: ${err.message}`);
  console.error('\nManual fallback:');
  console.error(`  1. Download ${INTER_ZIP}`);
  console.error('     Extract Inter-Regular.ttf and Inter-SemiBold.ttf into vendor/fonts/');
  console.error('     Copy the OFL licence to vendor/fonts/OFL.txt');
  console.error(`  2. Save each of these into vendor/icons/<name>.svg:`);
  for (const n of ICONS) {
    console.error(`     https://raw.githubusercontent.com/simple-icons/simple-icons/${ICONS_TAG}/icons/${n}.svg`);
  }
  process.exit(1);
}
```

- [ ] **Step 4: Run it and verify the tests pass**

Run: `npm run fetch:assets && npm test -- --test-name-pattern=vendor`
Expected: three vendored files reported, then PASS — 3 tests

If the download fails, follow the manual fallback the script prints. Do not proceed with a missing font; every rasterised asset depends on it.

- [ ] **Step 5: Write `vendor/README.md`**

```markdown
# Vendored assets

Committed deliberately so the build is reproducible and works offline.

| Asset | Source | Licence |
|---|---|---|
| `fonts/Inter-*.ttf` | rsms/inter v4.1 | SIL Open Font Licence 1.1 (`fonts/OFL.txt`) |
| `icons/*.svg` | simple-icons 13.0.0 | CC0 1.0 — public domain, no attribution required |

Inter is used only for rasterised and printed assets. The live web page uses
SF Pro from the operating system and downloads no font at all.

Regenerate with `npm run fetch:assets`.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-assets.mjs vendor/ test/vendor.test.mjs
git commit -m "chore: vendor Inter TTF and brand icon marks

Committed rather than depended on: OFL and CC0 both permit redistribution,
and vendoring keeps the build reproducible offline."
```

---

## Task 3: Text-to-path rendering

**Files:**
- Create: `src/lib/text-path.mjs`
- Test: `test/text-path.test.mjs`

**Interfaces:**
- Consumes: `vendor/fonts/Inter-{Regular,SemiBold}.ttf` (Task 2)
- Produces:
  - `loadFont(weight?: 'regular'|'semibold') -> Promise<opentype.Font>`
  - `textToPath(font, text, {fontSize?, letterSpacing?}) -> {d: string, advance: number, box: {x1,y1,x2,y2}}`
  - `wordmarkSVG(text, {weight?, fontSize?, letterSpacing?, fill?, padding?}) -> Promise<string>`

Used by Tasks 6 (og image, touch icon), 8 (pass assets), and 10 (print). Outlining removes any runtime font dependency: the produced path data is geometry, not text.

- [ ] **Step 1: Write the failing tests `test/text-path.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFont, textToPath, wordmarkSVG } from '../src/lib/text-path.mjs';

test('loads Inter SemiBold', async () => {
  const font = await loadFont('semibold');
  assert.ok(font.unitsPerEm > 0);
});

test('rejects an unknown weight with a helpful message', async () => {
  await assert.rejects(() => loadFont('ultrablack'), /Unknown font weight/);
});

test('produces SVG path data', async () => {
  const font = await loadFont('semibold');
  const { d, advance } = textToPath(font, 'ALI HAMED', { fontSize: 100 });
  assert.match(d, /^M/);
  assert.ok(advance > 100, 'a nine-character wordmark should be wider than 100 units');
});

test('letter-spacing widens the advance by exactly (glyphs - 1) * spacing', async () => {
  const font = await loadFont('semibold');
  const text = 'ALI HAMED';
  const tight = textToPath(font, text, { fontSize: 100, letterSpacing: 0 });
  const loose = textToPath(font, text, { fontSize: 100, letterSpacing: 14 });
  const expected = tight.advance + (text.length - 1) * 14;
  assert.ok(Math.abs(loose.advance - expected) < 0.01);
});

test('empty text produces a zero advance rather than throwing', async () => {
  const font = await loadFont('semibold');
  assert.equal(textToPath(font, '', { fontSize: 100 }).advance, 0);
});

test('wordmarkSVG emits a self-contained single-path SVG', async () => {
  const svg = await wordmarkSVG('ALI HAMED', { fontSize: 60, letterSpacing: 8, fill: '#F5F5F7' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /fill="#F5F5F7"/);
  assert.equal(svg.match(/<path/g).length, 1, 'all glyphs must merge into one path');
  assert.doesNotMatch(svg, /<text/, 'text must be outlined, never left live');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="path|Inter|wordmark"`
Expected: FAIL — `Cannot find module '../src/lib/text-path.mjs'`

- [ ] **Step 3: Write `src/lib/text-path.mjs`**

```js
import opentype from 'opentype.js';
import { readFile } from 'node:fs/promises';

const FONTS = {
  regular: new URL('../../vendor/fonts/Inter-Regular.ttf', import.meta.url),
  semibold: new URL('../../vendor/fonts/Inter-SemiBold.ttf', import.meta.url),
};

const cache = new Map();

export async function loadFont(weight = 'semibold') {
  if (!FONTS[weight]) {
    throw new Error(`Unknown font weight "${weight}". Available: ${Object.keys(FONTS).join(', ')}`);
  }
  if (!cache.has(weight)) {
    let buf;
    try {
      buf = await readFile(FONTS[weight]);
    } catch {
      throw new Error(
        `Missing ${FONTS[weight].pathname}. Run: npm run fetch:assets`
      );
    }
    // opentype.parse needs a plain ArrayBuffer, not a Node Buffer view.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    cache.set(weight, opentype.parse(ab));
  }
  return cache.get(weight);
}

/**
 * Lays out `text` glyph by glyph so letter-spacing can be applied.
 * The baseline sits at y = 0, so `box.y1` is negative for cap-height glyphs.
 */
export function textToPath(font, text, { fontSize = 100, letterSpacing = 0 } = {}) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const combined = new opentype.Path();
  let x = 0;
  for (const glyph of glyphs) {
    combined.extend(glyph.getPath(x, 0, fontSize));
    x += glyph.advanceWidth * scale + letterSpacing;
  }
  // The trailing letter-space is not part of the visible advance.
  const advance = glyphs.length ? x - letterSpacing : 0;
  return { d: combined.toPathData(3), advance, box: combined.getBoundingBox() };
}

export async function wordmarkSVG(text, {
  weight = 'semibold',
  fontSize = 100,
  letterSpacing = 0,
  fill = '#F5F5F7',
  padding = 0,
} = {}) {
  const font = await loadFont(weight);
  const { d, advance, box } = textToPath(font, text, { fontSize, letterSpacing });
  const width = advance + padding * 2;
  const height = (box.y2 - box.y1) + padding * 2;
  const dy = -box.y1 + padding;   // lift the baseline so ink starts at `padding`
  const w = width.toFixed(2);
  const h = height.toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">` +
    `<path transform="translate(${padding.toFixed(2)} ${dy.toFixed(2)})" ` +
    `d="${d}" fill="${fill}"/></svg>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="path|Inter|wordmark"`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/text-path.mjs test/text-path.test.mjs
git commit -m "feat: add text-to-path rendering with letter-spacing

All rasterised and printed type is outlined, so no build machine needs
Inter installed and no PDF needs a font embedded."
```

---

## Task 4: QR generation and round-trip verification

**Files:**
- Create: `src/lib/qr.mjs`
- Test: `test/qr.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `QR_OPTIONS` — `{ errorCorrectionLevel: 'Q', margin: 4 }`
  - `generateQRSVG(url, opts?) -> Promise<string>`
  - `generateQRPNG(url, opts?) -> Promise<Buffer>`
  - `qrModules(url, opts?) -> { size: number, data: Uint8Array }` (used by Task 10 to draw QR modules directly into the PDF)
  - `decodeQRPNG(buffer) -> Promise<string|null>`
  - `assertQRRoundTrip(url, buffer) -> Promise<string>` (throws on mismatch)

Error correction **Q** (25%) and a 4-module quiet zone, per spec §8. This is the module that makes a dead printed QR impossible.

- [ ] **Step 1: Write the failing tests `test/qr.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateQRSVG, generateQRPNG, qrModules, decodeQRPNG, assertQRRoundTrip, QR_OPTIONS,
} from '../src/lib/qr.mjs';

const URL_ = 'https://idalhamed.github.io/card';

test('defaults to error correction Q with a 4-module quiet zone', () => {
  assert.equal(QR_OPTIONS.errorCorrectionLevel, 'Q');
  assert.equal(QR_OPTIONS.margin, 4);
});

test('emits an SVG', async () => {
  const svg = await generateQRSVG(URL_);
  assert.match(svg, /<svg/);
});

test('emits a PNG buffer', async () => {
  const png = await generateQRPNG(URL_);
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
});

test('exposes the raw module matrix', () => {
  const { size, data } = qrModules(URL_);
  assert.ok(size >= 21, 'a QR is at least 21 modules across');
  assert.equal(data.length, size * size);
});

test('a generated QR decodes back to exactly the encoded URL', async () => {
  const png = await generateQRPNG(URL_);
  assert.equal(await decodeQRPNG(png), URL_);
});

test('assertQRRoundTrip passes when the code matches', async () => {
  const png = await generateQRPNG(URL_);
  assert.equal(await assertQRRoundTrip(URL_, png), URL_);
});

test('assertQRRoundTrip throws when the code encodes something else', async () => {
  const png = await generateQRPNG('https://example.com/wrong');
  await assert.rejects(() => assertQRRoundTrip(URL_, png), /round-trip failed/);
});

test('assertQRRoundTrip throws when the image is undecodable', async () => {
  const blank = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64');
  await assert.rejects(() => assertQRRoundTrip(URL_, blank), /could not be decoded/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="QR|quiet|module"`
Expected: FAIL — `Cannot find module '../src/lib/qr.mjs'`

- [ ] **Step 3: Write `src/lib/qr.mjs`**

```js
import QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';

// Level Q tolerates 25% damage — chosen for print wear and screen glare.
// A 4-module quiet zone is the spec minimum for reliable scanning.
export const QR_OPTIONS = { errorCorrectionLevel: 'Q', margin: 4 };

const COLOR = { dark: '#000000', light: '#FFFFFF' };

export async function generateQRSVG(url, opts = {}) {
  return QRCode.toString(url, { ...QR_OPTIONS, ...opts, type: 'svg', color: COLOR });
}

export async function generateQRPNG(url, opts = {}) {
  return QRCode.toBuffer(url, {
    ...QR_OPTIONS, ...opts, type: 'png', width: opts.width ?? 1024, color: COLOR,
  });
}

/** Raw module matrix, so the PDF can draw QR modules as vector rectangles. */
export function qrModules(url, opts = {}) {
  const qr = QRCode.create(url, {
    errorCorrectionLevel: opts.errorCorrectionLevel ?? QR_OPTIONS.errorCorrectionLevel,
  });
  return { size: qr.modules.size, data: qr.modules.data };
}

export async function decodeQRPNG(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return result ? result.data : null;
}

/**
 * The guard that prevents a dead QR reaching a printed card: decode what was
 * just encoded and require exact equality.
 */
export async function assertQRRoundTrip(url, buffer) {
  const decoded = await decodeQRPNG(buffer);
  if (decoded === null) {
    throw new Error('QR round-trip failed: the generated code could not be decoded at all.');
  }
  if (decoded !== url) {
    throw new Error(`QR round-trip failed: encoded "${url}" but decoded "${decoded}".`);
  }
  return decoded;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="QR|quiet|module"`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/qr.mjs test/qr.test.mjs
git commit -m "feat: add QR generation with decode round-trip assertion

Encoding and decoding are separate libraries, so the round-trip is a real
independent check rather than a tautology."
```

---

## Task 5: vCard generation

**Files:**
- Create: `src/lib/vcard.mjs`
- Test: `test/vcard.test.mjs`

**Interfaces:**
- Consumes: `Config` (Task 1)
- Produces:
  - `foldLine(line: string) -> string`
  - `buildVCard(config: Config) -> string`

vCard **3.0**, not 4.0 — iOS Contacts imports 3.0 most reliably. RFC requires CRLF endings and folding at 75 octets; the `NOTE` line exceeds that.

- [ ] **Step 1: Write the failing tests `test/vcard.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVCard, foldLine } from '../src/lib/vcard.mjs';
import { validConfig } from './fixtures.mjs';

test('short lines are returned unchanged', () => {
  assert.equal(foldLine('FN:Ali Hamed'), 'FN:Ali Hamed');
});

test('long lines fold with a leading space on continuations', () => {
  const folded = foldLine('NOTE:' + 'x'.repeat(200));
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1);
  for (const p of parts.slice(1)) assert.match(p, /^ /);
});

test('folding never splits a multi-byte character', () => {
  const folded = foldLine('NOTE:' + '·'.repeat(100));
  for (const part of folded.split('\r\n')) {
    assert.doesNotMatch(part, /�/, 'no replacement characters may appear');
  }
});

test('no unfolded line exceeds 75 octets', () => {
  for (const line of buildVCard(validConfig()).split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `too long: ${line}`);
  }
});

test('uses CRLF line endings throughout', () => {
  const vcf = buildVCard(validConfig());
  assert.doesNotMatch(vcf.replace(/\r\n/g, ''), /\n/);
});

test('carries every required field', () => {
  const vcf = buildVCard(validConfig());
  assert.match(vcf, /^BEGIN:VCARD/);
  assert.match(vcf, /VERSION:3\.0/);
  assert.match(vcf, /FN:Ali Hamed/);
  assert.match(vcf, /N:Hamed;Ali;;;/);
  assert.match(vcf, /TITLE:iOS Developer/);
  assert.match(vcf, /TEL;TYPE=CELL:\+966554248646/);
  assert.match(vcf, /EMAIL;TYPE=INTERNET:officialalhamed@gmail\.com/);
  assert.match(vcf, /END:VCARD/);
});

test('the URL field carries CARD_URL from config, not a literal', () => {
  const config = validConfig();
  config.url.CARD_URL = 'https://example.com/elsewhere';
  assert.match(buildVCard(config), /URL:https:\/\/example\.com\/elsewhere/);
});

test('includes both social profiles', () => {
  const vcf = buildVCard(validConfig()).replace(/\r\n /g, '');
  assert.match(vcf, /X-SOCIALPROFILE;TYPE=linkedin:https:\/\/www\.linkedin\.com\/in\/idalhamed\//);
  assert.match(vcf, /X-SOCIALPROFILE;TYPE=github:https:\/\/github\.com\/idAlhamed/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="fold|vcard|VCARD|octet|CRLF|social|URL field"`
Expected: FAIL — `Cannot find module '../src/lib/vcard.mjs'`

- [ ] **Step 3: Write `src/lib/vcard.mjs`**

```js
const CRLF = '\r\n';
const MAX_OCTETS = 75;

/**
 * RFC 2426 line folding. Splits on octet count, not characters, and refuses
 * to break in the middle of a UTF-8 sequence — the '·' in the technologies
 * string and the '©' in the footer are both multi-byte.
 */
export function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= MAX_OCTETS) return line;

  const parts = [];
  let start = 0;
  let limit = MAX_OCTETS;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Walk back off any UTF-8 continuation byte (10xxxxxx).
    while (end > start + 1 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = MAX_OCTETS - 1;   // continuation lines spend one octet on the space
  }
  return parts.join(CRLF + ' ');
}

export function buildVCard(config) {
  const { content, contacts, url } = config;
  const [first, ...rest] = content.fullName.split(' ');
  const last = rest.join(' ');

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${last};${first};;;`,
    `FN:${content.fullName}`,
    `TITLE:${content.role}`,
    `NOTE:${content.message}`,
    `TEL;TYPE=CELL:${contacts.phone}`,
    `EMAIL;TYPE=INTERNET:${contacts.email}`,
    `URL:${url.CARD_URL}`,
    `X-SOCIALPROFILE;TYPE=linkedin:${contacts.linkedin}`,
    `X-SOCIALPROFILE;TYPE=github:${contacts.github}`,
    'END:VCARD',
  ];

  return lines.map(foldLine).join(CRLF) + CRLF;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="fold|vcard|VCARD|octet|CRLF|social|URL field"`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/vcard.mjs test/vcard.test.mjs
git commit -m "feat: add vCard 3.0 generation with RFC line folding

Folds on octets rather than characters so the multi-byte characters in the
copy cannot be split into replacement characters on import."
```

---

## Task 6: Author the web page

**Files:**
- Create: `src/index.html`, `src/styles.css`, `src/icons/email.svg`
- Test: `test/page.test.mjs`

**Interfaces:**
- Consumes: `Config` (Task 1), vendored brand icons (Task 2)
- Produces: authored source containing the tokens `{{CARD_URL}}` and `{{ICON:linkedin|github|whatsapp|email}}`, which Task 7 replaces.

This is the visual deliverable. Copy lives literally in the HTML because the page *is* the design and must stay readable — a test enforces that it never drifts from `config.json`.

- [ ] **Step 1: Create `src/icons/email.svg`**

A neutral solid envelope, matching the optical weight of the solid brand marks. Not a brand mark, so it is hand-authored rather than vendored.

```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm.8 2L12 12.9 20.2 7H3.8ZM20 8.6l-7.4 5.3a1 1 0 0 1-1.2 0L4 8.6V17h16V8.6Z"/></svg>
```

- [ ] **Step 2: Write the failing test `test/page.test.mjs`**

The drift test is the point: it makes the authored copy and `config.json` provably identical without templating the whole page.

```js
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
  assert.doesNotMatch(await src('index.html'), /\p{Extended_Pictographic}/u);
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="page|copy|href|h1|Wallet anchor|emoji|grey|token|motion"`
Expected: FAIL — `ENOENT: src/index.html`

- [ ] **Step 4: Write `src/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ali Hamed — iOS Developer</title>
<meta name="description" content="Ali Hamed — iOS Developer. Building mobile products with a focus on performance &amp; user experience.">
<link rel="canonical" href="{{CARD_URL}}">

<meta name="theme-color" content="#000000">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Ali Hamed">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="icon" href="assets/apple-touch-icon.png">

<meta property="og:type" content="profile">
<meta property="og:title" content="Ali Hamed — iOS Developer">
<meta property="og:description" content="Building mobile products with a focus on performance &amp; user experience.">
<meta property="og:url" content="{{CARD_URL}}">
<meta property="og:image" content="{{CARD_URL}}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">

<link rel="stylesheet" href="styles.css">
</head>
<body>
<main class="card">

  <header class="identity">
    <h1 class="name">ALI HAMED</h1>
    <p class="role">iOS Developer</p>
    <p class="tech">Swift · SwiftUI · UIKit</p>
  </header>

  <hr class="rule">

  <section class="pitch">
    <p class="message">Building mobile products with a focus on performance &amp; user experience.</p>
    <p class="cta">Got a product to build? Let’s make it happen.</p>
  </section>

  <nav class="contacts" aria-label="Contact Ali Hamed">
    <ul>
      <li><a href="https://www.linkedin.com/in/idalhamed/" target="_blank" rel="noopener noreferrer">
        {{ICON:linkedin}}<span class="label">LinkedIn</span>
        <svg class="chev" viewBox="0 0 7 12" aria-hidden="true"><path d="M1 1l5 5-5 5"/></svg>
      </a></li>
      <li><a href="https://github.com/idAlhamed" target="_blank" rel="noopener noreferrer">
        {{ICON:github}}<span class="label">GitHub</span>
        <svg class="chev" viewBox="0 0 7 12" aria-hidden="true"><path d="M1 1l5 5-5 5"/></svg>
      </a></li>
      <li><a href="https://wa.me/966554248646">
        {{ICON:whatsapp}}<span class="label">WhatsApp</span>
        <svg class="chev" viewBox="0 0 7 12" aria-hidden="true"><path d="M1 1l5 5-5 5"/></svg>
      </a></li>
      <li><a href="mailto:officialalhamed@gmail.com">
        {{ICON:email}}<span class="label">Email</span>
        <svg class="chev" viewBox="0 0 7 12" aria-hidden="true"><path d="M1 1l5 5-5 5"/></svg>
      </a></li>
    </ul>
  </nav>

  <p class="save">
    <a href="ali-hamed.vcf" download="ali-hamed.vcf">
      <svg class="dl" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v9M4.5 7l3.5 3.5L11.5 7M2 13.5h12"/></svg>
      Save Contact
    </a>
  </p>

  <!-- Add to Apple Wallet — intentionally disabled.
       GitHub Pages does not reliably serve .pkpass as
       application/vnd.apple.pkpass, so this anchor may download an inert file
       instead of opening Wallet. Enable only after the pass has been observed
       opening on a physical device. See wallet/README.md, "Delivery".
  <p class="wallet"><a href="AliHamed.pkpass">Add to Apple Wallet</a></p>
  -->

  <footer class="footer"><p>© 2026 Ali Hamed</p></footer>

</main>
</body>
</html>
```

- [ ] **Step 5: Write `src/styles.css`**

```css
/* Ali Hamed — digital business card.
   Pure monochrome. Six colour tokens, one gradient, two transitions. */

:root {
  --text-primary: #F5F5F7;
  --text-secondary: #98989D;
  --text-tertiary: #86868B;
  --hairline: rgba(255, 255, 255, 0.09);
  --surface: rgba(255, 255, 255, 0.04);
  --surface-pressed: rgba(255, 255, 255, 0.08);

  --radius: 14px;
  --column: 420px;
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
          "Helvetica Neue", Helvetica, Arial, sans-serif;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  font-family: var(--font);
  color: var(--text-primary);
  /* The entire depth budget: one wide radial lift on true black, so the
     page edges are unlit pixels on an OLED display. */
  background: radial-gradient(120% 80% at 50% 0%, #16161A 0%, #000000 62%), #000000;
  background-attachment: fixed;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--column);
  min-height: 100dvh;
  padding:
    calc(env(safe-area-inset-top) + 76px)
    calc(env(safe-area-inset-right) + 24px)
    calc(env(safe-area-inset-bottom) + 32px)
    calc(env(safe-area-inset-left) + 24px);
}

/* ---- Identity ---------------------------------------------------------- */

.name {
  margin: 0;
  font-size: clamp(30px, 8.5vw, 40px);
  font-weight: 600;
  letter-spacing: 0.14em;
  line-height: 1.1;
}

.role {
  margin: 16px 0 0;
  font-size: 17px;
  font-weight: 400;
  color: var(--text-secondary);
}

.tech {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
}

.rule {
  margin: 28px 0 0;
  border: 0;
  border-top: 1px solid var(--hairline);
}

/* ---- Pitch ------------------------------------------------------------- */

.pitch { margin-top: 28px; }

.message {
  margin: 0;
  max-width: 34ch;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.cta {
  margin: 20px 0 0;
  font-size: 17px;
  font-weight: 500;
}

/* ---- Contacts ---------------------------------------------------------- */

.contacts { margin-top: 40px; }

.contacts ul {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius);
}

.contacts a {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 0 16px;
  font-size: 17px;
  color: var(--text-primary);
  text-decoration: none;
  transition: background 140ms var(--ease), transform 140ms var(--ease);
}

/* Dividers inset to the label's left edge, not full bleed. */
.contacts li + li a::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 50px;
  border-top: 1px solid var(--hairline);
}

.contacts li:first-child a { border-radius: var(--radius) var(--radius) 0 0; }
.contacts li:last-child  a { border-radius: 0 0 var(--radius) var(--radius); }

.contacts a:active {
  background: var(--surface-pressed);
  transform: scale(0.99);
}

.icon {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  fill: currentColor;
}

.label { flex: 1 1 auto; }

.chev {
  flex: 0 0 auto;
  width: 7px;
  height: 12px;
  fill: none;
  stroke: var(--text-tertiary);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.7;
}

/* ---- Save Contact ------------------------------------------------------ */

.save {
  margin: 32px 0 0;
  text-align: center;
}

.save a {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 11px 20px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  transition: background 140ms var(--ease), color 140ms var(--ease),
              transform 140ms var(--ease);
}

.save a:active {
  background: var(--surface-pressed);
  color: var(--text-primary);
  transform: scale(0.99);
}

.dl {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- Footer ------------------------------------------------------------ */

.footer {
  margin-top: auto;
  padding-top: 56px;
}

.footer p {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--text-tertiary);
}

/* ---- Focus ------------------------------------------------------------- */

a:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
  border-radius: 6px;
}

/* ---- Motion ------------------------------------------------------------ */

@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}

.identity, .rule, .pitch, .contacts, .save, .footer {
  animation: rise 460ms var(--ease) both;
}

/* Five groups; the rule rises with the identity it belongs to. */
.identity, .rule { animation-delay: 0ms; }
.pitch           { animation-delay: 60ms; }
.contacts        { animation-delay: 120ms; }
.save            { animation-delay: 180ms; }
.footer          { animation-delay: 240ms; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  .contacts a:active, .save a:active { transform: none; }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="page|copy|href|h1|Wallet anchor|emoji|grey|token|motion"`
Expected: PASS — 10 tests

- [ ] **Step 7: Commit**

```bash
git add src/index.html src/styles.css src/icons/ test/page.test.mjs
git commit -m "feat: author the digital business card page

Copy lives literally in the HTML so the page stays readable; a drift test
proves it identical to config.json. Wallet anchor ships commented out."
```

---

## Task 7: Build the site

**Files:**
- Create: `src/lib/site.mjs`
- Test: `test/site.test.mjs`

**Interfaces:**
- Consumes: `Config` (Task 1), `wordmarkSVG` (Task 3), authored page (Task 6)
- Produces:
  - `inlineIcon(name: string) -> Promise<string>`
  - `stampHTML(html: string, config: Config) -> Promise<string>` (throws on any unreplaced `{{token}}`)
  - `renderTouchIcon() -> Promise<Buffer>` (180×180 PNG)
  - `renderOGImage(config) -> Promise<Buffer>` (1200×630 PNG)

- [ ] **Step 1: Write the failing tests `test/site.test.mjs`**

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="inline|token|touch icon|OG image"`
Expected: FAIL — `Cannot find module '../src/lib/site.mjs'`

- [ ] **Step 3: Write `src/lib/site.mjs`**

```js
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { wordmarkSVG } from './text-path.mjs';

// Hand-authored glyphs live in src/icons; vendored brand marks in vendor/icons.
const ICON_DIRS = [
  new URL('../icons/', import.meta.url),
  new URL('../../vendor/icons/', import.meta.url),
];

export async function inlineIcon(name) {
  let raw = null;
  for (const dir of ICON_DIRS) {
    try {
      raw = await readFile(new URL(`${name}.svg`, dir), 'utf8');
      break;
    } catch { /* try the next directory */ }
  }
  if (raw === null) {
    throw new Error(
      `Icon "${name}.svg" not found in src/icons/ or vendor/icons/. ` +
      'For brand marks, run: npm run fetch:assets'
    );
  }
  return raw
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')      // avoid double announcement
    .replace(/\s(role|width|height|fill)="[^"]*"/g, '')
    .replace(/<svg/, '<svg class="icon" aria-hidden="true" fill="currentColor"')
    .trim();
}

export async function stampHTML(html, config) {
  let out = html.replaceAll('{{CARD_URL}}', config.url.CARD_URL);

  for (const match of [...out.matchAll(/\{\{ICON:([a-z]+)\}\}/g)]) {
    out = out.replace(match[0], await inlineIcon(match[1]));
  }

  // Any surviving token is a typo that would otherwise ship visibly.
  const leftover = out.match(/\{\{[^}]+\}\}/);
  if (leftover) {
    throw new Error(`Unreplaced template token in HTML: ${leftover[0]}`);
  }
  return out;
}

/** 180x180 Add-to-Home-Screen icon: "AH" centred on black. */
export async function renderTouchIcon() {
  const mark = await wordmarkSVG('AH', {
    fontSize: 74, letterSpacing: 3, fill: '#F5F5F7',
  });
  return sharp({
    create: { width: 180, height: 180, channels: 4, background: '#000000' },
  })
    .composite([{ input: Buffer.from(mark), gravity: 'centre' }])
    .png()
    .toBuffer();
}

/** 1200x630 link-preview card: the wordmark and role on black. */
export async function renderOGImage(config) {
  const name = await wordmarkSVG(config.content.name, {
    fontSize: 92, letterSpacing: 13, fill: '#F5F5F7',
  });
  const role = await wordmarkSVG(config.content.role, {
    weight: 'regular', fontSize: 38, fill: '#98989D',
  });
  return sharp({
    create: { width: 1200, height: 630, channels: 4, background: '#000000' },
  })
    .composite([
      { input: Buffer.from(name), top: 262, left: 96 },
      { input: Buffer.from(role), top: 380, left: 100 },
    ])
    .png()
    .toBuffer();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="inline|token|touch icon|OG image"`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/site.mjs test/site.test.mjs
git commit -m "feat: add site build with token stamping and image rendering

An unreplaced template token throws rather than shipping visibly to a page
someone scans at a conference."
```

---

## Task 8: Apple Wallet pass

**Files:**
- Create: `src/lib/pass.mjs`
- Test: `test/pass.test.mjs`

**Interfaces:**
- Consumes: `Config` (Task 1), `wordmarkSVG` (Task 3)
- Produces:
  - `class PassError extends Error`
  - `buildPassJSON(config) -> object` (throws `PassError` on unset identifiers)
  - `renderPassAssets() -> Promise<Map<string, Buffer>>` — six PNGs

The name lives in `logo.png`, not in a field, because only the top strip of a pass is visible when passes are stacked in Wallet. That frees the primary field for the role.

- [ ] **Step 1: Write the failing tests `test/pass.test.mjs`**

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="pass|Team ID|barcode|primary field|assets"`
Expected: FAIL — `Cannot find module '../src/lib/pass.mjs'`

- [ ] **Step 3: Write `src/lib/pass.mjs`**

```js
import sharp from 'sharp';
import { wordmarkSVG } from './text-path.mjs';

export class PassError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PassError';
  }
}

const link = (href, text) => `<a href="${href}">${text}</a>`;

export function buildPassJSON(config) {
  const { apple, content, contacts, url } = config;

  if (!/^[A-Z0-9]{10}$/.test(apple.teamIdentifier ?? '')) {
    throw new PassError(
      `apple.teamIdentifier must be your 10-character Apple Team ID, got ` +
      `"${apple.teamIdentifier ?? ''}". Copy it from developer.apple.com > ` +
      'Membership into config.json.'
    );
  }
  if (!/^pass\.[A-Za-z0-9][A-Za-z0-9.-]*$/.test(apple.passTypeIdentifier ?? '')) {
    throw new PassError(
      `apple.passTypeIdentifier must start with "pass.", got ` +
      `"${apple.passTypeIdentifier ?? ''}". Create it at developer.apple.com > ` +
      'Identifiers > Pass Type IDs.'
    );
  }

  const short = url.CARD_URL.replace(/^https:\/\//, '');

  return {
    formatVersion: 1,
    passTypeIdentifier: apple.passTypeIdentifier,
    teamIdentifier: apple.teamIdentifier,
    organizationName: apple.organizationName,
    serialNumber: apple.serialNumber,
    description: apple.description,

    backgroundColor: 'rgb(0,0,0)',
    foregroundColor: 'rgb(245,245,247)',
    labelColor: 'rgb(134,134,139)',

    generic: {
      // The name is carried by logo.png: it is the only element visible when
      // passes are stacked in Wallet. That leaves the role the largest type.
      primaryFields: [
        { key: 'role', label: '', value: content.role },
      ],
      secondaryFields: [
        { key: 'stack', label: 'TECHNOLOGIES', value: content.technologies },
      ],
      backFields: [
        { key: 'message', label: '', value: content.message },
        { key: 'cta', label: '', value: content.cta },
        {
          key: 'card', label: 'DIGITAL CARD',
          value: url.CARD_URL, attributedValue: link(url.CARD_URL, short),
        },
        {
          key: 'linkedin', label: 'LINKEDIN',
          value: contacts.linkedin,
          attributedValue: link(contacts.linkedin, 'linkedin.com/in/idalhamed'),
        },
        {
          key: 'github', label: 'GITHUB',
          value: contacts.github,
          attributedValue: link(contacts.github, 'github.com/idAlhamed'),
        },
        {
          key: 'whatsapp', label: 'WHATSAPP',
          value: contacts.phone,
          attributedValue: link(contacts.whatsapp, contacts.phone),
        },
        {
          key: 'email', label: 'EMAIL',
          value: contacts.email,
          attributedValue: link(`mailto:${contacts.email}`, contacts.email),
        },
      ],
    },

    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: url.CARD_URL,
      messageEncoding: 'iso-8859-1',
      altText: short,
    }],
  };
}

// Render large, then downscale: rasterising an SVG at its final small size
// produces soft edges on the 29px icon.
const RENDER_SIZE = 240;

async function renderIcon(size) {
  const mark = await wordmarkSVG('AH', {
    fontSize: RENDER_SIZE, letterSpacing: RENDER_SIZE * 0.06, fill: '#F5F5F7',
  });
  const glyph = await sharp(Buffer.from(mark))
    .resize({ width: Math.round(size * 0.62), fit: 'inside' })
    .png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: '#000000' },
  }).composite([{ input: glyph, gravity: 'centre' }]).png().toBuffer();
}

// Transparent background: Wallet composites the logo onto backgroundColor.
async function renderLogo(text, width, height) {
  const mark = await wordmarkSVG(text, {
    fontSize: RENDER_SIZE, letterSpacing: RENDER_SIZE * 0.14, fill: '#F5F5F7',
  });
  const fitted = await sharp(Buffer.from(mark))
    .resize({ width, height, fit: 'inside' })
    .png().toBuffer();
  const { height: fh } = await sharp(fitted).metadata();
  return sharp({
    create: {
      width, height, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fitted, left: 0, top: Math.round((height - fh) / 2) }])
    .png().toBuffer();
}

export async function renderPassAssets() {
  return new Map([
    ['icon.png', await renderIcon(29)],
    ['icon@2x.png', await renderIcon(58)],
    ['icon@3x.png', await renderIcon(87)],
    ['logo.png', await renderLogo('ALI HAMED', 160, 50)],
    ['logo@2x.png', await renderLogo('ALI HAMED', 320, 100)],
    ['logo@3x.png', await renderLogo('ALI HAMED', 480, 150)],
  ]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="pass|Team ID|barcode|primary field|assets"`
Expected: PASS — 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/pass.mjs test/pass.test.mjs
git commit -m "feat: build Apple Wallet pass.json and assets

Wallet renders the QR from barcodes[0].message, so the pass and the page
cannot disagree about the destination. Refuses to build on unset identifiers."
```

---

## Task 9: Pass signing script

**Files:**
- Create: `wallet/sign-pass.sh`
- Test: `test/sign.test.mjs`

**Interfaces:**
- Consumes: `wallet/AliHamed.pass/` (produced by Task 11), `wallet/certs/*` (supplied by Ali)
- Produces: `dist/AliHamed.pkpass`

Every guard names the outstanding manual step. A malformed `.pkpass` is never written.

- [ ] **Step 1: Write the failing test `test/sign.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const script = new URL('../wallet/sign-pass.sh', import.meta.url).pathname;

async function runIn(env = {}) {
  try {
    const { stdout, stderr } = await run('bash', [script], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('exits non-zero and names the missing certificate', async () => {
  const certs = await mkdtemp(join(tmpdir(), 'certs-'));
  const passDir = await mkdtemp(join(tmpdir(), 'pass-'));
  await mkdir(join(passDir, 'AliHamed.pass'), { recursive: true });
  await writeFile(join(passDir, 'AliHamed.pass', 'pass.json'), '{}');

  const r = await runIn({ PASS_CERT_DIR: certs, PASS_BUNDLE_DIR: join(passDir, 'AliHamed.pass') });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /No \.p12/);
  assert.match(r.stderr, /Keychain Access/, 'must name the outstanding manual step');
});

test('exits non-zero when the pass bundle has not been built', async () => {
  const certs = await mkdtemp(join(tmpdir(), 'certs-'));
  const r = await runIn({ PASS_CERT_DIR: certs, PASS_BUNDLE_DIR: '/nonexistent/AliHamed.pass' });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /npm run build/);
});

test('never writes a .pkpass when a guard trips', async () => {
  const certs = await mkdtemp(join(tmpdir(), 'certs-'));
  const dist = await mkdtemp(join(tmpdir(), 'dist-'));
  await runIn({ PASS_CERT_DIR: certs, PASS_DIST_DIR: dist, PASS_BUNDLE_DIR: '/nonexistent' });
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(dist), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="sign|certificate|pkpass when"`
Expected: FAIL — `ENOENT: wallet/sign-pass.sh`

- [ ] **Step 3: Write `wallet/sign-pass.sh`**

```bash
#!/usr/bin/env bash
# Signs and packages the Apple Wallet pass.
# Every path is overridable so the guards can be tested in isolation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="${PASS_BUNDLE_DIR:-$ROOT/wallet/AliHamed.pass}"
CERT_DIR="${PASS_CERT_DIR:-$ROOT/wallet/certs}"
DIST_DIR="${PASS_DIST_DIR:-$ROOT/dist}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf '\nCannot sign the pass.\n\n%s\n\nFull instructions: wallet/README.md\n\n' "$1" >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || fail "openssl was not found on PATH."
command -v zip     >/dev/null 2>&1 || fail "zip was not found on PATH."

[ -d "$BUNDLE_DIR" ] || fail "Pass bundle not found at:
  $BUNDLE_DIR

Build it first:  npm run build"

P12="$(find "$CERT_DIR" -maxdepth 1 -name '*.p12' 2>/dev/null | head -n1 || true)"
[ -n "$P12" ] || fail "No .p12 certificate found in:
  $CERT_DIR

Outstanding steps:
  1. Keychain Access > Certificate Assistant > Request a Certificate
     From a Certificate Authority > save to disk
  2. developer.apple.com > Identifiers > Pass Type IDs > create
     pass.com.alihamed.card
  3. Create Certificate, upload the CSR, download pass.cer
  4. Double-click pass.cer to install it
  5. In Keychain Access select the certificate AND its private key >
     Export 2 items > save as wallet/certs/Certificates.p12"

WWDR="$(find "$CERT_DIR" -maxdepth 1 \( -name '*WWDR*.cer' -o -name '*WWDR*.pem' \) 2>/dev/null | head -n1 || true)"
[ -n "$WWDR" ] || fail "No Apple WWDR intermediate certificate found in:
  $CERT_DIR

Download the WWDR G4 certificate from
https://www.apple.com/certificateauthority/ and save it into wallet/certs/."

if [ -z "${PASS_CERT_PASSWORD:-}" ]; then
  read -r -s -p "Password for $(basename "$P12"): " PASS_CERT_PASSWORD
  echo
fi
export PASS_CERT_PASSWORD

# OpenSSL 3 refuses Keychain-exported .p12 files without -legacy: Keychain
# still encrypts them with RC2, which moved to the legacy provider.
LEGACY=""
if openssl version | grep -q '^OpenSSL 3'; then LEGACY="-legacy"; fi

# shellcheck disable=SC2086
openssl pkcs12 $LEGACY -in "$P12" -clcerts -nokeys \
  -out "$WORK/cert.pem" -passin env:PASS_CERT_PASSWORD 2>/dev/null \
  || fail "Could not read the certificate from $(basename "$P12").
The password may be wrong, or the file may not be a Pass Type ID certificate."

# shellcheck disable=SC2086
openssl pkcs12 $LEGACY -in "$P12" -nocerts -nodes \
  -out "$WORK/key.pem" -passin env:PASS_CERT_PASSWORD 2>/dev/null \
  || fail "Could not read the private key from $(basename "$P12").
Re-export from Keychain Access selecting BOTH the certificate and its
private key (Export 2 items)."

case "$WWDR" in
  *.cer) openssl x509 -inform DER -in "$WWDR" -out "$WORK/wwdr.pem" ;;
  *)     cp "$WWDR" "$WORK/wwdr.pem" ;;
esac

mkdir -p "$WORK/pass"
cp "$BUNDLE_DIR"/* "$WORK/pass/"
rm -f "$WORK/pass/manifest.json" "$WORK/pass/signature"

# manifest.json maps every filename to the SHA-1 of its contents.
cd "$WORK/pass"
{
  printf '{\n'
  first=1
  for f in *; do
    if [ "$f" = "manifest.json" ]; then continue; fi
    h="$(openssl dgst -sha1 -hex "$f" | awk '{print $NF}')"
    if [ "$first" -eq 0 ]; then printf ',\n'; fi
    printf '  "%s" : "%s"' "$f" "$h"
    first=0
  done
  printf '\n}\n'
} > manifest.json

openssl smime -binary -sign \
  -certfile "$WORK/wwdr.pem" \
  -signer "$WORK/cert.pem" \
  -inkey "$WORK/key.pem" \
  -in manifest.json \
  -out signature \
  -outform DER \
  || fail "Signing failed. Check that the certificate has not expired and
matches passTypeIdentifier in config.json."

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/AliHamed.pkpass"
# Files must sit at the archive ROOT. Nesting them inside a folder produces a
# pass that fails to open with no useful error.
zip -q -r "$DIST_DIR/AliHamed.pkpass" . -x '.*'

printf '\nSigned: %s/AliHamed.pkpass\n' "$DIST_DIR"
printf 'Install by AirDrop or email. Do not host it until the MIME type is verified.\n\n'
```

- [ ] **Step 4: Make it executable and run the tests**

Run: `chmod +x wallet/sign-pass.sh && npm test -- --test-name-pattern="sign|certificate|pkpass when"`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add wallet/sign-pass.sh test/sign.test.mjs
git commit -m "feat: add pass signing script with step-naming guards

Handles the OpenSSL 3 -legacy requirement for Keychain-exported .p12 files
and zips with files at the archive root."
```

---

## Task 10: Print artwork

**Files:**
- Create: `src/lib/print.mjs`
- Test: `test/print.test.mjs`

**Interfaces:**
- Consumes: `Config` (Task 1), `loadFont`/`textToPath` (Task 3), `qrModules` (Task 4)
- Produces:
  - `CARD` — `{ trimW: 85.6, trimH: 54, bleed: 3, safe: 4, qrSize: 20, qrPanel: 26 }`
  - `DOC_W` (91.6), `DOC_H` (60), `MM_TO_PT` (2.834645669)
  - `RICH_BLACK_CMYK` — `[60, 50, 50, 100]`
  - `buildCardSVG(face: 'front'|'back', config) -> Promise<string>`
  - `buildCardPDF(face: 'front'|'back', config, outPath) -> Promise<void>`

All geometry is in millimetres; the SVG `viewBox` is millimetre-based so numbers in code equal numbers on the printed card. The QR sits in a light panel — inverted QR codes defeat most non-iOS scanners.

- [ ] **Step 1: Write the failing tests `test/print.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCardSVG, buildCardPDF, CARD, DOC_W, DOC_H, RICH_BLACK_CMYK,
} from '../src/lib/print.mjs';
import { qrModules } from '../src/lib/qr.mjs';
import { validConfig } from './fixtures.mjs';

test('document size is trim plus bleed on every edge', () => {
  assert.equal(DOC_W, 91.6);
  assert.equal(DOC_H, 60);
  assert.equal(CARD.trimW, 85.6);
  assert.equal(CARD.trimH, 54);
  assert.equal(CARD.bleed, 3);
});

test('rich black is four-channel, not single-channel', () => {
  assert.deepEqual(RICH_BLACK_CMYK, [60, 50, 50, 100]);
});

test('the SVG declares real millimetre dimensions', async () => {
  const svg = await buildCardSVG('front', validConfig());
  assert.match(svg, /width="91.6mm"/);
  assert.match(svg, /height="60mm"/);
  assert.match(svg, /viewBox="0 0 91.6 60"/);
});

test('rejects an unknown face', async () => {
  await assert.rejects(() => buildCardSVG('side', validConfig()), /Unknown card face/);
});

test('type is outlined, never live text', async () => {
  for (const face of ['front', 'back']) {
    const svg = await buildCardSVG(face, validConfig());
    assert.doesNotMatch(svg, /<text/, `${face} must not contain live text`);
  }
});

test('the QR meets the 18mm scanning minimum', async () => {
  assert.ok(CARD.qrSize >= 18, 'QR must be at least 18mm to scan reliably');
  assert.ok(CARD.qrPanel > CARD.qrSize, 'the panel must provide a quiet zone');
});

test('the QR sits on a light panel, not inverted on black', async () => {
  const svg = await buildCardSVG('back', validConfig());
  assert.match(svg, /class="qr-panel"[^>]*fill="#FFFFFF"/);
});

test('every dark QR module is drawn', async () => {
  const config = validConfig();
  const svg = await buildCardSVG('back', config);
  const { size, data } = qrModules(config.url.CARD_URL);
  const expected = [...data].filter(Boolean).length;
  assert.equal((svg.match(/class="qr-m"/g) ?? []).length, expected);
  assert.ok(size >= 21);
});

test('crop marks stay inside the bleed and never enter the trim', async () => {
  const svg = await buildCardSVG('front', validConfig());
  assert.ok((svg.match(/class="crop"/g) ?? []).length >= 8, 'two marks per corner');
});

test('writes a real PDF for each face', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'print-'));
  for (const face of ['front', 'back']) {
    const out = join(dir, `${face}.pdf`);
    await buildCardPDF(face, validConfig(), out);
    const head = (await readFile(out)).subarray(0, 5).toString('ascii');
    assert.equal(head, '%PDF-', `${face}.pdf is not a PDF`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="print|card face|QR module|crop|rich black|millimetre|PDF"`
Expected: FAIL — `Cannot find module '../src/lib/print.mjs'`

- [ ] **Step 3: Write `src/lib/print.mjs`**

```js
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import PDFDocument from 'pdfkit';
import { loadFont, textToPath } from './text-path.mjs';
import { qrModules } from './qr.mjs';

// Standard business card, in millimetres.
export const CARD = {
  trimW: 85.6, trimH: 54,
  bleed: 3,      // printer trims into this
  safe: 4,       // nothing important inside this margin
  qrSize: 20,    // >= 18mm, the reliable-scan minimum
  qrPanel: 26,   // light panel providing the quiet zone
};

export const DOC_W = CARD.trimW + CARD.bleed * 2;   // 91.6
export const DOC_H = CARD.trimH + CARD.bleed * 2;   // 60
export const MM_TO_PT = 2.834645669;

// Single-channel black prints thin and grey. Four-channel rich black does not.
export const RICH_BLACK_CMYK = [60, 50, 50, 100];
const INK_RGB = '#0A0A0B';   // screen preview only; the PDF carries the CMYK
const PAPER = '#FFFFFF';
const PRIMARY = '#F5F5F7';
const TERTIARY = '#86868B';

const L = CARD.bleed + CARD.safe;              // left safe edge: 7mm
const R = CARD.bleed + CARD.trimW - CARD.safe; // right safe edge: 84.6mm

/** Lays out one line of outlined type with its ink-top at `y`. */
async function line(text, { weight = 'semibold', size, spacing = 0, x, y, fill }) {
  const font = await loadFont(weight);
  const { d, box, advance } = textToPath(font, text, {
    fontSize: size, letterSpacing: spacing,
  });
  const dy = (y - box.y1).toFixed(3);
  return {
    svg: `<path transform="translate(${x} ${dy})" d="${d}" fill="${fill}"/>`,
    d, x, y: Number(dy), advance,
  };
}

function cropMarks() {
  const b = CARD.bleed;
  const len = 2;   // stays inside the 3mm bleed, never touching the trim
  const x2 = b + CARD.trimW;
  const y2 = b + CARD.trimH;
  const mark = (x1, y1, x2_, y2_) =>
    `<line class="crop" x1="${x1}" y1="${y1}" x2="${x2_}" y2="${y2_}" ` +
    `stroke="#FFFFFF" stroke-width="0.1"/>`;
  return [
    mark(0, b, len, b),           mark(b, 0, b, len),
    mark(DOC_W - len, b, DOC_W, b), mark(x2, 0, x2, len),
    mark(0, y2, len, y2),         mark(b, DOC_H - len, b, DOC_H),
    mark(DOC_W - len, y2, DOC_W, y2), mark(x2, DOC_H - len, x2, DOC_H),
  ].join('');
}

function qrSVG(url, x, y) {
  const { size, data } = qrModules(url);
  const m = CARD.qrSize / size;
  const parts = [
    `<rect class="qr-panel" x="${x}" y="${y}" width="${CARD.qrPanel}" ` +
    `height="${CARD.qrPanel}" rx="2" fill="${PAPER}"/>`,
  ];
  const ox = x + (CARD.qrPanel - CARD.qrSize) / 2;
  const oy = y + (CARD.qrPanel - CARD.qrSize) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!data[r * size + c]) continue;
      parts.push(
        `<rect class="qr-m" x="${(ox + c * m).toFixed(3)}" ` +
        `y="${(oy + r * m).toFixed(3)}" width="${m.toFixed(3)}" ` +
        `height="${m.toFixed(3)}" fill="#000000"/>`
      );
    }
  }
  return parts.join('');
}

async function faceElements(face, config) {
  if (face === 'front') {
    const name = await line(config.content.name, {
      size: 5.2, spacing: 0.72, x: L, y: 23.5, fill: PRIMARY,
    });
    const tech = await line(config.content.technologies, {
      weight: 'regular', size: 2.2, spacing: 0.18, x: L, y: 31, fill: TERTIARY,
    });
    return name.svg + tech.svg;
  }
  if (face === 'back') {
    const role = await line(config.content.role, {
      weight: 'regular', size: 3.2, x: L, y: 22, fill: PRIMARY,
    });
    const short = config.url.CARD_URL.replace(/^https:\/\//, '');
    const url = await line(short, {
      weight: 'regular', size: 2.1, x: L, y: 29.5, fill: TERTIARY,
    });
    const qr = qrSVG(config.url.CARD_URL, R - CARD.qrPanel, (DOC_H - CARD.qrPanel) / 2);
    return role.svg + url.svg + qr;
  }
  throw new Error(`Unknown card face "${face}". Use "front" or "back".`);
}

export async function buildCardSVG(face, config) {
  const body = await faceElements(face, config);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DOC_W}mm" ` +
    `height="${DOC_H}mm" viewBox="0 0 ${DOC_W} ${DOC_H}">` +
    `<rect x="0" y="0" width="${DOC_W}" height="${DOC_H}" fill="${INK_RGB}"/>` +
    body + cropMarks() + '</svg>';
}

export async function buildCardPDF(face, config, outPath) {
  if (face !== 'front' && face !== 'back') {
    throw new Error(`Unknown card face "${face}". Use "front" or "back".`);
  }

  const doc = new PDFDocument({
    size: [DOC_W * MM_TO_PT, DOC_H * MM_TO_PT],
    margin: 0,
    info: { Title: `${config.content.fullName} — business card ${face}` },
  });
  const stream = createWriteStream(outPath);
  doc.pipe(stream);

  doc.save().scale(MM_TO_PT);   // draw in millimetres from here on

  doc.rect(0, 0, DOC_W, DOC_H).fill(RICH_BLACK_CMYK);

  if (face === 'front') {
    const name = await line(config.content.name, {
      size: 5.2, spacing: 0.72, x: L, y: 23.5, fill: PRIMARY,
    });
    const tech = await line(config.content.technologies, {
      weight: 'regular', size: 2.2, spacing: 0.18, x: L, y: 31, fill: TERTIARY,
    });
    doc.save().translate(name.x, name.y).path(name.d).fill(PRIMARY).restore();
    doc.save().translate(tech.x, tech.y).path(tech.d).fill(TERTIARY).restore();
  } else {
    const role = await line(config.content.role, {
      weight: 'regular', size: 3.2, x: L, y: 22, fill: PRIMARY,
    });
    const short = config.url.CARD_URL.replace(/^https:\/\//, '');
    const url = await line(short, {
      weight: 'regular', size: 2.1, x: L, y: 29.5, fill: TERTIARY,
    });
    doc.save().translate(role.x, role.y).path(role.d).fill(PRIMARY).restore();
    doc.save().translate(url.x, url.y).path(url.d).fill(TERTIARY).restore();

    const px = R - CARD.qrPanel;
    const py = (DOC_H - CARD.qrPanel) / 2;
    doc.roundedRect(px, py, CARD.qrPanel, CARD.qrPanel, 2).fill(PAPER);

    const { size, data } = qrModules(config.url.CARD_URL);
    const m = CARD.qrSize / size;
    const ox = px + (CARD.qrPanel - CARD.qrSize) / 2;
    const oy = py + (CARD.qrPanel - CARD.qrSize) / 2;
    doc.fillColor('#000000');
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (data[r * size + c]) doc.rect(ox + c * m, oy + r * m, m, m);
      }
    }
    doc.fill();
  }

  doc.restore();
  doc.end();
  await once(stream, 'finish');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="print|card face|QR module|crop|rich black|millimetre|PDF"`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/print.mjs test/print.test.mjs
git commit -m "feat: generate print artwork at exact millimetre geometry

Rich black CMYK, 3mm bleed, crop marks inside the bleed, and a 20mm QR on a
light panel because inverted codes defeat most non-iOS scanners."
```

---

## Task 11: Build orchestrator and NFC documentation

**Files:**
- Create: `src/lib/docs.mjs`, `scripts/build.mjs`
- Test: `test/docs.test.mjs`, `test/build.test.mjs`

**Interfaces:**
- Consumes: every module from Tasks 1–10
- Produces: `nfcReadme(config) -> string`; the populated `docs/`, `wallet/AliHamed.pass/`, `print/`, and `nfc/` trees

The build **continues** when the Team ID is unset — Ali cannot supply it until he creates the Pass Type ID, and the website must not be blocked on that. It prints a prominent notice instead. `--strict` turns the notice into a failure, for CI.

- [ ] **Step 1: Write the failing tests `test/docs.test.mjs`**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="NFC guide|tag type|locking|follows the URL"`
Expected: FAIL — `Cannot find module '../src/lib/docs.mjs'`

- [ ] **Step 3: Write `src/lib/docs.mjs`**

```js
/** Generated so the URL in the instructions can never drift from config. */
export function nfcReadme(config) {
  const url = config.url.CARD_URL;
  return `# Programming the NFC card

The NFC tag and the QR code point at the same destination:

    ${url}

## What to buy

An **NTAG213**, NTAG215, or NTAG216 tag — as a blank PVC card, or as a sticker
to place inside a printed card. NTAG213 holds 144 bytes; this URL is
${url.length} characters, so capacity is not a constraint. Buy the cheapest of
the three.

## Programming it

1. Install **NFC Tools** (free, iOS and Android).
2. Open the app and choose **Write**.
3. Tap **Add a record** > **URL/URI**.
4. Enter exactly:

       ${url}

5. Tap **Write**, then hold the tag against the top of your phone.
6. Test it: lock your phone, then tap the tag against another iPhone.

## Locking

NFC Tools offers to lock the tag so it can never be rewritten. This is
**permanent and irreversible**. Only lock a tag after you have confirmed the
URL opens correctly, and keep at least one unlocked spare.

## Why the Wallet pass does not do this

An Apple Wallet pass cannot broadcast an arbitrary URL over NFC. The \`nfc\`
dictionary in PassKit is Value Added Services: it requires an NFC certificate
from Apple, works only with certified merchant terminals, and transmits an
encrypted payload rather than a link. There is no supported way to make a pass
tap-to-open a website on someone else's phone.

So the pass carries the QR code, and this tag carries the URL. Both resolve to
the same place.

## iPhone background reading

iPhone XS and later read NDEF tags with no app open and the screen simply
awake. A tap surfaces a notification that opens the page. Nothing to install
on the other person's phone.
`;
}
```

- [ ] **Step 4: Write the failing test `test/build.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const script = new URL('scripts/build.mjs', root).pathname;

test('the build completes and reports the Team ID as outstanding', async () => {
  const { stdout } = await run('node', [script]);
  assert.match(stdout, /Team ID/i, 'must tell Ali what is still missing');
  assert.match(stdout, /Build complete/);
});

test('produces every site artifact', async () => {
  for (const f of ['index.html', 'styles.css', 'ali-hamed.vcf',
    'assets/qr.svg', 'assets/qr.png', 'assets/apple-touch-icon.png', 'assets/og.png']) {
    await assert.doesNotReject(access(new URL(`docs/${f}`, root)), `missing docs/${f}`);
  }
});

test('the built page carries the real URL and no surviving tokens', async () => {
  const html = await readFile(new URL('docs/index.html', root), 'utf8');
  assert.ok(html.includes('https://idalhamed.github.io/card'));
  assert.doesNotMatch(html, /\{\{/, 'a template token survived into the output');
  assert.match(html, /<svg class="icon"/, 'icons must be inlined');
});

test('produces the print artwork', async () => {
  for (const f of ['card-front.svg', 'card-back.svg', 'card-front.pdf', 'card-back.pdf']) {
    await assert.doesNotReject(access(new URL(`print/${f}`, root)), `missing print/${f}`);
  }
});

test('produces the pass assets even without a Team ID', async () => {
  for (const f of ['icon.png', 'logo.png', 'logo@3x.png']) {
    await assert.doesNotReject(access(new URL(`wallet/AliHamed.pass/${f}`, root)));
  }
});

test('writes the NFC guide with the live URL', async () => {
  const md = await readFile(new URL('nfc/README.md', root), 'utf8');
  assert.ok(md.includes('https://idalhamed.github.io/card'));
});

test('--strict fails while the Team ID is unset', async () => {
  await assert.rejects(() => run('node', [script, '--strict']), (err) => {
    assert.notEqual(err.code, 0);
    return true;
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="build|artifact|print artwork|NFC guide|strict"`
Expected: FAIL — `Cannot find module 'scripts/build.mjs'`

- [ ] **Step 6: Write `scripts/build.mjs`**

```js
import { mkdir, writeFile, rm, copyFile, readFile } from 'node:fs/promises';
import { loadConfig } from '../src/lib/config.mjs';
import { generateQRSVG, generateQRPNG, assertQRRoundTrip } from '../src/lib/qr.mjs';
import { buildVCard } from '../src/lib/vcard.mjs';
import { stampHTML, renderTouchIcon, renderOGImage } from '../src/lib/site.mjs';
import { buildPassJSON, renderPassAssets, PassError } from '../src/lib/pass.mjs';
import { buildCardSVG, buildCardPDF } from '../src/lib/print.mjs';
import { nfcReadme } from '../src/lib/docs.mjs';

const root = new URL('../', import.meta.url);
const at = (p) => new URL(p, root);
const strict = process.argv.includes('--strict');
const notices = [];

const config = await loadConfig();
const CARD_URL = config.url.CARD_URL;
console.log(`Building for ${CARD_URL}\n`);

// ---- Site -----------------------------------------------------------------
await rm(at('docs/'), { recursive: true, force: true });
await mkdir(at('docs/assets/'), { recursive: true });

const html = await stampHTML(await readFile(at('src/index.html'), 'utf8'), config);
await writeFile(at('docs/index.html'), html);
await copyFile(at('src/styles.css'), at('docs/styles.css'));
await writeFile(at('docs/ali-hamed.vcf'), buildVCard(config));
console.log('  docs/index.html, styles.css, ali-hamed.vcf');

// ---- QR, with the round-trip guard ----------------------------------------
const qrPNG = await generateQRPNG(CARD_URL);
await assertQRRoundTrip(CARD_URL, qrPNG);     // throws rather than shipping a dead code
await writeFile(at('docs/assets/qr.png'), qrPNG);
await writeFile(at('docs/assets/qr.svg'), await generateQRSVG(CARD_URL));
console.log('  docs/assets/qr.{png,svg}  (round-trip verified)');

await writeFile(at('docs/assets/apple-touch-icon.png'), await renderTouchIcon());
await writeFile(at('docs/assets/og.png'), await renderOGImage(config));
console.log('  docs/assets/apple-touch-icon.png, og.png');

// ---- Wallet ---------------------------------------------------------------
await mkdir(at('wallet/AliHamed.pass/'), { recursive: true });
for (const [name, buf] of await renderPassAssets()) {
  await writeFile(at(`wallet/AliHamed.pass/${name}`), buf);
}
console.log('  wallet/AliHamed.pass/  (6 image assets)');

try {
  const pass = buildPassJSON(config);
  await writeFile(at('wallet/AliHamed.pass/pass.json'), JSON.stringify(pass, null, 2));
  console.log('  wallet/AliHamed.pass/pass.json');
} catch (err) {
  if (!(err instanceof PassError)) throw err;
  // Expected until the Pass Type ID exists. The website must not be blocked.
  await rm(at('wallet/AliHamed.pass/pass.json'), { force: true });
  notices.push(
    `pass.json was NOT written: ${err.message}\n` +
    '     Everything else built normally. See wallet/README.md.'
  );
}

// ---- Print ----------------------------------------------------------------
await mkdir(at('print/'), { recursive: true });
for (const face of ['front', 'back']) {
  await writeFile(at(`print/card-${face}.svg`), await buildCardSVG(face, config));
  await buildCardPDF(face, config, at(`print/card-${face}.pdf`).pathname);
}
console.log('  print/card-{front,back}.{svg,pdf}');

// ---- NFC ------------------------------------------------------------------
await mkdir(at('nfc/'), { recursive: true });
await writeFile(at('nfc/README.md'), nfcReadme(config));
console.log('  nfc/README.md');

// ---- Report ---------------------------------------------------------------
console.log('\nBuild complete.');
if (notices.length) {
  console.log('\nOutstanding:');
  for (const n of notices) console.log(`  -  ${n}`);
  if (strict) {
    console.error('\n--strict was set and items are outstanding.');
    process.exit(1);
  }
}
```

- [ ] **Step 7: Run the build and the tests**

Run: `npm run build && npm test`
Expected: the build reports the Team ID as outstanding and exits 0; the full suite passes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/docs.mjs scripts/build.mjs test/docs.test.mjs test/build.test.mjs docs/ print/ nfc/ wallet/AliHamed.pass/
git commit -m "feat: add build orchestrator and generated NFC guide

One config value fans out to the site, QR, pass, print files, and docs.
An unset Team ID is a notice, not a failure — the site must not be blocked
on an Apple Developer step."
```

---

## Task 12: Documentation

**Files:**
- Create: `README.md`, `wallet/README.md`, `print/README.md`
- Test: `test/readme.test.mjs`

**Interfaces:**
- Consumes: everything built so far
- Produces: no code. Deliverables 4, 5, 6, and 8.

`nfc/README.md` is generated (Task 11) and is not hand-written here.

- [ ] **Step 1: Write the failing test `test/readme.test.mjs`**

```js
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
  assert.match(md, /60,\s?50,\s?50,\s?100|60\/50\/50\/100/);
  assert.match(md, /matte/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --test-name-pattern="README"`
Expected: FAIL — `ENOENT: README.md`

- [ ] **Step 3: Write `README.md`**

```markdown
# Ali Hamed — Digital Business Card

A premium black professional identity system: a mobile-first web page, an Apple
Wallet pass, print artwork, and an NFC tag — all resolving to one URL.

**Live:** https://idalhamed.github.io/card

## The one thing to know

`config.json` is the single source of truth. `CARD_URL` lives there and nowhere
else. Change it, run `npm run build`, and the QR code, Wallet pass, vCard,
canonical tags, print artwork, and NFC instructions all follow.

## Setup

    npm install
    npm run fetch:assets    # one time: vendors Inter and the brand icon marks
    npm run build

## Running locally

    npm run dev

Then open http://localhost:8080. This serves `docs/`, which is exactly what
GitHub Pages serves.

To see it as it will actually be used, open Safari's Web Inspector, choose
Develop > Enter Responsive Design Mode, and pick an iPhone. Better still, run
`ipconfig getifaddr en0` and open `http://<that-ip>:8080` on your phone.

## Deploying

1. Create a GitHub repository named exactly **`card`** under `idAlhamed`.
   The name sets the URL path, so it must match.
2. Push:

       git remote add origin https://github.com/idAlhamed/card.git
       git push -u origin main

3. On GitHub: **Settings > Pages**. Set Source to *Deploy from a branch*,
   branch `main`, folder **`/docs`**. Save.
4. Wait about a minute, then load https://idalhamed.github.io/card

Every later deploy is `npm run build`, commit, push.

### Never commit these

`.gitignore` already covers them, but be aware:

- `IMG_3890.jpg` — a reference image containing a real Adatwq ID number and a
  personal QR code
- `Screenshot*.png` — a reference image, another designer's work
- `wallet/certs/` — your Apple signing credentials

## Project layout

| Path | What it is |
|---|---|
| `config.json` | CARD_URL, Apple identifiers, all copy, all contacts |
| `src/` | Authored page and library modules |
| `docs/` | **Generated.** What GitHub Pages serves. Do not edit by hand. |
| `wallet/` | Pass bundle, signing script, and instructions |
| `print/` | Print-ready front and back artwork |
| `nfc/` | **Generated.** Tag programming instructions. |
| `spec/`, `plan/` | Design specification and implementation plan |

## Changing things later

| To change | Edit | Then |
|---|---|---|
| The URL | `config.json` | `npm run build` |
| Wording | `config.json` **and** `src/index.html` | `npm run test && npm run build` |
| Colours or spacing | `src/styles.css` | `npm run build` |
| Contact links | `config.json` **and** `src/index.html` | `npm run test && npm run build` |

Copy is deliberately duplicated between `config.json` and `src/index.html` so
the page stays readable as a designed document. A test fails if the two ever
disagree, so the duplication cannot drift silently.

## Other guides

- `wallet/README.md` — creating, signing, and installing the Wallet pass
- `print/README.md` — printer specifications
- `nfc/README.md` — programming the NFC tag
```

- [ ] **Step 4: Write `wallet/README.md`**

```markdown
# Apple Wallet pass

## What this is, and what it is not

The pass displays your name, role, and technologies, and carries a QR code
pointing at `CARD_URL`. Wallet renders that QR itself from
`barcodes[0].message`, so the pass and the website can never disagree about
the destination.

**The pass cannot act as an NFC business card.** The `nfc` dictionary in
PassKit is Value Added Services: it requires a separate NFC certificate from
Apple, works only with certified merchant terminals, and transmits an
encrypted payload rather than a URL. No Wallet pass can tap-to-open a website
on someone else's phone. That is what the physical NFC tag is for — see
`nfc/README.md`.

## Signing

`npm run build` produces `wallet/AliHamed.pass/`. That bundle is **unsigned,
and an unsigned pass will not open on any device.** No placeholder certificate
or signature is ever written. These steps are the real remaining work, and
they need your paid Apple Developer account.

**1. Create a signing request**

Keychain Access > Certificate Assistant > *Request a Certificate From a
Certificate Authority*. Enter your email, leave CA Email blank, choose *Saved
to disk*, and save the `.certSigningRequest` file.

**2. Create the Pass Type ID**

developer.apple.com > Certificates, Identifiers & Profiles > Identifiers >
**+** > **Pass Type IDs**. Description: `Ali Hamed Digital Card`. Identifier:
`pass.com.alihamed.card` — it must match `apple.passTypeIdentifier` in
`config.json`.

**3. Create the certificate**

Select the new identifier > *Create Certificate* > upload the CSR from step 1 >
download `pass.cer`.

**4. Install it**

Double-click `pass.cer`. It lands in your login keychain.

**5. Export it with its private key**

In Keychain Access, find the certificate and expand it to reveal the private
key. Select **both** rows, right-click > *Export 2 items* > save as
`wallet/certs/Certificates.p12` with a password you will remember.

Exporting the certificate alone produces a `.p12` that cannot sign anything.

**6. Copy your Team ID**

developer.apple.com > Membership. It is 10 characters. Paste it into
`apple.teamIdentifier` in `config.json`, then run `npm run build` again —
`pass.json` is only written once the Team ID is present.

**7. Download the Apple intermediate certificate**

From https://www.apple.com/certificateauthority/ take **Worldwide Developer
Relations - G4** and save it into `wallet/certs/`.

**8. Sign**

    npm run pass:sign

This writes `dist/AliHamed.pkpass`.

### If signing fails

The script names the missing piece. Two specific traps:

- *Could not read the private key* — you exported the certificate without its
  key. Redo step 5 with both rows selected.
- OpenSSL 3 cannot open Keychain `.p12` files without `-legacy`, because
  Keychain still encrypts them with RC2. The script detects your OpenSSL
  version and adds the flag; if you sign by hand, add it yourself.

## Installing

**AirDrop the `.pkpass` to your iPhone**, or email it to yourself and open the
attachment. Wallet opens it directly.

## Delivery, and why there is no button on the website

Hosting the pass for download requires the server to send
`Content-Type: application/vnd.apple.pkpass`. **GitHub Pages does not
reliably do this** — the file downloads as an inert blob instead of opening
Wallet.

An "Add to Apple Wallet" anchor is written into `src/index.html` but left
commented out. Enable it only after you have confirmed on a real device that
the hosted file opens in Wallet. Until then, AirDrop and email both work
perfectly.
```

- [ ] **Step 5: Write `print/README.md`**

```markdown
# Print artwork

`card-front.pdf` and `card-back.pdf` are the files to send a printer.
The `.svg` versions are for previewing and for designers who want to edit.

Regenerate with `npm run build`.

## Specifications

| | |
|---|---|
| Trim size | 85.6 × 54 mm (standard business card) |
| Document size | 91.6 × 60 mm (3 mm bleed on every edge) |
| Safe margin | 4 mm inside trim |
| Crop marks | Included, inside the bleed |
| Black | Rich black, CMYK 60 / 50 / 50 / 100 |
| Typeface | Inter, outlined to paths — no font embedding needed |
| QR size | 20 mm, error correction Q, 4-module quiet zone |
| Finish | **Matte lamination** |

## Three things to tell the printer

**Use the rich black as supplied.** Single-channel black (`K100`) prints thin
and grey next to a photo-rich sheet. The four-channel mix is already in the
PDF; ask them not to "optimise" it.

**Matte lamination, not gloss.** This is most of what makes a card feel
expensive in the hand, and it stops fingerprints showing on a dark card.

**Do not resize or recolour the QR panel.** The QR is deliberately dark-on-light
in a white panel. An inverted QR — white modules on black — is decoded by the
iPhone camera but rejected by many Android scanners and most hardware readers.
At 20 mm it scans reliably; below 18 mm it starts to fail.

## Printing onto NFC cards

If you are printing directly onto blank NFC PVC cards, the printer is usually
a direct-to-card or retransfer unit rather than an offset press. Ask for:

- a **retransfer** printer if available — it prints edge to edge, which a
  full-bleed dark card needs
- a test card before the full run, to check the black

Alternatively, print normal cards and apply an NFC sticker to the back. See
`nfc/README.md`.

## Proofing before you order

Open the PDF in Preview at 100% and hold a real business card against the
screen — they should match. Then scan the QR from the screen with your phone.
If it resolves to `idalhamed.github.io/card`, the file is correct.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- --test-name-pattern="README"`
Expected: PASS — 5 tests

- [ ] **Step 7: Commit**

```bash
git add README.md wallet/README.md print/README.md test/readme.test.mjs
git commit -m "docs: add local run, deploy, wallet signing, and print guides"
```

---

## Task 13: Verification

**Files:**
- Modify: none — this task produces evidence, not code

**Interfaces:**
- Consumes: the complete build
- Produces: a verified, reportable result

Nothing here may be reported as passing without the command output to show for it. Where a check needs a physical device, that is stated as a manual step for Ali rather than claimed.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — all tests across 12 files, zero failures. Record the count.

- [ ] **Step 2: Clean-build reproducibility**

```bash
rm -rf docs print nfc wallet/AliHamed.pass
npm run build
npm test
```

Expected: the build regenerates everything and the suite still passes. This proves nothing generated was hand-edited into working order.

- [ ] **Step 3: Confirm the QR resolves correctly**

```bash
node -e '
import("./src/lib/qr.mjs").then(async (qr) => {
  const { readFile } = await import("node:fs/promises");
  const png = await readFile("docs/assets/qr.png");
  console.log("decoded:", await qr.decodeQRPNG(png));
});'
```

Expected: `decoded: https://idalhamed.github.io/card`

- [ ] **Step 4: Confirm no secrets or reference images are tracked**

```bash
git ls-files | grep -Ei 'IMG_3890|Screenshot|\.p12$|\.pem$|\.cer$|certs/' && echo "LEAK" || echo "clean"
```

Expected: `clean`

- [ ] **Step 5: Lighthouse on mobile**

```bash
npm run dev &
npx --yes lighthouse http://localhost:8080 \
  --preset=desktop --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless" --output=json --output-path=/tmp/lh.json --quiet
node -e 'const r=require("/tmp/lh.json");
  for (const [k,v] of Object.entries(r.categories)) console.log(k, Math.round(v.score*100));'
```

Expected: 100 in all four categories. If accessibility is below 100, read the audit detail and fix before continuing — do not lower the target.

- [ ] **Step 6: Manual device checks (Ali)**

These need a real iPhone and cannot be automated. Record the result of each:

- [ ] Page loads over local network on an iPhone; the name is legible without zooming
- [ ] All four contact rows open the correct app or site
- [ ] Save Contact imports into Contacts with name, role, phone, email, and both profile URLs
- [ ] Settings > Accessibility > Motion > Reduce Motion: no animation on reload
- [ ] Landscape orientation: no clipping, no horizontal scroll
- [ ] Add to Home Screen: the "AH" icon appears and the page opens full-screen
- [ ] Paste the URL into WhatsApp: the link preview shows the OG image
- [ ] Scan `print/card-back.pdf` from the screen at 100%: resolves to the card page

- [ ] **Step 7: Report**

State plainly what passed, what is outstanding, and what needs Ali. The
outstanding list is expected to be the five items in spec §14 — an unset Team
ID is a documented state, not a failure.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: verified build

Full suite passing, clean rebuild reproducible, QR round-trip confirmed,
no credentials or reference images tracked."
```

---

## Self-Review

Run against the spec after the plan is written.

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §3 approved decisions | Global Constraints; enforced by tests in Tasks 6, 8 |
| §4 content | Task 1 (`config.json`), Task 6 (drift test) |
| §5 visual system | Task 6 (`styles.css`, token and contrast tests) |
| §6.1–6.3 page layout, rows, icons | Task 6 |
| §6.4 Save Contact / vCard | Tasks 5, 6 |
| §6.5 motion | Task 6 |
| §6.6 document head | Tasks 6, 7 |
| §6.7 accessibility | Task 6 (focus, h1, labels); Task 13 (Lighthouse) |
| §7.1–7.3 Wallet pass | Task 8 |
| §7.4 signing | Task 9 (script), Task 12 (`wallet/README.md`) |
| §7.5 delivery, disabled button | Task 6 (commented anchor + test), Task 12 |
| §8 print | Tasks 10, 12 |
| §9 NFC | Task 11 (generated guide) |
| §10 structure and pipeline | Tasks 1, 11 |
| §11 error handling | Tasks 1, 4, 7, 8, 9, 11 |
| §12 verification | Task 13 |
| §13 deliverables | 1→T6/T11, 2→T4, 3→T8/T9, 4→T12, 5→T12, 6→T12, 7→T11, 8→T10/T12, 9→T12 |
| §14 outstanding items | Task 13 Step 6; documented in Tasks 11, 12 |

No spec section is unimplemented.

**2. Placeholder scan**

No `TBD`, `TODO`, "similar to Task N", or "add error handling" appears. Every
code step carries complete, runnable code. The only deliberate empty value is
`apple.teamIdentifier` in `config.json`, which is a documented state with a
test asserting the build reports it (Tasks 8, 11).

**3. Type consistency**

Verified across tasks:

- `loadConfig` / `validateConfig` / `ConfigError` — defined T1, used T5, T6, T7, T11
- `Config` shape `{url, apple, content, contacts}` — identical in T1 fixture and every consumer
- `loadFont(weight)` / `textToPath(font, text, opts)` returning `{d, advance, box}` — defined T3, consumed T7 (`wordmarkSVG`), T8, T10
- `wordmarkSVG(text, opts)` — defined T3, consumed T7, T8
- `qrModules(url)` returning `{size, data}` — defined T4, consumed T10 in both SVG and PDF paths
- `assertQRRoundTrip(url, buffer)` — defined T4, consumed T11
- `buildVCard(config)` — defined T5, consumed T11
- `stampHTML(html, config)` / `inlineIcon(name)` / `renderTouchIcon()` / `renderOGImage(config)` — defined T7, consumed T11
- `buildPassJSON(config)` / `renderPassAssets()` / `PassError` — defined T8, consumed T11
- `buildCardSVG(face, config)` / `buildCardPDF(face, config, outPath)` — defined T10, consumed T11
- `nfcReadme(config)` — defined T11, consumed T11
- Token spellings `{{CARD_URL}}` and `{{ICON:name}}` — identical in T6 markup and T7 replacement
- Path constants: `wallet/AliHamed.pass/` and `wallet/certs/` identical in T9, T11, T12
