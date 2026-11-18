import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTicketPhoneNumber } from '@/lib/ticketing/phone';

export type DarajaEnvironment = 'sandbox' | 'production';

export interface DarajaCredentials {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  shortcodeType: 'paybill' | 'till';
  environment: DarajaEnvironment;
}

type StoredCredentials = DarajaCredentials;

function getEncryptionKey() {
  const key = Buffer.from(process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY?.trim() || '', 'base64');
  if (key.length !== 32) {
    throw new Error('Payment credential storage is not configured. Set PAYMENT_CREDENTIAL_ENCRYPTION_KEY to a base64-encoded 32-byte key.');
  }
  return key;
}

function encryptCredentials(credentials: DarajaCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final()
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

function decryptCredentials(value: string): StoredCredentials {
  const payload = Buffer.from(value, 'base64url');
  if (payload.length < 29) throw new Error('Stored payment credentials are invalid.');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const plaintext = Buffer.concat([
    decipher.update(payload.subarray(28)),
    decipher.final()
  ]).toString('utf8');
  const parsed = JSON.parse(plaintext) as Partial<StoredCredentials>;
  if (!isValidDarajaCredentials(parsed)) throw new Error('Stored payment credentials are invalid.');
  return parsed;
}

export function isValidDarajaCredentials(value: unknown): value is DarajaCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const credentials = value as Partial<DarajaCredentials>;
  return typeof credentials.consumerKey === 'string'
    && credentials.consumerKey.trim().length >= 8
    && credentials.consumerKey.length <= 256
    && typeof credentials.consumerSecret === 'string'
    && credentials.consumerSecret.trim().length >= 8
    && credentials.consumerSecret.length <= 256
    && typeof credentials.passkey === 'string'
    && credentials.passkey.trim().length >= 8
    && credentials.passkey.length <= 256
    && typeof credentials.shortcode === 'string'
    && /^\d{5,7}$/.test(credentials.shortcode)
    && (credentials.shortcodeType === 'paybill' || credentials.shortcodeType === 'till')
    && (credentials.environment === 'sandbox' || credentials.environment === 'production');
}

function environmentCredentials(): DarajaCredentials | null {
  const consumerKey = process.env.MPESA_CONSUMER_KEY?.trim();
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET?.trim();
  const passkey = process.env.MPESA_PASSKEY?.trim();
  const shortcode = process.env.MPESA_SHORTCODE?.trim();
  const shortcodeType = process.env.MPESA_SHORTCODE_TYPE?.trim() || 'paybill';
  const environment = process.env.MPESA_ENVIRONMENT?.trim();
  if (!consumerKey && !consumerSecret && !passkey && !shortcode) return null;
  const value = { consumerKey, consumerSecret, passkey, shortcode, shortcodeType, environment };
  if (!isValidDarajaCredentials(value)) {
    throw new Error('M-Pesa environment credentials are incomplete or invalid. Configure MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_SHORTCODE, and MPESA_ENVIRONMENT.');
  }
  return value;
}

export async function getDarajaCredentials(database: SupabaseClient): Promise<DarajaCredentials> {
  const { data, error } = await database.from('payment_provider_credentials')
    .select('encrypted_credentials')
    .eq('provider', 'daraja')
    .maybeSingle();
  if (error) {
    console.error('[Daraja] Could not load encrypted payment credentials:', error);
    if (/payment_provider_credentials|schema cache/i.test(error.message)) {
      throw new Error('Daraja setup storage is not installed. Apply supabase/DARAJA_CHECKOUT_MIGRATION.sql.');
    }
    throw new Error('Daraja credentials could not be loaded.');
  }
  if (!data || typeof data.encrypted_credentials !== 'string') {
    const fromEnvironment = environmentCredentials();
    if (fromEnvironment) return fromEnvironment;
    throw new Error('Daraja is not configured. Add rotated credentials in Admin Settings → Integrations.');
  }
  return decryptCredentials(data.encrypted_credentials);
}

export async function getStoredDarajaConfiguration(database: SupabaseClient) {
  const { data, error } = await database.from('payment_provider_credentials')
    .select('encrypted_credentials')
    .eq('provider', 'daraja')
    .maybeSingle();
  if (error) {
    console.error('[Daraja] Could not check payment configuration:', error);
    if (/payment_provider_credentials|schema cache/i.test(error.message)) {
      throw new Error('Daraja setup storage is not installed. Apply supabase/DARAJA_CHECKOUT_MIGRATION.sql.');
    }
    throw new Error('Daraja configuration could not be checked.');
  }
  if (!data || typeof data.encrypted_credentials !== 'string') {
    const fromEnvironment = environmentCredentials();
    if (fromEnvironment) {
      return {
        configured: true,
        source: 'environment' as const,
        shortcode: fromEnvironment.shortcode,
        environment: fromEnvironment.environment
      };
    }
    return { configured: false, source: null, shortcode: null, environment: null };
  }
  const credentials = decryptCredentials(data.encrypted_credentials);
  return {
    configured: true,
    source: 'admin' as const,
    shortcode: credentials.shortcode,
    environment: credentials.environment
  };
}

