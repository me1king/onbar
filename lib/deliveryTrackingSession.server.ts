import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;

function getSecret() {
  return process.env.RIDER_SESSION_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`onlinebar:delivery-tracking:${payload}`).digest('hex');
}

export function createDeliveryTrackingSession(orderId: number) {
  const secret = getSecret();
  if (!secret) throw new Error('A server-side tracking signing secret is not configured.');
  const payload = Buffer.from(JSON.stringify({
    orderId,
    expiresAt: Date.now() + SESSION_LIFETIME_MS
  })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyDeliveryTrackingSession(token: string | null | undefined) {
  const secret = getSecret();
  if (!secret || !token) return null;
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) return null;

  const expectedBytes = Buffer.from(signature(payload, secret), 'hex');
  const suppliedBytes = Buffer.from(suppliedSignature, 'hex');
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) return null;
    const session = decoded as { orderId?: unknown; expiresAt?: unknown };
    if (
      !Number.isSafeInteger(session.orderId)
      || Number(session.orderId) <= 0
      || typeof session.expiresAt !== 'number'
      || session.expiresAt <= Date.now()
    ) return null;
    return { orderId: Number(session.orderId), expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}
