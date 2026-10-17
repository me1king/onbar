import 'server-only';

const PAYSTACK_API = 'https://api.paystack.co';

export type VerifiedPaystackTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
};

export async function initializePaystackTicketCheckout(input: {
  email: string;
  amountMinor: number;
  reference: string;
  callbackUrl: string;
  orderId: string;
}) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('Paystack server-side configuration is missing.');

  const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountMinor,
      currency: 'KES',
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: ['card', 'mobile_money'],
      metadata: { ticketing_order_id: input.orderId }
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });

  const result = await response.json() as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };
  const authorizationUrl = result.data?.authorization_url;
  if (!response.ok || result.status !== true || !authorizationUrl
      || !authorizationUrl.startsWith('https://checkout.paystack.com/')) {
    throw new Error(`Paystack checkout could not be initialized: ${result.message || response.statusText}`);
  }
  if (result.data?.reference !== input.reference) {
    throw new Error('Paystack returned a different transaction reference.');
  }
  return authorizationUrl;
}

export async function verifyPaystackTicketTransaction(reference: string): Promise<VerifiedPaystackTransaction> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('Paystack server-side configuration is missing.');

  const response = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    }
  );
  const result = await response.json() as {
    status?: boolean;
    message?: string;
    data?: VerifiedPaystackTransaction;
  };
  if (!response.ok || result.status !== true || !result.data) {
    throw new Error(`Paystack transaction verification failed: ${result.message || response.statusText}`);
  }
  return result.data;
}
