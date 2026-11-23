import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const tokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tokenKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error('Drink of the Day links are not configured on the server.');
  return createHash('sha256').update('onlinebar:drink-of-the-day:v1\0').update(secret).digest();
}

export function createDrinkOfDayToken(userId: string, productId: string) {
  if (!userIdPattern.test(userId) || !/^[1-9]\d{0,17}$/.test(productId)) {
    throw new Error('A valid customer and drink are required to create this link.');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    userId,
    productId,
    expiresAt: Date.now() + tokenLifetimeMs
  }));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url')
  ].join('.');
}

export function verifyDrinkOfDayToken(token: string) {
  if (token.length > 2048) return null;
  const [encodedIv, encodedTag, encodedPayload, ...rest] = token.split('.');
  if (rest.length || !encodedIv || !encodedTag || !encodedPayload
    || !/^[A-Za-z0-9_-]+$/.test(encodedIv)
    || !/^[A-Za-z0-9_-]+$/.test(encodedTag)
    || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)) return null;

  try {
    const iv = Buffer.from(encodedIv, 'base64url');
    const tag = Buffer.from(encodedTag, 'base64url');
    const encrypted = Buffer.from(encodedPayload, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length > 1024) return null;
    const decipher = createDecipheriv('aes-256-gcm', tokenKey(), iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString('utf8')) as {
      version?: unknown;
      userId?: unknown;
      productId?: unknown;
      expiresAt?: unknown;
    };
    if (payload.version !== 1
      || typeof payload.userId !== 'string' || !userIdPattern.test(payload.userId)
      || typeof payload.productId !== 'string' || !/^[1-9]\d{0,17}$/.test(payload.productId)
      || typeof payload.expiresAt !== 'number' || !Number.isSafeInteger(payload.expiresAt)
      || payload.expiresAt <= Date.now()) return null;
    return { userId: payload.userId, productId: payload.productId };
  } catch {
    return null;
  }
}

export function getNairobiAge(birthDate: string | null) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const parsed = new Date(`${birthDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDate) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const todayKey = `${values.month}-${values.day}`;
  const birthdayKey = birthDate.slice(5);
  return Number(values.year) - Number(birthDate.slice(0, 4))
    - (todayKey < birthdayKey ? 1 : 0);
}
