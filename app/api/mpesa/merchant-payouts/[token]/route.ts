import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type DarajaB2cCallback = {
  Result?: {
    ResultCode?: number | string;
    ResultDesc?: string;
    ConversationID?: string;
    OriginatorConversationID?: string;
    ResultParameters?: {
      ResultParameter?: Array<{ Key?: string; Value?: string | number }>;
    };
  };
};

function getCallbackValue(
  parameters: Array<{ Key?: string; Value?: string | number }>,
  key: string
) {
  return parameters.find(parameter => parameter.Key === key)?.Value;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid payout callback.' }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error('[MerchantPayoutCallback] Supabase service access is not configured.');
    return NextResponse.json({ error: 'Payout callback processing is not configured.' }, { status: 503 });
  }

  let payload: DarajaB2cCallback;
  try {
    payload = await request.json() as DarajaB2cCallback;
  } catch {
    return NextResponse.json({ error: 'Invalid Daraja payout callback.' }, { status: 400 });
  }
  const result = payload.Result;
  if (!result || (typeof result.ResultCode !== 'number' && typeof result.ResultCode !== 'string')) {
    return NextResponse.json({ error: 'Daraja payout callback details are incomplete.' }, { status: 400 });
  }

  const parameters = result.ResultParameters?.ResultParameter || [];
  const receipt = getCallbackValue(parameters, 'TransactionReceipt');
  const amountValue = getCallbackValue(parameters, 'TransactionAmount');
  const amount = typeof amountValue === 'number' || typeof amountValue === 'string'
    ? Number(amountValue)
    : null;
  const resultCode = String(result.ResultCode);
  const success = resultCode === '0';
  if (success && (typeof receipt !== 'string' || !/^[A-Za-z0-9]{6,20}$/.test(receipt)
      || amount === null || !Number.isFinite(amount))) {
    console.error('[MerchantPayoutCallback] Successful payout callback is missing a valid receipt or amount.');
    return NextResponse.json({ error: 'Payout callback requires finance reconciliation.' }, { status: 503 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: outcome, error } = await database.rpc('record_merchant_payout_result', {
    p_callback_token_hash: createHash('sha256').update(token).digest('hex'),
    p_success: success,
    p_result_code: resultCode.slice(0, 32),
    p_result_message: (result.ResultDesc || 'Daraja payout result received.').slice(0, 1000),
    p_receipt: success ? receipt : null,
    p_conversation_id: typeof result.ConversationID === 'string'
      ? result.ConversationID.slice(0, 200)
      : null,
    p_originator_conversation_id: typeof result.OriginatorConversationID === 'string'
      ? result.OriginatorConversationID.slice(0, 200)
      : null,
    p_amount_kes: success ? amount : null
  });
  if (error) {
    console.error('[MerchantPayoutCallback] Could not record Daraja payout result:', error);
    return NextResponse.json({ error: 'Payout result could not be recorded.' }, { status: 503 });
  }
  if (outcome === 'not_found') {
    return NextResponse.json({ error: 'Unknown payout callback.' }, { status: 404 });
  }
  if (outcome === 'mismatch' || outcome === 'inactive') {
    console.error('[MerchantPayoutCallback] Payout result requires finance reconciliation:', outcome);
    return NextResponse.json({ error: 'Payout result requires finance reconciliation.' }, { status: 409 });
  }
  if (outcome !== 'paid' && outcome !== 'failed') {
    console.error('[MerchantPayoutCallback] Unexpected payout result state:', outcome);
    return NextResponse.json({ error: 'Payout result could not be confirmed.' }, { status: 503 });
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: `Payout ${outcome} result recorded.` });
}
