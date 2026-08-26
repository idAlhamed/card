import { readFile } from 'node:fs/promises';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const REQUIRED_CONTENT = [
  'name', 'fullName', 'role', 'roleSecondary', 'technologies', 'message', 'cta', 'footer',
  'taglineWallet', 'taglinePage', 'taglineCardFront',
];
const REQUIRED_CONTACTS = ['linkedin', 'github', 'whatsapp', 'phone', 'phoneDisplay', 'email', 'location'];
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

  const expertise = raw?.content?.expertise;
  if (!Array.isArray(expertise) || expertise.length !== 9) {
    throw new ConfigError(
      `config.content.expertise must be an array of exactly 9 entries, got ${
        Array.isArray(expertise) ? expertise.length : typeof expertise
      }`
    );
  }
  expertise.forEach((entry, i) => {
    if (typeof entry?.icon !== 'string' || entry.icon.length === 0) {
      throw new ConfigError(`config.content.expertise[${i}].icon is missing or empty`);
    }
    if (typeof entry?.label !== 'string' || entry.label.length === 0) {
      throw new ConfigError(`config.content.expertise[${i}].label is missing or empty`);
    }
  });

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
