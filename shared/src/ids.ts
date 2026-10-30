const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short random ID (lowercase letters and digits). 8 characters keep Windows paths short. */
export function shortId(length = 8): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** Turns a name or route into a readable ID: "/requests/:id" -> "requests-id". */
export function slugify(text: string, fallback = 'item'): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || fallback;
}
