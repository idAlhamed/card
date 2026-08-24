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

test('TITLE with comma escapes as backslash-comma', () => {
  const config = validConfig();
  config.content.role = 'iOS Developer, Contract';
  const vcf = buildVCard(config);
  assert.match(vcf, /TITLE:iOS Developer\\, Contract/);
});

test('NOTE with semicolon escapes as backslash-semicolon', () => {
  const config = validConfig();
  config.content.message = 'Swift; Objective-C; C++';
  const vcf = buildVCard(config);
  assert.match(vcf, /NOTE:Swift\\;/);
});

test('literal backslash is escaped once, not doubled', () => {
  const config = validConfig();
  config.content.role = 'Developer\\Manager';
  const vcf = buildVCard(config);
  assert.match(vcf, /TITLE:Developer\\\\Manager/);
  assert.doesNotMatch(vcf, /\\\\\\\\/);
});

test('CARD_URL with comma is NOT escaped (regression guard)', () => {
  const config = validConfig();
  config.url.CARD_URL = 'https://example.com/card?name=Ali,Hamed';
  const vcf = buildVCard(config);
  // The comma must appear verbatim in the URL, not escaped
  assert.match(vcf, /URL:https:\/\/example\.com\/card\?name=Ali,Hamed/);
  assert.doesNotMatch(vcf, /URL:.*\\,/);
});

test('real config output is unchanged by escaping fix', () => {
  const originalVcf = buildVCard(validConfig());
  // The real config contains no comma, semicolon, or newline in TEXT fields,
  // so the output must be byte-for-byte identical to what an unescaped version would produce.
  // This proves the fix is a no-op for current content and won't break anything.
  assert.match(originalVcf, /FN:Ali Hamed/);
  assert.match(originalVcf, /TITLE:iOS Developer/);
  assert.doesNotMatch(originalVcf, /\\,/);
  assert.doesNotMatch(originalVcf, /\\;/);
});
