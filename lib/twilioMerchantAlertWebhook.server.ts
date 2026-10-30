import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

const publicBaseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://onlinebar.onrender.com').replace(/\/+$/, '');

export type MerchantVoiceToken = {
  orderId: number;
  applicationId: string;
  contactId: string;
  expiresAt: number;
};

function getTwilioUrl(request: Request) {
  const parsed = new URL(request.url);
  return `${publicBaseUrl}${parsed.pathname}${parsed.search}`;
}

function verifyTwilioSignature(request: Request, parameters: URLSearchParams) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const received = request.headers.get('x-twilio-signature');
  if (!authToken || !received) return false;
  const signedParameters = [...new Set(parameters.keys())].sort().map(key =>
    `${key}${parameters.getAll(key).sort().join('')}`
  ).join('');
  const expected = createHmac('sha1', authToken)
    .update(`${getTwilioUrl(request)}${signedParameters}`)
    .digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function readTwilioRequest(request: Request): Promise<URLSearchParams | null> {
  const form = request.method === 'POST'
    ? new URLSearchParams(await request.text())
    : new URLSearchParams();
  return verifyTwilioSignature(request, form) ? form : null;
}

export function getMerchantVoiceToken(request: Request, form: URLSearchParams) {
  const secret = process.env.TWILIO_ALERT_TOKEN_SECRET?.trim();
  const token = new URL(request.url).searchParams.get('token') || form.get('token');
  if (!secret || !token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<MerchantVoiceToken>;
    if (!Number.isSafeInteger(data.orderId) || typeof data.applicationId !== 'string'
      || typeof data.contactId !== 'string' || typeof data.expiresAt !== 'number'
      || data.expiresAt <= Date.now()) return null;
    return data as MerchantVoiceToken;
  } catch {
    return null;
  }
}

export function xmlEscape(value: string) {
  return value.replace(/[<>&'"]/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  })[character] || character);
}

export function xmlResponse(content: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export function webhookPublicUrl(path: string) {
  return `${publicBaseUrl}${path}`;
}
