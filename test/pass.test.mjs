import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { buildPassJSON, renderPassAssets, walletRoleCase, PassError } from '../src/lib/pass.mjs';
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
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0, count = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const bboxArea = width * height;
  // fillRatio: ink pixels / bbox area — a proxy for stroke weight. A bolder
  // font weight fills more of its own bounding box (thicker strokes, less
  // interior negative space) than a lighter one at the same size/tracking;
  // used by the strip's weight-guard tests below to catch a regression back
  // to a heavier weight without hardcoding a specific rendering pipeline.
  return { minX, maxX, minY, maxY, width, height, count, fillRatio: bboxArea > 0 ? count / bboxArea : 0 };
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

// PassKit has no per-field colour and no divider/rule primitive, so the AH
// logo, ALI HAMED, SOFTWARE ENGINEER (blue) and iOS DEVELOPER all now live
// baked into strip.png instead of as native fields (see pass.mjs's
// buildPassJSON and renderStripMaster doc-comments) — carrying them here
// too would duplicate content the client explicitly said not to duplicate.
test('carries no primaryFields/secondaryFields — the name and both role lines live in strip.png, not fields', () => {
  const p = buildPassJSON(validConfig());
  assert.equal(p.storeCard.primaryFields, undefined);
  assert.equal(p.storeCard.secondaryFields, undefined);
});

test('the tagline is the one remaining field, centered via the native textAlignment key', () => {
  const c = validConfig();
  const p = buildPassJSON(c);
  assert.equal(p.storeCard.auxiliaryFields.length, 1);
  const aux = p.storeCard.auxiliaryFields[0];
  assert.equal(aux.value, c.content.taglineWallet);
  assert.equal(aux.label, '', 'no label — iOS DEVELOPER now lives in strip.png');
  // textAlignment IS a real, documented PassKit field-dictionary key (unlike
  // per-field colour or a divider), so centring is achieved natively here
  // rather than faked in artwork.
  assert.equal(aux.textAlignment, 'PKTextAlignmentCenter');
});

// The client was explicit that moving this content into strip.png must not
// duplicate it — so none of it may also appear as field text anywhere in
// storeCard (backFields legitimately mention other things, but never these
// exact strings).
test('the name and both role lines are not duplicated in any field', () => {
  const c = validConfig();
  const p = buildPassJSON(c);
  const fieldsJSON = JSON.stringify(p.storeCard);
  assert.doesNotMatch(fieldsJSON, new RegExp(c.content.name));
  assert.doesNotMatch(fieldsJSON, new RegExp(c.content.roleSecondary));
  assert.doesNotMatch(fieldsJSON, new RegExp(walletRoleCase(c.content.role)));
});

