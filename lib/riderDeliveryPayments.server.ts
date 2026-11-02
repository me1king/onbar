import 'server-only';

import { getPublicBaseUrl } from '@/lib/utils';

const PAYSTACK_API = 'https://api.paystack.co';

function getMpesaConfiguration() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY?.trim();
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET?.trim();
  const passkey = process.env.MPESA_PASSKEY?.trim();
  const shortcode = process.env.MPESA_SHORTCODE?.trim();
  const environment = process.env.MPESA_ENVIRONMENT?.trim();
  if (!consumerKey || !consumerSecret || !passkey || !shortcode
      || (environment !== 'sandbox' && environment !== 'production')) {
    throw new Error('M-Pesa delivery payments are not configured. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_SHORTCODE and MPESA_ENVIRONMENT.');
  }

  return {
    consumerKey,
    consumerSecret,
    passkey,
    shortcode,
    baseUrl: environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'
  };
}

function mpesaTimestamp() {
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

function normalizeMpesaPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const phone = digits.startsWith('254')
    ? digits
    : digits.startsWith('0')
      ? `254${digits.slice(1)}`
      : `254${digits}`;
  if (!/^254[17]\d{8}$/.test(phone)) {
    throw new Error('A valid Kenyan M-Pesa phone number is required.');
  }
  return phone;
}

async function getMpesaAccessToken(configuration: ReturnType<typeof getMpesaConfiguration>) {
  const credentials = Buffer.from(`${configuration.consumerKey}:${configuration.consumerSecret}`).toString('base64');
  const response = await fetch(`${configuration.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json() as { access_token?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error('Safaricom could not authorize the M-Pesa request.');
  }
  return payload.access_token;
}

export async function initializeRiderMpesaPrompt(input: {
  orderId: number;
  amountKsh: number;
  phone: string;
  callbackToken: string;
}) {
  if (!Number.isSafeInteger(input.amountKsh) || input.amountKsh <= 0) {
    throw new Error('The order total must be a positive whole-KSh amount for M-Pesa.');
  }
  const configuration = getMpesaConfiguration();
  const timestamp = mpesaTimestamp();
  const password = Buffer.from(`${configuration.shortcode}${configuration.passkey}${timestamp}`).toString('base64');
  const callbackUrl = new URL(
    `/api/mpesa/rider-delivery-callback/${encodeURIComponent(input.callbackToken)}`,
    getPublicBaseUrl()
  );
  if (callbackUrl.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('M-Pesa callbacks require a public HTTPS application URL.');
  }

  const accessToken = await getMpesaAccessToken(configuration);
  const response = await fetch(`${configuration.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      BusinessShortCode: configuration.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: input.amountKsh,
      PartyA: normalizeMpesaPhone(input.phone),
      PartyB: configuration.shortcode,
      PhoneNumber: normalizeMpesaPhone(input.phone),
      CallBackURL: callbackUrl.toString(),
      AccountReference: `OB${input.orderId}`.slice(0, 12),
      TransactionDesc: `Online Bar order ${input.orderId}`
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json() as {
    ResponseCode?: string;
    ResponseDescription?: string;
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
  };
  if (!response.ok || payload.ResponseCode !== '0'
      || !payload.MerchantRequestID || !payload.CheckoutRequestID) {
    throw new Error(`Safaricom could not start the M-Pesa prompt: ${payload.ResponseDescription || response.statusText}`);
  }
  return {
    merchantRequestId: payload.MerchantRequestID,
    checkoutRequestId: payload.CheckoutRequestID
  };
}

export async function verifyRiderMpesaPrompt(checkoutRequestId: string) {
  if (!checkoutRequestId || checkoutRequestId.length > 200) {
    throw new Error('The M-Pesa checkout reference is invalid.');
  }
  const configuration = getMpesaConfiguration();
  const timestamp = mpesaTimestamp();
  const password = Buffer.from(`${configuration.shortcode}${configuration.passkey}${timestamp}`).toString('base64');
  const accessToken = await getMpesaAccessToken(configuration);
  const response = await fetch(`${configuration.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      BusinessShortCode: configuration.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json() as {
    ResponseCode?: string;
    ResultCode?: string | number;
    ResultDesc?: string;
    CheckoutRequestID?: string;
  };
  if (!response.ok || payload.ResponseCode !== '0'
      || payload.CheckoutRequestID !== checkoutRequestId
      || payload.ResultCode === undefined) {
    throw new Error('Safaricom could not verify the M-Pesa transaction.');
  }
  return {
    paid: String(payload.ResultCode) === '0',
    description: payload.ResultDesc || ''
  };
}

export async function initializeRiderQrCheckout(input: {
  email: string;
  amountMinor: number;
  reference: string;
  orderId: number;
}) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('Scan-to-pay is not configured. Set PAYSTACK_SECRET_KEY.');
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new Error('A valid customer email address is required to create a secure payment QR.');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('The order total is invalid for secure scan-to-pay.');
  }

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
      channels: ['card', 'mobile_money'],
      metadata: {
        rider_delivery_order_id: input.orderId
      }
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json() as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };
  const authorizationUrl = payload.data?.authorization_url;
  if (!response.ok || payload.status !== true || !authorizationUrl
      || !authorizationUrl.startsWith('https://checkout.paystack.com/')
      || payload.data?.reference !== input.reference) {
    throw new Error(`Paystack could not create the payment checkout: ${payload.message || response.statusText}`);
  }
  return authorizationUrl;
}
