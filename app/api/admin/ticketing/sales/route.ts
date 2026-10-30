import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isMissingTicketEmailThemeColumn } from '@/lib/ticketing/theme';

export const dynamic = 'force-dynamic';

type TicketOrderReference = {
  reference: string;
};

function isMissingProviderDeliveryColumns(error: { code?: string; message?: string }) {
  return (error.code === '42703' || error.code === 'PGRST204')
    && /provider_delivery_status|provider_updated_at/i.test(error.message || '');
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  }
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Ticket sales reporting is restricted to platform admins.' }, { status: 403 });
  }

  const period = request.nextUrl.searchParams.get('period') || 'all';
  if (!['all', '7d', '30d'].includes(period)) {
    return NextResponse.json({ error: 'Choose a supported ticket sales reporting period.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });
  }

  const since = period === 'all'
    ? null
    : new Date(Date.now() - (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await database.rpc('ticketing_admin_sales_report', {
    p_since: since,
    p_until: null
  });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') {
      return NextResponse.json({
        error: 'Apply supabase/TICKETING_SALES_REPORT_MIGRATION.sql to enable isolated ticket sales reporting.'
      }, { status: 503 });
    }
    console.error('[TicketingSales] Could not load the ticket-only sales report:', error);
    return NextResponse.json({ error: 'Ticket sales could not be loaded.' }, { status: 503 });
  }

  const report = data as { reportVersion?: number; recentOrders?: unknown[] } | null;
  if (report?.reportVersion !== 2 || !Array.isArray(report.recentOrders) || report.recentOrders.some(order =>
    typeof order !== 'object' || order === null
    || !('reference' in order) || typeof order.reference !== 'string'
    || !('paymentProvider' in order) || !('paymentReference' in order) || !('verifiedAt' in order))) {
    return NextResponse.json({
      error: 'Reapply supabase/TICKETING_SALES_REPORT_MIGRATION.sql to include verified payment references in the Ticketing ledger.'
    }, { status: 503 });
  }

  const recentOrders = report.recentOrders as TicketOrderReference[];
  const references = recentOrders.map(order => order.reference);
  type BuyerOrder = {
    id: string;
    reference: string;
    buyer_name: string;
    buyer_email: string;
    buyer_email_theme?: string | null;
  };
  let buyerEmailThemeAvailable = true;
  const ordersResult = references.length
    ? await database.from('ticketing_orders')
      .select('id,reference,buyer_name,buyer_email,buyer_email_theme')
      .in('reference', references)
    : await database.from('ticketing_orders')
      .select('id,reference,buyer_name,buyer_email,buyer_email_theme')
      .limit(0);
  let buyerOrders: BuyerOrder[];
  if (isMissingTicketEmailThemeColumn(ordersResult.error)) {
    buyerEmailThemeAvailable = false;
    const fallbackOrdersResult = references.length
      ? await database.from('ticketing_orders')
        .select('id,reference,buyer_name,buyer_email')
        .in('reference', references)
      : await database.from('ticketing_orders')
        .select('id,reference,buyer_name,buyer_email')
        .limit(0);
    if (fallbackOrdersResult.error) {
      console.error('[TicketingSales] Could not load buyer details for the ticket report:', fallbackOrdersResult.error);
      return NextResponse.json({ error: 'Ticket buyer details could not be loaded.' }, { status: 503 });
    }
    buyerOrders = fallbackOrdersResult.data || [];
  } else if (ordersResult.error) {
    console.error('[TicketingSales] Could not load buyer details for the ticket report:', ordersResult.error);
    return NextResponse.json({ error: 'Ticket buyer details could not be loaded.' }, { status: 503 });
  } else {
    buyerOrders = ordersResult.data || [];
  }

  if (buyerOrders.length !== references.length) {
    console.error('[TicketingSales] A reported order could not be matched to its buyer details.');
    return NextResponse.json({ error: 'Ticket buyer details could not be matched to the sales report.' }, { status: 503 });
  }
  const orderIds = buyerOrders.map(order => order.id);
  const [itemsResult, deliveriesResult] = await Promise.all([
    orderIds.length
      ? database.from('ticketing_order_items')
        .select('order_id,ticket_name_snapshot,quantity')
        .in('order_id', orderIds)
      : database.from('ticketing_order_items')
        .select('order_id,ticket_name_snapshot,quantity')
        .limit(0),
    orderIds.length
      ? database.from('ticketing_email_deliveries')
        .select('order_id,status,attempts,sent_at,last_error')
        .in('order_id', orderIds)
      : database.from('ticketing_email_deliveries')
        .select('order_id,status,attempts,sent_at,last_error')
        .limit(0)
  ]);
  if (itemsResult.error) {
    console.error('[TicketingSales] Could not load purchased ticket selections:', itemsResult.error);
    return NextResponse.json({ error: 'Purchased ticket selections could not be loaded.' }, { status: 503 });
  }
  if (deliveriesResult.error) {
    console.error('[TicketingSales] Could not load ticket email delivery status:', deliveriesResult.error);
    return NextResponse.json({
      error: 'Ticket email status is unavailable. Apply supabase/TICKETING_EMAIL_DELIVERY_MIGRATION.sql.'
    }, { status: 503 });
  }

  const providerDeliveryResult = orderIds.length
    ? await database.from('ticketing_email_deliveries')
      .select('order_id,provider_delivery_status,provider_updated_at')
      .in('order_id', orderIds)
    : await database.from('ticketing_email_deliveries')
      .select('order_id,provider_delivery_status,provider_updated_at')
      .limit(0);
  const providerDeliveryTrackingAvailable = !providerDeliveryResult.error;
  if (providerDeliveryResult.error && !isMissingProviderDeliveryColumns(providerDeliveryResult.error)) {
    console.error('[TicketingSales] Could not load provider email delivery events:', providerDeliveryResult.error);
    return NextResponse.json({ error: 'Provider email delivery status could not be loaded.' }, { status: 503 });
  }

  const orderByReference = new Map(buyerOrders.map(order => [order.reference, order]));
  const itemsByOrder = new Map<string, typeof itemsResult.data>();
  for (const item of itemsResult.data || []) {
    itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) || []), item]);
  }
  const deliveryByOrder = new Map((deliveriesResult.data || []).map(delivery => [delivery.order_id, delivery]));
  const providerDeliveryByOrder = new Map((providerDeliveryResult.data || []).map(delivery => [delivery.order_id, delivery]));
  const enrichedData = {
    ...data,
    providerDeliveryTrackingAvailable,
    buyerEmailThemeAvailable,
    recentOrders: (report.recentOrders as Array<Record<string, unknown> & TicketOrderReference>).map(order => {
      const buyerOrder = orderByReference.get(order.reference);
      const delivery = buyerOrder ? deliveryByOrder.get(buyerOrder.id) : undefined;
      const providerDelivery = buyerOrder ? providerDeliveryByOrder.get(buyerOrder.id) : undefined;
      return {
        ...order,
        orderId: buyerOrder?.id || '',
        buyerName: buyerOrder?.buyer_name || '',
        buyerEmail: buyerOrder?.buyer_email || '',
        buyerEmailTheme: buyerEmailThemeAvailable && buyerOrder && 'buyer_email_theme' in buyerOrder
          ? buyerOrder.buyer_email_theme
          : null,
        selections: buyerOrder ? (itemsByOrder.get(buyerOrder.id) || []).map(item => ({
          name: item.ticket_name_snapshot,
          quantity: item.quantity
        })) : [],
        emailStatus: delivery?.status || 'not_sent',
        emailAttempts: delivery?.attempts || 0,
        emailSentAt: delivery?.sent_at || null,
        emailError: delivery?.last_error || null,
        providerEmailStatus: providerDelivery?.provider_delivery_status || null,
        providerEmailUpdatedAt: providerDelivery?.provider_updated_at || null
      };
    })
  };

  return NextResponse.json(enrichedData, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
