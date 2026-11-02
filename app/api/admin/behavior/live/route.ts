import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const PRIVATE_PATHS = ['/admin', '/lord', '/merchant', '/profile', '/track', '/payment', '/rider', '/supplier', '/api', '/checkout'];

function safePath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return 'Page not recorded';
  const path = value.split(/[?#]/, 1)[0].slice(0, 240);
  if (PRIVATE_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return 'Private page';
  return path || '/';
}

function deviceType(value: unknown): 'Mobile' | 'Desktop' | 'Unknown' {
  if (!value || typeof value !== 'object') return 'Unknown';
  const info = value as { ua?: unknown; user_agent?: unknown };
  const ua = typeof info.ua === 'string' ? info.ua : typeof info.user_agent === 'string' ? info.user_agent : '';
  if (!ua) return 'Unknown';
  return /android|iphone|ipad|ipod|mobile/i.test(ua) ? 'Mobile' : 'Desktop';
}

function getNairobiDayStart() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    -3
  )).toISOString();
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || !['owner', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const activeSince = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const dayStart = getNairobiDayStart();

  const { data: sessionRows, error: sessionError } = await database
    .from('customer_sessions')
    .select('id,entry_page,current_page,last_seen_at,total_active_time_sec,cart_value,session_status,device_info,analytics_consent_updated_at')
    .eq('analytics_consent', true)
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })
    .limit(100);
  if (sessionError) {
    console.error('[LiveBehavior] Could not load consented sessions:', sessionError);
    const migrationMissing = sessionError.code === '42703' || /analytics_consent/i.test(sessionError.message);
    return NextResponse.json({
      error: migrationMissing
        ? 'Live journey consent fields are not installed. Apply supabase/LIVE_CUSTOMER_JOURNEY_MIGRATION.sql.'
        : 'Live customer sessions could not be loaded.'
    }, { status: 503 });
  }

  const sessionIds = (sessionRows || []).map(row => row.id);
  const [eventResult, activeResult, productResult, checkoutResult, cartResult, orderResult, deliveryResult] = await Promise.all([
    sessionIds.length
      ? database.from('analytics_events')
        .select('id,event_name,session_id,page_url,created_at')
        .in('session_id', sessionIds)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500)
      : Promise.resolve({ data: [], error: null }),
    database.from('customer_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('analytics_consent', true)
      .gte('last_seen_at', activeSince),
    sessionIds.length
      ? database.from('analytics_events').select('id', { count: 'exact', head: true })
        .eq('event_name', 'PRODUCT_VIEW').in('session_id', sessionIds).gte('created_at', dayStart)
      : Promise.resolve({ count: 0, error: null }),
    sessionIds.length
      ? database.from('analytics_events').select('id', { count: 'exact', head: true })
        .eq('event_name', 'CHECKOUT_START').in('session_id', sessionIds).gte('created_at', dayStart)
      : Promise.resolve({ count: 0, error: null }),
    database.from('customer_sessions').select('id', { count: 'exact', head: true })
      .eq('analytics_consent', true).gte('last_seen_at', since).gt('cart_value', 0),
    database.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', dayStart),
    database.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'Dispatched')
  ]);
  const queryError = eventResult.error || activeResult.error || productResult.error
    || checkoutResult.error || cartResult.error || orderResult.error || deliveryResult.error;
  if (queryError) {
    console.error('[LiveBehavior] Could not load live analytics:', queryError);
    return NextResponse.json({ error: 'Live customer activity could not be loaded.' }, { status: 503 });
  }

  const sessions = (sessionRows || []).map(row => {
    const journey = (eventResult.data || [])
      .filter(event => event.session_id === row.id)
      .map(event => ({
        event: event.event_name,
        path: safePath(event.page_url),
        at: event.created_at
      }));
    const device = deviceType(row.device_info);
    const idTail = row.id.slice(-6).toUpperCase();
    return {
      id: row.id,
      session_code: idTail,
      customer_name: `Visitor ${idTail}`,
      device,
      location: safePath(row.current_page || row.entry_page),
      entry_page: safePath(row.entry_page),
      journey: journey.slice(0, 30),
      active_time_sec: Math.max(0, Number(row.total_active_time_sec) || 0),
      has_cart: Number(row.cart_value) > 0,
      last_seen_at: row.last_seen_at,
      last_action: journey[0]?.event || 'PAGE_VIEW',
      session_status: new Date(row.last_seen_at).getTime() >= now.getTime() - 5 * 60 * 1000
        ? 'ACTIVE'
        : 'IDLE'
    };
  });

  const events = (eventResult.data || []).slice(0, 50).map(event => ({
    id: event.id,
    timestamp: event.created_at,
    customer_code: event.session_id ? `Visitor ${event.session_id.slice(-6).toUpperCase()}` : 'Visitor',
    session_id: event.session_id,
    action_type: event.event_name,
    description: event.event_name.replace(/_/g, ' ').toLowerCase(),
    page_url: safePath(event.page_url)
  }));

  const { data: recentOrders, error: recentOrdersError } = await database
    .from('orders')
    .select('id,status,customer_name,total_price,created_at,rider_name,rider_phone')
    .gte('created_at', dayStart)
    .order('created_at', { ascending: false })
    .limit(100);
  if (recentOrdersError) {
    console.error('[LiveBehavior] Could not load live order flow:', recentOrdersError);
    return NextResponse.json({ error: 'Live order flow could not be loaded.' }, { status: 503 });
  }
  const orderFlowEvents = (recentOrders || []).map(order => ({
    id: -Number(order.id),
    timestamp: order.created_at,
    customer_code: `Order #${order.id}`,
    session_id: null,
    action_type: `ORDER_${String(order.status || 'PENDING').replace(/\s+/g, '_').toUpperCase()}`,
    description: `${String(order.status || 'pending').replace(/_/g, ' ').toLowerCase()} order for ${order.customer_name || 'customer'}`,
    page_url: '/admin/orders'
  }));
  const liveEvents = [...events, ...orderFlowEvents]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 100);

  return NextResponse.json({
    sessions,
    events: liveEvents,
    orders: recentOrders || [],
    metrics: {
      activeSessions: activeResult.count || 0,
      productViews: productResult.count || 0,
      cartsWithItems: cartResult.count || 0,
      checkoutsStarted: checkoutResult.count || 0,
      ordersToday: orderResult.count || 0,
      activeDeliveries: deliveryResult.count || 0
    },
    refreshedAt: now.toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
