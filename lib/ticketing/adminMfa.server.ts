import 'server-only';

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const periodSeconds = 30;

function encryptionKey() {
  const value = process.env.TICKETING_MFA_ENCRYPTION_KEY?.trim();
  if (!value || value.length < 32) throw new Error('TICKETING_MFA_ENCRYPTION_KEY must contain at least 32 characters.');
  return createHash('sha256').update(value).digest();
}

export function createTicketingTotpSecret() {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

export function encryptTicketingTotpSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptTicketingTotpSecret(value: string) {
  const [ivValue, tagValue, encryptedValue, extra] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue || extra) throw new Error('The stored authenticator secret is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function decodeBase32(secret: string) {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secret.toUpperCase().replace(/=+$/g, '').replace(/\s/g, '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('The authenticator secret is invalid.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, counter: number) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTicketingTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const currentCounter = Math.floor(now / 1000 / periodSeconds);
  const candidate = Buffer.from(code);
  for (const counter of [currentCounter - 1, currentCounter, currentCounter + 1]) {
    if (counter < 0) continue;
    const expected = Buffer.from(generateTotp(secret, counter));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return counter;
  }
  return null;
}

export function ticketingTotpProvisioningUri(email: string, secret: string) {
  const issuer = 'Midnight Society KE Ticketing';
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${periodSeconds}`;
}
