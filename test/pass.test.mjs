import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { buildPassJSON, renderPassAssets, PassError } from '../src/lib/pass.mjs';
import { LOGO_RASTERS } from '../src/lib/logo.mjs';
import { validConfig } from './fixtures.mjs';

/**
 * Bounding box of "ink" pixels in a PNG buffer, via a full raw scan.
 * `isInk(r,g,b,a)` decides what counts — the source raster has a real
 * transparent background (alpha-based works there), but the composited
 * strip is painted onto a fully OPAQUE black canvas (every pixel has
 * alpha 255), so isolating the logo there instead means matching its
 * bright blue fill colour against the black/grey background and circuit
 * traces.
 */
async function inkBBox(buffer, isInk) {
  const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

const isTransparentSourceInk = (_r, _g, _b, a) => a > 40;
// Logo fill is #0087FF (a bright, saturated blue); circuit traces are a
// mid-dark grey (#4B5563, blue channel ~99) or the dimmer accent blue used
// for lit traces/nodes. This threshold catches the logo's fill while
// staying well clear of both.
const isCompositedLogoInk = (r, _g, b, _a) => b > 200 && r < 60;

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

test('the barcode carries no altText, so Wallet does not show the URL as visible text', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.barcodes[0].altText, undefined);
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

test('is a storeCard, not a generic pass — generic supports no strip image', () => {
  const p = buildPassJSON(validConfig());
  assert.ok(p.storeCard, 'must carry a storeCard style block');
  assert.equal(p.generic, undefined, 'must not also carry a generic style block');
});

test('the primary field is the name, overlaid on the strip', () => {
  const c = validConfig();
  const p = buildPassJSON(c);
  assert.equal(p.storeCard.primaryFields.length, 1);
  assert.equal(p.storeCard.primaryFields[0].value, c.content.name);
});

// Wallet renders a field LABEL small and grey above its VALUE. The approved
// reference makes SOFTWARE ENGINEER the prominent line and iOS DEVELOPER the
// secondary one, so SOFTWARE ENGINEER must be a VALUE. Carrying it as a label
// (as an earlier revision did) inverted that hierarchy.
test('SOFTWARE ENGINEER is a field VALUE, so it is not demoted to label weight', () => {
  const c = validConfig();
  const p = buildPassJSON(c);
  const field = p.storeCard.secondaryFields[0];
  assert.equal(field.value, c.content.roleSecondary);
  assert.equal(field.label, '', 'it must not ride as a label');
});

test('iOS DEVELOPER is the label above the tagline, preserving the reference order', () => {
  const c = validConfig();
  const p = buildPassJSON(c);
  const aux = p.storeCard.auxiliaryFields[0];
  // Upper-cased, but the "iOS" brand casing is preserved so the pass and the
  // page read identically.
  assert.equal(aux.label, 'iOS DEVELOPER');
});

test('the role label upper-cases every source casing the same way', () => {
  const c = validConfig();
  c.content.role = 'ios developer';
  const p = buildPassJSON(c);
  assert.equal(p.storeCard.auxiliaryFields[0].label, 'iOS DEVELOPER');
});

test('the tagline is its own auxiliary field', () => {
  const c = validConfig();
  const p = buildPassJSON(c);
  assert.equal(p.storeCard.auxiliaryFields.length, 1);
  assert.equal(p.storeCard.auxiliaryFields[0].value, c.content.taglineWallet);
});

test('all four contacts are tappable on the back', () => {
  const back = buildPassJSON(validConfig()).storeCard.backFields;
  for (const key of ['linkedin', 'github', 'whatsapp', 'email']) {
    const field = back.find((f) => f.key === key);
    assert.ok(field, `missing back field ${key}`);
    assert.match(field.attributedValue, /^<a href="/);
    assert.ok(field.value, 'a plain value must exist as fallback');
  }
});

test('every back field from the previous design is preserved (7 fields, same keys)', () => {
  const back = buildPassJSON(validConfig()).storeCard.backFields;
  assert.deepEqual(
    back.map((f) => f.key),
    ['message', 'cta', 'card', 'linkedin', 'github', 'whatsapp', 'email']
  );
});

test('omits the update web service', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.webServiceURL, undefined);
  assert.equal(p.authenticationToken, undefined);
});

