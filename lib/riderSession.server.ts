import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

function getSecret() {
  return process.env.RIDER_SESSION_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`onlinebar:rider-session:${payload}`).digest('hex');
}

export function createRiderSession(phone: string) {
  const secret = getSecret();
  if (!secret) throw new Error('RIDER_SESSION_SECRET and SUPABASE_SERVICE_ROLE_KEY are not configured.');
  const payload = Buffer.from(JSON.stringify({
    phone,
    expiresAt: Date.now() + SESSION_LIFETIME_MS
  })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyRiderSession(token: string | null | undefined) {
  const secret = getSecret();
  if (!secret || !token) return null;
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) return null;

  const expectedSignature = signature(payload, secret);
  const expectedBytes = Buffer.from(expectedSignature, 'hex');
  const suppliedBytes = Buffer.from(suppliedSignature, 'hex');
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) return null;
    const session = decoded as { phone?: unknown; expiresAt?: unknown };
    if (
      typeof session.phone !== 'string'
      || !session.phone
      || typeof session.expiresAt !== 'number'
      || session.expiresAt <= Date.now()
    ) return null;
    return { phone: session.phone, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}
