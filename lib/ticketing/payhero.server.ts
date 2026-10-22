import 'server-only';

const PAYHERO_API = 'https://backend.payhero.co.ke/api/v2';

type PayHeroTransactionResponse = {
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
    throw new Error('PayHero ticket payment configuration is missing.');
  }

  return {
    authorization: /^Basic\s/i.test(token) ? token : `Basic ${token}`,
    channelId
  };
}

export function assertPayHeroTicketPaymentConfiguration() {
  getPayHeroConfiguration();
}

async function readPayHeroResponse(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new Error(`PayHero returned an invalid response (${response.status}).`);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`PayHero returned an invalid response (${response.status}).`);
  }
  const values = payload as Record<string, unknown>;
  return {
    success: typeof values.success === 'boolean' ? values.success : undefined,
    status: typeof values.status === 'string' ? values.status : undefined,
    reference: typeof values.reference === 'string' ? values.reference : undefined,
    CheckoutRequestID: typeof values.CheckoutRequestID === 'string' ? values.CheckoutRequestID : undefined,
    amount: typeof values.amount === 'number' || typeof values.amount === 'string' ? values.amount : undefined,
    currency: typeof values.currency === 'string' ? values.currency : undefined,
    external_reference: typeof values.external_reference === 'string' ? values.external_reference : undefined
  } satisfies PayHeroTransactionResponse;
}

export async function initializePayHeroTicketCheckout(input: {
  amountMinor: number;
  phone: string;
  customerName: string;
  externalReference: string;
  callbackUrl: string;
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor % 100 !== 0) {
    throw new Error('PayHero M-Pesa ticket payments must be a whole KES amount.');
  }
  if (!/^\+254[17]\d{8}$/.test(input.phone)) {
    throw new Error('A valid Kenyan M-Pesa phone number is required.');
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
      phone_number: `0${input.phone.slice(4)}`,
      channel_id: channelId,
      provider: 'm-pesa',
      external_reference: input.externalReference,
      customer_name: input.customerName,
      callback_url: input.callbackUrl
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const result = await readPayHeroResponse(response);
  if (!response.ok || result.success !== true || result.status !== 'QUEUED'
      || typeof result.reference !== 'string' || !result.reference.trim()) {
    throw new Error(`PayHero could not start the M-Pesa payment (${response.status}).`);
  }

  const checkoutRequestId = result.CheckoutRequestID;
  if (typeof checkoutRequestId !== 'string' || !checkoutRequestId.trim()) {
    throw new Error('PayHero did not return a valid M-Pesa checkout request.');
  }

  return {
    reference: result.reference,
    checkoutRequestId
  };
}

export async function verifyPayHeroTicketTransaction(reference: string) {
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
  const result = await readPayHeroResponse(response);
  if (!response.ok || typeof result.status !== 'string'
      || typeof result.reference !== 'string' || !result.reference) {
    throw new Error(`PayHero transaction verification failed (${response.status}).`);
  }
  return result;
}