test('no Apple mark or reference anywhere in the pass', () => {
  assert.doesNotMatch(JSON.stringify(buildPassJSON(validConfig())), /apple/i);
});

test('passTypeIdentifier and teamIdentifier are read from config, never hardcoded', () => {
  const c = validConfig();
  c.apple.passTypeIdentifier = 'pass.com.example.other';
  c.apple.teamIdentifier = 'ZZZZZ99999';
  const p = buildPassJSON(c);
  assert.equal(p.passTypeIdentifier, 'pass.com.example.other');
  assert.equal(p.teamIdentifier, 'ZZZZZ99999');
});

test('escapes " and & in back-field href/text so the anchor cannot break out', () => {
  const c = validConfig();
  // A real-world value: '&' is a common query separator, '"' is the one
  // character that can terminate the href attribute early.
  c.contacts.email = 'ali"o&reilly@example.com';
  const p = buildPassJSON(c);
  const field = p.storeCard.backFields.find((f) => f.key === 'email');

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

test('the LinkedIn and GitHub back-field labels are derived from config, not hardcoded', () => {
  const c = validConfig();
  c.contacts.linkedin = 'https://www.linkedin.com/in/someoneelse/';
  c.contacts.github = 'https://github.com/SomeoneElse';
  const back = buildPassJSON(c).storeCard.backFields;

  const linkedin = back.find((f) => f.key === 'linkedin');
  const github = back.find((f) => f.key === 'github');

  // The visible label must track the href it navigates to, or a config edit
  // yields a pass that displays one identity and navigates to another.
  assert.match(linkedin.attributedValue, /^<a href="[^"]*">linkedin\.com\/in\/someoneelse<\/a>$/);
  assert.match(github.attributedValue, /^<a href="[^"]*">github\.com\/SomeoneElse<\/a>$/);
  assert.doesNotMatch(linkedin.attributedValue, /idalhamed/i);
  assert.doesNotMatch(github.attributedValue, /idAlhamed/);
});

test('renders all six required assets at exact sizes', async () => {
  const assets = await renderPassAssets(validConfig());
  // No logo.png: the client asked for the Apple mark and the "Business Card"
  // title to be removed entirely. logo.png is optional in PassKit (only
  // icon.png is required), so the slot is left empty rather than substituted.
  const expected = {
    'icon.png': [29, 29], 'icon@2x.png': [58, 58], 'icon@3x.png': [87, 87],
    'strip.png': [375, 123], 'strip@2x.png': [750, 246], 'strip@3x.png': [1125, 369],
  };
  assert.deepEqual([...assets.keys()].sort(), Object.keys(expected).sort());
  for (const [name, [w, h]] of Object.entries(expected)) {
    const meta = await sharp(assets.get(name)).metadata();
    assert.equal(meta.width, w, `${name} width`);
    assert.equal(meta.height, h, `${name} height`);
    assert.equal(meta.format, 'png');
  }
});

test('icon.png is the supplied AH logo artwork, fixed regardless of config.content.name', async () => {
  // A generated text monogram was rejected by the client; icon.png must now
  // be the same fixed supplied artwork as strip.png, not something that
  // silently redraws itself per name (the old text-monogram behaviour).
  const ali = validConfig();
  const jane = validConfig();
  jane.content.name = 'Jane Doe';

  const [aliAssets, janeAssets] = await Promise.all([
    renderPassAssets(ali),
    renderPassAssets(jane),
  ]);

  for (const name of ['icon.png', 'icon@2x.png', 'icon@3x.png']) {
    assert.ok(
      aliAssets.get(name).equals(janeAssets.get(name)),
      `${name} is fixed AH-logo artwork and must not vary with config.content.name`
    );
  }
});

// The client asked for the Apple mark and the "Business Card" title to be
// removed from the pass entirely, with the supplied AH logo as the only
// identity mark. Both lived exclusively in logo.png, so no logo asset may
// come back — and nothing decorative may be substituted for it.
test('the pass emits no logo asset at all', async () => {
  const assets = await renderPassAssets(validConfig());
  for (const name of ['logo.png', 'logo@2x.png', 'logo@3x.png']) {
    assert.equal(assets.get(name), undefined, `${name} must not be emitted`);
  }
});

test('pass.json carries no logoText', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.logoText, undefined, 'no substitute title may appear');
});

