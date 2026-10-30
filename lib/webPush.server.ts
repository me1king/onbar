import 'server-only';

import webPush, { type PushSubscription as WebPushSubscription } from 'web-push';

export function isWebPushConfigured() {
  return Boolean(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
    && process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()
    && process.env.WEB_PUSH_SUBJECT?.trim()
  );
}

export function getWebPushPublicKey() {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null;
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
  if (!publicKey || !privateKey || !subject) {
    throw new Error('Web Push is not configured. Set the WEB_PUSH_VAPID_* keys and WEB_PUSH_SUBJECT.');
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: Math.max(0, Math.min(3600, Math.floor(ttlSeconds))),
    urgency: 'high'
  });
}