// walletRoleCase is what renderStripMaster uses to derive iOS DEVELOPER's
// exact on-strip casing from config.content.role (authored as "iOS
// Developer") — this is a direct unit test of that pure transform, since
// its result now lives baked into strip.png pixels rather than in a field
// value that JSON assertions could read back.
test('walletRoleCase upper-cases every source casing while preserving "iOS"\'s lowercase i', () => {
  assert.equal(walletRoleCase('iOS Developer'), 'iOS DEVELOPER');
  assert.equal(walletRoleCase('ios developer'), 'iOS DEVELOPER');
  assert.equal(walletRoleCase('IOS DEVELOPER'), 'iOS DEVELOPER');
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

// The bug this guards: the strip was generated at 375x123 (Apple's "other
// pass styles" size) for a storeCard, whose documented slot is 375x144.
// Apple scales artwork to FILL the slot preserving aspect, then crops the
// overflow — so the mismatch magnified everything ~17% and cut 32pt off
// each side on-device, invisibly. Anything but an exact aspect match means
// iOS transforms the artwork before the user ever sees it.
test('the strip aspect matches storeCard\'s documented slot exactly, so iOS neither scales nor crops it', async () => {
  const assets = await renderPassAssets(validConfig());
  const SLOT_W = 375, SLOT_H = 144; // Wallet Developer Guide, store cards @1x
  for (const [name, s] of [['strip.png', 1], ['strip@2x.png', 2], ['strip@3x.png', 3]]) {
    const { width, height } = await sharp(assets.get(name)).metadata();
    assert.equal(width, SLOT_W * s, `${name} width must be the slot width at @${s}x`);
    assert.equal(height, SLOT_H * s, `${name} height must be the slot height at @${s}x`);
    // scale-to-fill factor; anything above 1 means iOS magnifies and crops.
    const fill = Math.max((SLOT_W * s) / width, (SLOT_H * s) / height);
    assert.equal(fill, 1, `${name} would be rescaled by x${fill} by Wallet`);
  }
});

test('renders all six required assets at exact sizes', async () => {
  const assets = await renderPassAssets(validConfig());
  // No logo.png: the client asked for the Apple mark and the "Business Card"
  // title to be removed entirely. logo.png is optional in PassKit (only
  // icon.png is required), so the slot is left empty rather than substituted.
  const expected = {
    'icon.png': [29, 29], 'icon@2x.png': [58, 58], 'icon@3x.png': [87, 87],
    // storeCard's documented strip slot is 375x144 at 1x — NOT the 375x123
    // that Apple lists for "other pass styles". See STRIP_H in
    // src/lib/pass.mjs: at 123 iOS scaled the artwork x1.1707 to fill the
    // 144pt slot and cropped 32pt off each side on the real device.
    'strip.png': [375, 144], 'strip@2x.png': [750, 288], 'strip@3x.png': [1125, 432],
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

// Unlike icon.png (fixed AH-logo artwork only, see the test above), strip.png
// now bakes in the name and both role lines too — see renderStripMaster's
// doc-comment — so, unlike an earlier revision, it MUST vary with
// config.content. A strip that stayed byte-identical across names would
// mean the text wasn't actually being rendered into the artwork at all.
test('strip.png bakes in the name/role text, so it varies with config.content', async () => {
  const ali = validConfig();
  const jane = validConfig();
  jane.content.name = 'Jane Doe';

  const [aliAssets, janeAssets] = await Promise.all([
    renderPassAssets(ali),
    renderPassAssets(jane),
  ]);

  assert.ok(
    !aliAssets.get('strip.png').equals(janeAssets.get('strip.png')),
    'strip.png must change when the name changes — it now carries the name as baked-in text'
  );
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
  // A centre crop that comfortably contains the whole logo mark (composited
  // in the strip's top band, roughly y=18..210 of 432 at @3x — see
  // renderStripMaster's STRIP_PAD_TOP/STRIP_LOGO_H) and stays inside
  // circuitSVG's own contentClearX exclusion zone, so no stray trace pixel
  // can appear in it. Capped at 50% of the strip's height so it stops well
  // short of SOFTWARE ENGINEER (which starts around y=300 of 432) — that
  // line is baked in the same bright blue as the logo, so a taller crop
  // would corrupt this ink-aspect measurement with unrelated text ink.
  const cropW = Math.round(width * 0.4);
  const cropH = Math.round(height * 0.5);
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

// ---- Client requirements (2) and (3): blue SOFTWARE ENGINEER and the
// divider, both baked into strip.png since PassKit fields support neither
// per-field colour nor a divider primitive (see buildPassJSON's and
// renderStripMaster's doc-comments in src/lib/pass.mjs).

test('SOFTWARE ENGINEER is baked into the strip in the requested accent blue (#00B7FF), not white', async () => {
  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  // Row band matching renderStripMaster's SOFTWARE ENGINEER placement (below
  // ALI HAMED, above iOS DEVELOPER) — generous margin either side so this
  // stays robust to small layout-constant tweaks.
  const rowTop = Math.round(height * 0.70);
  const rowHeight = Math.round(height * 0.07);
  const rowBuffer = await strip
    .extract({ left: 0, top: rowTop, width, height: rowHeight })
    .png().toBuffer();

  const blueInk = await inkBBox(rowBuffer, isCompositedLogoInk);
  assert.ok(blueInk.width > 0 && blueInk.height > 0, 'expected blue SOFTWARE ENGINEER ink in this row');

  // And NOT rendered in the pass-wide foregroundColor (near-white) — proves
  // this line was deliberately recoloured, not just carried over as-is.
  const isWhiteInk = (r, g, b) => r > 200 && g > 200 && b > 200;
  const whiteInk = await inkBBox(rowBuffer, isWhiteInk);
  assert.ok(whiteInk.width <= 0, 'SOFTWARE ENGINEER must not also render in white in this row');
});

test('a small centered blue divider is baked directly beneath iOS DEVELOPER', async () => {
  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  // Row band matching renderStripMaster's divider placement: directly below
  // iOS DEVELOPER, near the strip's bottom edge. Cropped to the central 60%
  // of the strip's width, not the full width — circuit.mjs draws its own
  // lit traces/nodes in this exact accent blue out near the strip's edges
  // (contentClearX only protects a centre column, not the whole row), so a
  // full-width scan would pick up unrelated circuit ink alongside the
  // divider. The divider's own content column is comfortably inside 60%.
  const rowTop = Math.round(height * 0.90);
  const rowHeight = Math.round(height * 0.075);
  const colLeft = Math.round(width * 0.2);
  const colWidth = Math.round(width * 0.6);
  const rowBuffer = await strip
    .extract({ left: colLeft, top: rowTop, width: colWidth, height: rowHeight })
    .png().toBuffer();

  const ink = await inkBBox(rowBuffer, isCompositedLogoInk);
  assert.ok(ink.width > 0 && ink.height > 0, 'expected a blue divider in this row');
  // "small": clearly narrower than the strip, not a full-width rule.
  assert.ok(ink.width < width * 0.3, `divider width ${ink.width} should be small relative to strip width ${width}`);
  // Centered horizontally: its ink midpoint (translated back to full-strip
  // coordinates) sits close to the strip's own midpoint.
  const dividerCenterX = colLeft + (ink.minX + ink.maxX) / 2;
  assert.ok(
    Math.abs(dividerCenterX - width / 2) < width * 0.03,
    `divider centre ${dividerCenterX} should be within 3% of the strip's midpoint ${width / 2}`
  );
});

// Client requirement (1): all pass content centered. The tagline field's
// textAlignment is covered above; this covers the strip's own baked-in
// content, which has no native alignment property to assert on — only
// pixels.
test('ALI HAMED is centered horizontally in the strip', async () => {
  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  // Row band matching renderStripMaster's ALI HAMED placement.
  const rowTop = Math.round(height * 0.47);
  const rowHeight = Math.round(height * 0.22);
  const rowBuffer = await strip
    .extract({ left: 0, top: rowTop, width, height: rowHeight })
    .png().toBuffer();

  const isWhiteInk = (r, g, b) => r > 200 && g > 200 && b > 200;
  const nameInk = await inkBBox(rowBuffer, isWhiteInk);
  assert.ok(nameInk.width > 0 && nameInk.height > 0, 'expected white ALI HAMED ink in this row');
  const nameCenterX = (nameInk.minX + nameInk.maxX) / 2;
  assert.ok(
    Math.abs(nameCenterX - width / 2) < width * 0.03,
    `ALI HAMED centre ${nameCenterX} should be within 3% of the strip's midpoint ${width / 2}`
  );
});

// ---- Refinement pass: ALI HAMED / SOFTWARE ENGINEER read as light and
// wide-tracked, matching preview/Ali-Hamed-Apple-Wallet-Pass-Updated.png,
// not the blunt/generic semibold banner look the previous pass produced.
// vendor/fonts/ now ships Inter-Light alongside Regular and SemiBold (see
// scripts/fetch-assets.mjs and src/lib/text-path.mjs's FONTS map), and both
// lines render at the actual 'light' weight — not 'regular' standing in for
// it. These guards catch a regression back to a heavier weight via measured
// stroke weight (fillRatio: ink pixels / the text's own bounding-box area —
// a bolder weight has thicker strokes and less interior negative space, so
// it fills more of its own bbox at the same size/tracking). Thresholds are
// set from the actual light/regular/semibold values measured through this
// exact pipeline: ALI HAMED reads ~0.161 (light) vs ~0.214 (regular) vs
// ~0.305 (semibold); SOFTWARE ENGINEER reads ~0.174 (light) vs ~0.246
// (regular) vs ~0.325 (semibold) — each threshold sits at the light/regular
// midpoint, so it catches a silent fallback to 'regular' (which would look
// like success on every other test — same API, same glyphs, no thrown
// error), not just a regression all the way back to 'semibold'. See also
// test/text-path.test.mjs's direct proof that 'light' is a genuinely
// distinct, separately-rasterised font, not an alias of 'regular'.

test('ALI HAMED renders in a light weight (fillRatio below the light/regular midpoint), not a silent fallback to regular or semibold', async () => {
  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  // Same band as "ALI HAMED is centered horizontally in the strip" above,
  // narrowed to a centred column so no stray circuit ink near the strip's
  // edges can pollute the fillRatio measurement.
  const rowTop = Math.round(height * 0.47);
  const rowHeight = Math.round(height * 0.22);
  const colLeft = Math.round(width * 0.25);
  const colWidth = Math.round(width * 0.5);
  const rowBuffer = await strip
    .extract({ left: colLeft, top: rowTop, width: colWidth, height: rowHeight })
    .png().toBuffer();

  const isWhiteInk = (r, g, b, a) => a > 40 && r > 200 && g > 200 && b > 200;
  const nameInk = await inkBBox(rowBuffer, isWhiteInk);
  assert.ok(nameInk.width > 0 && nameInk.height > 0, 'expected white ALI HAMED ink in this row');
  assert.ok(
    nameInk.fillRatio < 0.19,
    `ALI HAMED fillRatio ${nameInk.fillRatio.toFixed(3)} reads too heavy for the light weight ` +
    '(light measures ~0.161, regular ~0.214, semibold ~0.305 through this same pipeline)'
  );
});

test('SOFTWARE ENGINEER renders in a light weight, quieter than the name — not a silent fallback to regular or semibold', async () => {
  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  // Same band as "SOFTWARE ENGINEER is baked into the strip..." above,
  // narrowed to a centred column for the same reason as the name test.
  const rowTop = Math.round(height * 0.68);
  const rowHeight = Math.round(height * 0.11);
  const colLeft = Math.round(width * 0.25);
  const colWidth = Math.round(width * 0.5);
  const rowBuffer = await strip
    .extract({ left: colLeft, top: rowTop, width: colWidth, height: rowHeight })
    .png().toBuffer();

  const role2Ink = await inkBBox(rowBuffer, isCompositedLogoInk);
  assert.ok(role2Ink.width > 0 && role2Ink.height > 0, 'expected blue SOFTWARE ENGINEER ink in this row');
  assert.ok(
    role2Ink.fillRatio < 0.21,
    `SOFTWARE ENGINEER fillRatio ${role2Ink.fillRatio.toFixed(3)} reads too heavy for the light weight ` +
    '(light measures ~0.174, regular ~0.246, semibold ~0.325 through this same pipeline)'
  );
});

// ---- Refinement pass: the circuit's unlit traces recede (dark, quiet)
// rather than reading as light-grey noise competing with the type — see
// STRIP_TRACE_BASE_COLOR/STRIP_TRACE_BASE_OPACITY in src/lib/pass.mjs.
test('unlit circuit traces are dark and recede, not a light grey that competes with the type', async () => {
  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  // A corner comfortably inside the circuit field but clear of the centred
  // identity block and (per circuit.mjs's own accentColor draws) mostly
  // unlit trace, not blue.
  const cropBuffer = await strip
    .extract({ left: 0, top: 0, width: Math.round(width * 0.22), height: Math.round(height * 0.4) })
    .raw().toBuffer({ resolveWithObject: true });
  const { data, info } = cropBuffer;
  let unlitCount = 0, unlitSum = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // Unlit trace grey: r≈g≈b (low colour saturation), distinctly above pure
    // black but not the bright accent blue (b >> r for lit traces/nodes).
    const isGreyish = Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && Math.abs(r - b) < 12;
    const isNotBlack = r > 4 || g > 4 || b > 4;
    if (isGreyish && isNotBlack) {
      unlitCount++;
      unlitSum += (r + g + b) / 3;
    }
  }
  assert.ok(unlitCount > 0, 'expected some unlit grey circuit-trace ink in this corner crop');
  const avgLuminance = unlitSum / unlitCount;
  // circuit.mjs's page-tuned default (#4B5563 at opacity 0.7 over black)
  // averages well above 60; the strip's darker/quieter override
  // (#2A3038 at opacity 0.4) should read distinctly lower.
  assert.ok(
    avgLuminance < 45,
    `unlit circuit trace average luminance ${avgLuminance.toFixed(1)} is too bright to read as ` +
    'receding — expected a dark, quiet grey (see STRIP_TRACE_BASE_COLOR/STRIP_TRACE_BASE_OPACITY)'
  );
});

// ---- Refinement pass: wider tracking on ALI HAMED must not silently clip.
// Widening STRIP_NAME_TRACKING_RATIO increases the name's measured advance;
// the strip's existing height guard (see the PassError test above the
// overflow comment in renderStripMaster) only checks the vertical axis, so
// this proves the width axis is guarded too, and that the guard actually
// fires rather than letting composite() silently clip a too-wide name.
test('a sufficiently long name overflows the strip width and throws PassError rather than silently clipping', async () => {
  const c = validConfig();
  c.content.name = 'ALEXANDER MAXIMILIAN HAMED-THE-THIRD-OF-RIYADH';
  await assert.rejects(() => renderPassAssets(c), PassError);
  await assert.rejects(() => renderPassAssets(c), /overflows the fixed strip width/);
});

// ---- Refinement pass: the reference's own name width, at production
// tracking/weight, must still comfortably fit — this is the "did not
// overreach" counterpart to the overflow test above.
test('ALI HAMED at the actual production weight/tracking fits well inside the strip width, with no clipping', async () => {
  const assets = await renderPassAssets(validConfig());
  const strip = sharp(assets.get('strip@3x.png'));
  const { width, height } = await strip.metadata();
  const rowTop = Math.round(height * 0.47);
  const rowHeight = Math.round(height * 0.22);
  const rowBuffer = await strip
    .extract({ left: 0, top: rowTop, width, height: rowHeight })
    .png().toBuffer();
  const isWhiteInk = (r, g, b, a) => a > 40 && r > 200 && g > 200 && b > 200;
  const nameInk = await inkBBox(rowBuffer, isWhiteInk);
  assert.ok(nameInk.width > 0, 'expected white ALI HAMED ink in this row');
  assert.ok(nameInk.minX > 0 && nameInk.maxX < width, 'ALI HAMED ink must not touch the strip edges (clipped)');
  assert.ok(nameInk.width < width * 0.85, `ALI HAMED width ${nameInk.width} should sit well inside the ${width}pt strip`);
});
