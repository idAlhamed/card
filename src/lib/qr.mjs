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
