import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  getMerchantVoiceToken,
  readTwilioRequest,
  xmlResponse
} from '@/lib/twilioMerchantAlertWebhook.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const form = await readTwilioRequest(request);
  if (!form) return new NextResponse('Invalid provider signature.', { status: 403 });
  const token = getMerchantVoiceToken(request, form);
  if (!token) return xmlResponse('<Say>This order alert has expired. Please open the merchant app.</Say>');
  if (form.get('Digits') !== '1') {
    return xmlResponse('<Say>The order was not accepted. Goodbye.</Say>');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[MerchantAlertVoice] Supabase service role is not configured.');
    return xmlResponse('<Say>We could not confirm the order. Please open the merchant app.</Say>');
  }

  const database = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: contact, error: contactError } = await database.from('merchant_alert_contacts')
    .select('phone,active,channels')
    .eq('id', token.contactId)
    .eq('application_id', token.applicationId)
    .maybeSingle();
  if (contactError) {
    console.error('[MerchantAlertVoice] Could not verify call recipient:', contactError);
    return xmlResponse('<Say>We could not confirm the order. Please open the merchant app.</Say>');
  }
  if (!contact?.active || !contact.channels.includes('voice')) {
    return xmlResponse('<Say>This contact is no longer enabled for order calls.</Say>');
  }
  const caller = form.get('To') || '';
  if (caller && caller.replace(/\s+/g, '') !== contact.phone.replace(/\s+/g, '')) {
    return new NextResponse('Call recipient does not match.', { status: 403 });
  }

  const { data: accepted, error } = await database.rpc('accept_merchant_order_alert', {
    p_order_id: token.orderId,
    p_application_id: token.applicationId,
    p_actor: `voice:${contact.phone}`
  });
  if (error) {
    console.error('[MerchantAlertVoice] Could not record order acceptance:', error);
    return xmlResponse('<Say>The order could not be accepted. Please open the merchant app.</Say>');
  }
  return xmlResponse(accepted
    ? '<Say>Order accepted. Thank you.</Say>'
    : '<Say>This order has already been answered or offered to another merchant. Thank you.</Say>');
}
