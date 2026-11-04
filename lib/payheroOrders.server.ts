import 'server-only';
import { normalizeTicketPhoneNumber } from '@/lib/ticketing/phone';

const PAYHERO_API = 'https://backend.payhero.co.ke/api/v2';

type PayHeroResponse = {
  success?: boolean;
  status?: string;
  reference?: string;
  CheckoutRequestID?: string;
  amount?: number | string;
  currency?: string;
  external_reference?: string;
};

function getPayHeroConfiguration() {
  const token = process.env.PAYHERO_AUTH_TOKEN?.trim();
  const channelId = Number(process.env.PAYHERO_CHANNEL_ID);
  if (!token || !Number.isSafeInteger(channelId) || channelId < 1) {
    throw new Error('PayHero server credentials or channel ID are not configured.');
  }
  return {
    authorization: /^Basic\s/i.test(token) ? token : `Basic ${token}`,
    channelId
  };
}

function normalizePayHeroResponse(payload: unknown, status: number): PayHeroResponse {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`PayHero returned an invalid response (${status}).`);
  }
  const value = payload as Record<string, unknown>;
  return {
    success: typeof value.success === 'boolean' ? value.success : undefined,
    status: typeof value.status === 'string' ? value.status : undefined,
    reference: typeof value.reference === 'string' ? value.reference : undefined,
    CheckoutRequestID: typeof value.CheckoutRequestID === 'string' ? value.CheckoutRequestID : undefined,
    amount: typeof value.amount === 'number' || typeof value.amount === 'string' ? value.amount : undefined,
    currency: typeof value.currency === 'string' ? value.currency : undefined,
    external_reference: typeof value.external_reference === 'string' ? value.external_reference : undefined
  };
}

export function assertPayHeroOrderPaymentConfiguration() {
  getPayHeroConfiguration();
}

export async function initializePayHeroOrderPayment(input: {
  amountMinor: number;
  phone: string;
  customerName: string;
  externalReference: string;
  callbackUrl: string;
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor % 100 !== 0) {
    throw new Error('PayHero M-Pesa payments require an amount in whole Kenyan shillings.');
  }
  const phone = normalizeTicketPhoneNumber(input.phone);
  if (!phone || !/^\+254[17]\d{8}$/.test(phone)) {
    throw new Error('Enter a valid Kenyan M-Pesa phone number.');
  }

  const { authorization, channelId } = getPayHeroConfiguration();
  const response = await fetch(`${PAYHERO_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: input.amountMinor / 100,
      phone_number: `0${phone.slice(4)}`,
      channel_id: channelId,
      provider: 'm-pesa',
      external_reference: input.externalReference,
      customer_name: input.customerName,
      callback_url: input.callbackUrl
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new Error(`PayHero returned an invalid response (${response.status}).`);
  }
  const result = normalizePayHeroResponse(payload, response.status);
  if (!response.ok || result.success !== true || result.status !== 'QUEUED'
      || !result.reference?.trim() || !result.CheckoutRequestID?.trim()) {
    throw new Error(`PayHero could not confirm the M-Pesa request (${response.status}).`);
  }
  return {
    reference: result.reference,
    checkoutRequestId: result.CheckoutRequestID
  };
}

export async function verifyPayHeroOrderPayment(reference: string) {
  if (!reference || reference.length > 160) {
    throw new Error('PayHero transaction reference is invalid.');
  }
  const { authorization } = getPayHeroConfiguration();
  const url = new URL(`${PAYHERO_API}/transaction-status`);
  url.searchParams.set('reference', reference);
  const response = await fetch(url, {
    headers: { Authorization: authorization },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new Error(`PayHero transaction verification failed (${response.status}).`);
  }
  const result = normalizePayHeroResponse(payload, response.status);
  if (!response.ok || !result.status || !result.reference) {
    throw new Error(`PayHero transaction verification failed (${response.status}).`);
  }
  return result;
}
