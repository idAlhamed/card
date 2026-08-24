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
