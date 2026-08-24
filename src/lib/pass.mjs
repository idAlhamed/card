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
//
// letterSpacing is 0.08em, not the 0.14em used for the web-page wordmark
// (design spec §5.3 fixes 0.14em there specifically). The logo slot is
// 160x50pt and "ALI HAMED" is ~9:1, so the fit here is width-constrained:
// it fills the full width and uses only ~17pt of the 50pt height. Under a
// width-constrained fit, tighter tracking renders the glyphs larger at
// equal cap height, which matters because this strip is the only part of
// a pass visible when passes are stacked in Wallet. Spec §7.3 asks only
// for a "fine-tracked wordmark" on the pass, which 0.08em satisfies.
async function renderLogo(text, width, height) {
  const mark = await wordmarkSVG(text, {
    fontSize: RENDER_SIZE, letterSpacing: RENDER_SIZE * 0.08, fill: '#F5F5F7',
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