test('strip.png is fixed artwork (circuit + AH logo), unaffected by the name', async () => {
  const ali = validConfig();
  const jane = validConfig();
  jane.content.name = 'Jane Doe';

  const [aliAssets, janeAssets] = await Promise.all([
    renderPassAssets(ali),
    renderPassAssets(jane),
  ]);

  assert.ok(aliAssets.get('strip.png').equals(janeAssets.get('strip.png')));
});

test('the strip@3x master composites the logo without distorting it', async () => {
  // The supplied 1200x800 canvas has generous internal padding, so the
  // visible "AH" glyph's own ink is NOT itself a 3:2 (1200:800) shape —
  // measured directly off the pristine source raster, its ink bounding box
  // is close to 0.945:1. The real distortion guard is therefore: does the
  // composited copy's ink aspect still match the SOURCE's ink aspect? A fit
  // that stretched the logo during compositing would shift this ratio;
  // preserving it is what "no distortion" actually means here.
  const sourceInk = await inkBBox(await readFile(LOGO_RASTERS[1200]), isTransparentSourceInk);
  const sourceAspect = sourceInk.width / sourceInk.height;

  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  // A generous centre crop that comfortably contains the whole logo mark
  // (composited within the top ~72% of strip height, centred horizontally)
  // and stays inside circuitSVG's own contentClearX exclusion zone, so no
  // stray trace pixel can appear in it.
  const cropW = Math.round(width * 0.4);
  const cropH = Math.round(height * 0.75);
  const cropBuffer = await strip
    .extract({ left: Math.round((width - cropW) / 2), top: 0, width: cropW, height: cropH })
    .png().toBuffer();
  const cropInk = await inkBBox(cropBuffer, isCompositedLogoInk);
  assert.ok(cropInk.width > 0 && cropInk.height > 0, 'no logo ink found in the expected region');
  const cropAspect = cropInk.width / cropInk.height;

  assert.ok(
    Math.abs(cropAspect - sourceAspect) / sourceAspect < 0.03,
    `composited logo ink aspect ${cropAspect.toFixed(3)} strayed more than 3% ` +
    `from the supplied artwork's own ink aspect ${sourceAspect.toFixed(3)} — a resize distorted it`
  );
});

// ---- top contour (client-requested curved/cut notch) ---------------------
// PassKit exposes no pass-shape key, so the notch has to be carved into
// strip.png itself with real alpha: transparent above the cut, so the
// pass's own backgroundColor shows through. These tests guard that the
// alpha channel actually varies (not just present-but-uniformly-opaque, as
// it was before), that the cut sits where the reference's cut sits (top
// edge, horizontally centred), and that it scales identically — not three
// differently-shaped cuts — across all three densities.

