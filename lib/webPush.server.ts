import 'server-only';

import { createECDH, timingSafeEqual } from 'node:crypto';
import webPush, { type PushSubscription as WebPushSubscription } from 'web-push';

function decodeVapidKey(value: string) {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]+$/.test(normalized)) return null;
  const decoded = Buffer.from(normalized, 'base64');
  const canonical = decoded.toString('base64').replace(/=+$/, '');
  return canonical === normalized ? decoded : null;
}

function isValidVapidConfiguration(publicKey: string, privateKey: string, subject: string) {
  const publicBytes = decodeVapidKey(publicKey);
  const privateBytes = decodeVapidKey(privateKey);
  if (!publicBytes || publicBytes.length !== 65 || publicBytes[0] !== 4
    || !privateBytes || privateBytes.length !== 32) return false;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateBytes);
    const derivedPublicKey = ecdh.getPublicKey(undefined, 'uncompressed');
    if (!timingSafeEqual(derivedPublicKey, publicBytes)) return false;
    webPush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch {
    return false;
  }
}

export function isWebPushConfigured() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  return Boolean(publicKey && privateKey && subject
    && isValidVapidConfiguration(publicKey, privateKey, subject));
}

export function getWebPushPublicKey() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return publicKey && isWebPushConfigured() ? publicKey : null;
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
    orderId?: number;
    requireInteraction?: boolean;
    expiresAt?: string;
  },
  ttlSeconds = 3600
) {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject
    || !isValidVapidConfiguration(publicKey, privateKey, subject)) {
    throw new Error('Web Push VAPID keys are missing, malformed, or do not match. Check the deployed key pair and WEB_PUSH_SUBJECT.');
  }

  return webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: Math.max(0, Math.min(3600, Math.floor(ttlSeconds))),
    urgency: 'high'
  });
}