export async function saveDarajaCredentials(database: SupabaseClient, credentials: DarajaCredentials) {
  const { error } = await database.from('payment_provider_credentials').upsert({
    provider: 'daraja',
    encrypted_credentials: encryptCredentials(credentials),
    updated_at: new Date().toISOString()
  }, { onConflict: 'provider' });
  if (error) {
    console.error('[Daraja] Could not save encrypted payment credentials:', error);
    if (/payment_provider_credentials|schema cache/i.test(error.message)) {
      throw new Error('Daraja setup storage is not installed. Apply supabase/DARAJA_CHECKOUT_MIGRATION.sql.');
    }
    throw new Error('Daraja credentials could not be saved.');
  }
}

function baseUrl(environment: DarajaEnvironment) {
  return environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function readSafaricomResponse<T>(response: Response, action: string): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const paymentRequired = response.status === 402 || /^payment required\b/i.test(body.trim());
    console.error('[Daraja] Safaricom returned a non-JSON response:', {
      action,
      status: response.status,
      contentType: response.headers.get('content-type')
    });
    throw new Error(paymentRequired
      ? `Safaricom returned Payment Required (HTTP ${response.status}) while ${action}. Verify Daraja account access and credentials.`
      : `Safaricom returned an unreadable response while ${action} (HTTP ${response.status}).`);
  }
}

async function getAccessToken(credentials: DarajaCredentials) {
  const auth = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64');
  const response = await fetch(`${baseUrl(credentials.environment)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const result = await readSafaricomResponse<{ access_token?: string }>(response, 'authorizing M-Pesa credentials');
  if (!response.ok || typeof result.access_token !== 'string' || !result.access_token) {
    throw new Error('Safaricom could not authorize these Daraja credentials.');
  }
  return result.access_token;
}

export async function verifyDarajaCredentials(credentials: DarajaCredentials) {
  await getAccessToken(credentials);
}

function darajaTimestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}${value('hour')}${value('minute')}${value('second')}`;
}

function normalizePhone(value: string) {
  const normalized = normalizeTicketPhoneNumber(value);
  if (!normalized || !/^\+254[17]\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid Kenyan M-Pesa phone number.');
  }
  return normalized.slice(1);
}

export async function initializeDarajaStkPush(input: {
  database: SupabaseClient;
  amountKsh: number;
  phone: string;
  orderId: number;
  callbackUrl: string;
}) {
  if (!Number.isSafeInteger(input.amountKsh) || input.amountKsh <= 0) {
    throw new Error('M-Pesa checkout requires a positive whole-KSh amount.');
  }
  const credentials = await getDarajaCredentials(input.database);
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${credentials.shortcode}${credentials.passkey}${timestamp}`).toString('base64');
  const token = await getAccessToken(credentials);
  const response = await fetch(`${baseUrl(credentials.environment)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: credentials.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: credentials.shortcodeType === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
      Amount: input.amountKsh,
      PartyA: normalizePhone(input.phone),
      PartyB: credentials.shortcode,
      PhoneNumber: normalizePhone(input.phone),
      CallBackURL: input.callbackUrl,
      AccountReference: `OB${input.orderId}`.slice(0, 12),
      TransactionDesc: `Online Bar order ${input.orderId}`
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const result = await readSafaricomResponse<{
    ResponseCode?: string;
    ResponseDescription?: string;
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
  }>(response, 'starting the M-Pesa prompt');
  if (!response.ok || result.ResponseCode !== '0'
      || !result.MerchantRequestID || !result.CheckoutRequestID) {
    throw new Error(`Safaricom could not start the M-Pesa prompt: ${result.ResponseDescription || response.statusText}`);
  }
  return {
    merchantRequestId: result.MerchantRequestID,
    checkoutRequestId: result.CheckoutRequestID
  };
}

export async function verifyDarajaStkPayment(database: SupabaseClient, checkoutRequestId: string) {
  const credentials = await getDarajaCredentials(database);
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${credentials.shortcode}${credentials.passkey}${timestamp}`).toString('base64');
  const token = await getAccessToken(credentials);
  const response = await fetch(`${baseUrl(credentials.environment)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: credentials.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const result = await readSafaricomResponse<{
    ResponseCode?: string;
    ResultCode?: string | number;
    ResultDesc?: string;
    CheckoutRequestID?: string;
  }>(response, 'verifying the M-Pesa transaction');
  if (!response.ok || result.ResponseCode !== '0'
      || result.CheckoutRequestID !== checkoutRequestId
      || result.ResultCode === undefined) {
    throw new Error('Safaricom could not verify the M-Pesa transaction.');
  }
  return { paid: String(result.ResultCode) === '0', description: result.ResultDesc || '' };
}
