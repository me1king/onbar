import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { hashTicketAccessToken } from '@/lib/ticketing/credentials.server';
import { sendTicketOrderEmail } from '@/lib/ticketing/email.server';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  let body: { order?: unknown; token?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid ticket-wallet link is required.' }, { status: 400 });
  }
  const orderId = typeof body.order === 'string' ? body.order : '';
  const token = typeof body.token === 'string' ? body.token : '';
  if (!uuidPattern.test(orderId) || !tokenPattern.test(token)) {
    return NextResponse.json({ error: 'This ticket-wallet link is invalid or expired.' }, { status: 401 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Ticket email delivery is temporarily unavailable.' }, { status: 503 });
  }
  const { data: order, error } = await database.from('ticketing_orders')
    .select('id,status')
    .eq('id', orderId)
    .eq('access_token_hash', hashTicketAccessToken(token))
    .maybeSingle();
  if (error) {
    console.error('[TicketingEmail] Could not verify wallet access:', error);
    return NextResponse.json({ error: 'Ticket email access could not be verified.' }, { status: 503 });
  }
  if (!order) return NextResponse.json({ error: 'This ticket-wallet link is invalid or expired.' }, { status: 401 });
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'Ticket email is available after payment is confirmed.' }, { status: 409 });
  }

  try {
    const delivery = await sendTicketOrderEmail(database, order.id);
    if (delivery === 'busy') {
      return NextResponse.json({ status: 'sending' }, { status: 202 });
    }
    return NextResponse.json({ status: delivery });
  } catch (deliveryError) {
    console.error('[TicketingEmail] Wallet email retry failed:', deliveryError);
    return NextResponse.json({ error: 'Ticket email could not be sent. Please try again shortly.' }, { status: 503 });
  }
}