/** Bounding box of fully-transparent (alpha === 0) pixels in a PNG buffer. */
async function transparentBBox(buffer) {
  const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * info.channels + 3];
      if (a === 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

test('strip.png carries a real alpha channel — the notch is an actual transparent cutout, not just an unused channel', async () => {
  const assets = await renderPassAssets(validConfig());
  for (const name of ['strip.png', 'strip@2x.png', 'strip@3x.png']) {
    const meta = await sharp(assets.get(name)).metadata();
    assert.equal(meta.hasAlpha, true, `${name} must carry an alpha channel`);
    const hole = await transparentBBox(assets.get(name));
    assert.ok(hole.width > 0 && hole.height > 0, `${name} has no fully-transparent pixels — the cutout is missing`);
  }
});

test('the notch sits at the very top edge, horizontally centred, matching the reference\'s cut', async () => {
  const assets = await renderPassAssets(validConfig());
  const meta = await sharp(assets.get('strip.png')).metadata();
  const hole = await transparentBBox(assets.get('strip.png'));

  assert.equal(hole.minY, 0, 'the cut must start at the strip\'s own top row, the first pixel a user sees');
  // Reserved bottom-clear band (STRIP_BOTTOM_CLEAR) starts at 72% of strip
  // height; the notch must stay well clear of it and of the AH logo.
  assert.ok(hole.maxY < meta.height * 0.4, 'the notch reaches too far down the strip');

  const holeCenterX = (hole.minX + hole.maxX) / 2;
  assert.ok(
    Math.abs(holeCenterX - meta.width / 2) < 2,
    `notch centre x=${holeCenterX} strayed from the strip's own centre x=${meta.width / 2}`
  );
});

test('the notch scales identically — same shape, not three different curves — across @1x/@2x/@3x', async () => {
  const assets = await renderPassAssets(validConfig());
  const sizes = { 'strip.png': 1, 'strip@2x.png': 2, 'strip@3x.png': 3 };
  const ratios = {};
  for (const [name, scale] of Object.entries(sizes)) {
    const meta = await sharp(assets.get(name)).metadata();
    const hole = await transparentBBox(assets.get(name));
    ratios[name] = {
      widthRatio: hole.width / meta.width,
      depthRatio: hole.maxY / meta.height, // maxY (0-based) doubles as the pixel depth of the cut
      scale,
    };
  }
  const [{ widthRatio: w1, depthRatio: d1 }, { widthRatio: w2, depthRatio: d2 }, { widthRatio: w3, depthRatio: d3 }] =
    Object.values(ratios);

  for (const [a, b] of [[w1, w2], [w2, w3], [w1, w3]]) {
    assert.ok(Math.abs(a - b) < 0.01, `notch width ratio drifted across densities: ${a} vs ${b}`);
  }
  for (const [a, b] of [[d1, d2], [d2, d3], [d1, d3]]) {
    assert.ok(Math.abs(a - b) < 0.02, `notch depth ratio drifted across densities: ${a} vs ${b}`);
  }
});

test('a rim-light stroke traces the cut, so it reads as a notch rather than an invisible hole against identical black', async () => {
  // backgroundColor and the strip's own fill are both pure black — a bare
  // alpha hole alone would be invisible on a real device. The stroke is
  // what actually sells the cut, so assert it exists: a partially-lit,
  // partially-transparent pixel (not fully opaque black, not fully
  // transparent) directly under the notch's apex.
  const assets = await renderPassAssets(validConfig());
  const strip3x = assets.get('strip@3x.png');
  const { data, info } = await sharp(strip3x).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const hole = await transparentBBox(strip3x);
  const apexX = Math.round((hole.minX + hole.maxX) / 2);
  const apexY = hole.maxY; // deepest row of the cut, where the stroke sits right at the boundary

  let foundRimPixel = false;
  for (let y = Math.max(0, apexY - 2); y <= apexY + 2; y++) {
    const i = (y * info.width + apexX) * info.channels;
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a > 0 && r > 40 && g > 40 && b > 40) foundRimPixel = true;
  }
  assert.ok(foundRimPixel, 'no lit rim-stroke pixel found tracing the notch apex');
});

test('pass.json suppresses the default strip shine, so it cannot fight the hand-drawn notch and rim stroke', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.suppressStripShine, true);
});
