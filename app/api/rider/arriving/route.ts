import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createHmac, randomInt } from 'crypto';
import { verifyRiderSession } from '@/lib/riderSession.server';
import { normalizeCustomerContactKey } from '@/lib/customerMessaging';
import { getPublicBaseUrl } from '@/lib/utils';
import { getWhatsAppCredentials } from '@/lib/whatsappCredentials';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

function internationalPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return digits;
}

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: { orderId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid delivery order is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'A valid delivery order is required.' }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider arrival messaging is not configured.' }, { status: 503 });

  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderArrival] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can notify a customer.' }, { status: 403 });
  }

  const { data: order, error: orderError } = await database.from('orders')
    .select('id,status,rider_phone,customer_name,customer_phone,notification_whatsapp_opt_in')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[RiderArrival] Could not load delivery:', orderError);
    return NextResponse.json({ error: 'Delivery details could not be loaded.' }, { status: 503 });
  }
  if (!order || order.rider_phone !== session.phone) {
    return NextResponse.json({ error: 'This order is not assigned to your rider account.' }, { status: 404 });
  }
  if (order.status !== 'Out for Delivery') {
    return NextResponse.json({ error: 'You can notify the customer after the order is out for delivery.' }, { status: 409 });
  }

  const phone = typeof order.customer_phone === 'string' ? order.customer_phone.trim() : '';
  const recipient = internationalPhone(phone);
  const contactKey = normalizeCustomerContactKey('', phone);
  if (!contactKey || !/^\d{8,15}$/.test(recipient)) {
    return NextResponse.json({ error: 'This order has no valid WhatsApp number.' }, { status: 409 });
  }
  const { data: preference, error: preferenceError } = await database
    .from('customer_notification_preferences')
    .select('channels')
    .eq('channel_key', contactKey)
    .maybeSingle();
  if (preferenceError) {
    console.error('[RiderArrival] Could not load customer consent:', preferenceError);
    return NextResponse.json({ error: 'Customer messaging consent could not be verified.' }, { status: 503 });
  }
  const whatsappAllowed = preference
    ? Array.isArray(preference.channels) && preference.channels.includes('whatsapp')
    : order.notification_whatsapp_opt_in === true;
  if (!whatsappAllowed) {
    return NextResponse.json({ error: 'The customer has not opted in to WhatsApp delivery messages.' }, { status: 403 });
  }

  const { token, phoneId } = getWhatsAppCredentials();
  const templateName = process.env.WHATSAPP_DELIVERY_CODE_TEMPLATE_NAME?.trim();
  const handoverSecret = process.env.RIDER_HANDOVER_CODE_SECRET?.trim();
  const version = process.env.WHATSAPP_API_VERSION?.trim() || 'v23.0';
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en';
  if (!token || !phoneId || !templateName || !handoverSecret) {
    return NextResponse.json({
      error: 'Secure handover messages are not configured. Set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, an approved WHATSAPP_DELIVERY_CODE_TEMPLATE_NAME, and RIDER_HANDOVER_CODE_SECRET.'
    }, { status: 503 });
  }

  const handoverCode = randomInt(0, 10000).toString().padStart(4, '0');
  const codeHash = createHmac('sha256', handoverSecret)
    .update(`${orderId}:${session.phone}:${handoverCode}`)
    .digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await database.rpc('claim_rider_handover_code', {
    p_order_id: orderId,
    p_rider_phone: session.phone,
    p_code_hash: codeHash,
    p_expires_at: expiresAt
  });
  if (claimError) {
    console.error('[RiderArrival] Could not issue handover code:', claimError);
    return NextResponse.json({
      error: /claim_rider_handover_code|rider_handover_codes|schema cache/i.test(claimError.message)
        ? 'Secure handover codes are not installed. Apply supabase/RIDER_DOORSTEP_PAYMENT_MIGRATION.sql.'
        : 'The customer handover code could not be issued.'
    }, { status: 503 });
  }
  if (!claimed) {
    const { data: existing, error: existingError } = await database.from('rider_handover_codes')
      .select('status,expires_at')
      .eq('order_id', orderId)
      .maybeSingle();
    if (existingError) {
      console.error('[RiderArrival] Could not verify prior handover code:', existingError);
      return NextResponse.json({ error: 'Prior handover code status could not be verified.' }, { status: 503 });
    }
    const alreadySent = ['sent', 'verified', 'consumed'].includes(existing?.status || '')
      && new Date(existing?.expires_at || 0).getTime() > Date.now();
    return alreadySent
      ? NextResponse.json({ sent: true, alreadySent: true }, { headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'A handover code is already being sent. Try again shortly.' }, { status: 409 });
  }

  const templateBody: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer_name || 'there' },
          { type: 'text', text: String(orderId) },
          { type: 'text', text: handoverCode },
          { type: 'text', text: `${getPublicBaseUrl()}/track?id=${encodeURIComponent(String(orderId))}` }
        ]
      }]
    }
  };
  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(templateBody),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store'
    });
    if (!response.ok) {
      console.error('[RiderArrival] WhatsApp provider rejected arrival message:', response.status);
      throw new Error('WhatsApp provider rejected the message. Check the approved arrival template and provider settings.');
    }
    const result = await response.json() as { messages?: Array<{ id?: string }> };
    const { error: updateError } = await database.from('rider_handover_codes')
      .update({
        status: 'sent',
        provider_message_id: result.messages?.[0]?.id || null,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .eq('rider_phone', session.phone);
    if (updateError) {
      console.error('[RiderArrival] Code was sent but its delivery record could not be updated:', updateError);
      return NextResponse.json({ error: 'The code was sent, but its verification record could not be saved.' }, { status: 503 });
    }
    const { error: arrivalAuditError } = await database.from('rider_arrival_notifications').upsert({
      order_id: orderId,
      rider_phone: session.phone,
      status: 'sent',
      provider_message_id: result.messages?.[0]?.id || null,
      error_message: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'order_id' });
    if (arrivalAuditError) {
      console.error('[RiderArrival] Code was sent but arrival audit could not be updated:', arrivalAuditError);
      return NextResponse.json({ error: 'The code was sent, but the arrival audit could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ sent: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Arrival message could not be sent.';
    const { error: updateError } = await database.from('rider_handover_codes')
      .update({
        status: 'failed',
        code_hash: null,
        error_message: message.slice(0, 1000),
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .eq('rider_phone', session.phone);
    if (updateError) console.error('[RiderArrival] Could not record failed handover code:', updateError);
    const { error: arrivalAuditError } = await database.from('rider_arrival_notifications').upsert({
      order_id: orderId,
      rider_phone: session.phone,
      status: 'failed',
      error_message: message.slice(0, 1000),
      updated_at: new Date().toISOString()
    }, { onConflict: 'order_id' });
    if (arrivalAuditError) console.error('[RiderArrival] Could not record failed arrival message:', arrivalAuditError);
    console.error('[RiderArrival] Arrival message send failed:', message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
