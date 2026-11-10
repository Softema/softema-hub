/**
 * Two-factor data of the fictional seed administrators. Local development and tests only.
 *
 * The TOTP secret is derived from SEED_USER_PASSWORD, so seed, tests and `pnpm totp` agree without another variable
 * in .env. Anyone who knows the seed password can compute the codes, which is fine for disposable fictional accounts
 * and would never be acceptable for a real one.
 */
import { createHash, createHmac } from 'node:crypto';

export const SEED_TOTP_ISSUER = 'Softema Hub';

/** 32 characters, the same length as the secrets Better-Auth generates. Used as UTF-8 bytes, like Better-Auth does. */
export const seedTotpSecret = (seedPassword: string) => createHash('sha256').update(`softema-hub-seed-totp:${seedPassword}`).digest('base64url').slice(0, 32);

/** RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s): the parameters Better-Auth uses by default. */
export function totp(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Uint8Array) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return bits > 0 ? out + B32[(value << (5 - bits)) & 31] : out;
}
/** What an authenticator app scans; the same format as Better-Auth's `totpURI`. */
export const otpauthUri = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(SEED_TOTP_ISSUER)}:${encodeURIComponent(account)}?secret=${base32(Buffer.from(secret, 'utf8'))}&issuer=${encodeURIComponent(SEED_TOTP_ISSUER)}&digits=6&period=30`;
