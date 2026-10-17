import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { decryptTicketCredential } from '@/lib/ticketing/credentials.server';

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
    return NextResponse.json({ error: 'Ticket wallet is temporarily unavailable.' }, { status: 503 });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: order, error: orderError } = await database
    .from('ticketing_orders')
    .select('id,reference,status,total_minor,currency,event_id')
    .eq('id', orderId)
    .eq('access_token_hash', tokenHash)
    .maybeSingle();
  if (orderError) {
    console.error('[TicketingWallet] Could not verify order access:', orderError);
    return NextResponse.json({ error: 'Ticket wallet could not be verified.' }, { status: 503 });
  }
  if (!order) return NextResponse.json({ error: 'This ticket-wallet link is invalid or expired.' }, { status: 401 });
  if (order.status !== 'paid') {
    return NextResponse.json({
      status: order.status,
      orderReference: order.reference,
      message: order.status === 'reconciliation_required'
        ? 'Payment needs manual review. Contact ONLINE BAR support and quote this order reference.'
        : 'Payment is still being confirmed. Keep this page open while we check.'
    }, {
      status: order.status === 'reconciliation_required' ? 409 : 202,
      headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' }
    });
  }

  const [eventResult, itemsResult] = await Promise.all([
    database.from('ticketing_events').select('title,starts_at,ends_at,venue_name,city,timezone')
      .eq('id', order.event_id).maybeSingle(),
    database.from('ticketing_order_items')
      .select('id,ticket_name_snapshot')
      .eq('order_id', order.id)
  ]);
  if (eventResult.error || itemsResult.error || !eventResult.data || !itemsResult.data?.length) {
    console.error('[TicketingWallet] Could not load issued order details:', eventResult.error || itemsResult.error);
    return NextResponse.json({ error: 'Your issued ticket details could not be loaded.' }, { status: 503 });
  }

  const { data: tickets, error: ticketsError } = await database
    .from('ticketing_tickets')
    .select('id,ticket_reference,attendee_name,credential_hash,credential_ciphertext,order_item_id')
    .in('order_item_id', itemsResult.data.map(item => item.id))
    .order('created_at', { ascending: true });
  if (ticketsError || !tickets?.length) {
    console.error('[TicketingWallet] Could not load issued tickets:', ticketsError);
    return NextResponse.json({ error: 'Your issued ticket details could not be loaded.' }, { status: 503 });
  }
  const itemNames = new Map(itemsResult.data.map(item => [item.id, item.ticket_name_snapshot]));

  try {
    const walletTickets = tickets.map(ticket => {
      if (!ticket.credential_ciphertext || !itemNames.has(ticket.order_item_id)) {
        throw new Error('An issued ticket is missing its protected credential or order item.');
      }
      const credential = decryptTicketCredential(ticket.credential_ciphertext);
      if (createHash('sha256').update(credential).digest('hex') !== ticket.credential_hash) {
        throw new Error('An issued ticket credential failed integrity validation.');
      }
      return {
        reference: ticket.ticket_reference,
        attendeeName: ticket.attendee_name,
        ticketName: itemNames.get(ticket.order_item_id),
        credential
      };
    });

    return NextResponse.json({
      status: 'paid',
      order: {
        reference: order.reference,
        totalMinor: order.total_minor,
        currency: order.currency
      },
      event: eventResult.data,
      tickets: walletTickets
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' }
    });
  } catch (credentialError) {
    console.error('[TicketingWallet] Could not decrypt or validate ticket credentials:', credentialError);
    return NextResponse.json({ error: 'Ticket credentials could not be safely verified. Contact support.' }, { status: 503 });
  }
}
