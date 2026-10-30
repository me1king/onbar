import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  getMerchantVoiceToken,
  readTwilioRequest,
  webhookPublicUrl,
  xmlEscape,
  xmlResponse
} from '@/lib/twilioMerchantAlertWebhook.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handleVoice(request);
}

export async function POST(request: Request) {
  return handleVoice(request);
}

async function handleVoice(request: Request) {
  const form = await readTwilioRequest(request);
  if (!form) return new NextResponse('Invalid provider signature.', { status: 403 });
  const token = getMerchantVoiceToken(request, form);
  if (!token) return xmlResponse('<Say>Sorry, this order alert has expired.</Say>');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[MerchantAlertVoice] Supabase service role is not configured.');
    return xmlResponse('<Say>We could not verify this order. Please open the merchant app.</Say>');
  }

  const database = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: contact, error: contactError } = await database.from('merchant_alert_contacts')
    .select('name,language,phone,active')
    .eq('id', token.contactId)
    .eq('application_id', token.applicationId)
    .maybeSingle();
  if (contactError) {
    console.error('[MerchantAlertVoice] Could not verify call recipient:', contactError);
    return xmlResponse('<Say>We could not verify this order. Please open the merchant app.</Say>');
  }
  if (!contact?.active || !contact.phone) return xmlResponse('<Say>This contact is no longer active.</Say>');

  const caller = form.get('To') || '';
  if (caller && caller.replace(/\s+/g, '') !== contact.phone.replace(/\s+/g, '')) {
    return new NextResponse('Call recipient does not match.', { status: 403 });
  }

  const tokenValue = new URL(request.url).searchParams.get('token') || '';
  const actionUrl = new URL(webhookPublicUrl('/api/webhooks/twilio/merchant-alert/confirm'));
  actionUrl.searchParams.set('token', tokenValue);
  const action = xmlEscape(actionUrl.toString());
  const language = contact.language === 'sw' ? 'sw-KE' : 'en-KE';
  return xmlResponse(
    `<Gather numDigits="1" timeout="8" action="${action}" method="POST">` +
    `<Say language="${language}">Online Bar. You have new order number ${token.orderId}. Press 1 to accept this order. Open the merchant app to decline.</Say>` +
    '</Gather><Say>We did not receive a response. The order will be offered to another merchant if it expires.</Say>'
  );
}
