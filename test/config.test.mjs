import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, loadConfig, ConfigError } from '../src/lib/config.mjs';
import { validConfig } from './fixtures.mjs';

test('accepts a valid config', () => {
  const c = validConfig();
  assert.equal(validateConfig(c).url.CARD_URL, c.url.CARD_URL);
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
  const url = new URL(c.url.CARD_URL);          // throws if unparseable
  assert.equal(url.protocol, 'https:');
  assert.doesNotMatch(c.url.CARD_URL, /YOUR_|REPLACE_|EXAMPLE|CHANGEME/i);
  // Copy is genuinely fixed by the spec; the URL genuinely is not.
  assert.equal(c.content.technologies, 'Swift · SwiftUI · UIKit');
});
