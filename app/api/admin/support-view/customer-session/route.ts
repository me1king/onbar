import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createDeliveryTrackingSession } from '@/lib/deliveryTrackingSession.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Order support-view access is required.' }, { status: 403 });
  }

  const orderId = Number(new URL(request.url).searchParams.get('orderId'));
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: 'Enter a valid order number.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Support view is not connected to the order database.' }, { status: 503 });
  }

  const { data: order, error } = await database.from('orders')
    .select('id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    console.error('[AdminSupportView] Could not verify customer tracking order:', error);
    return NextResponse.json({ error: 'Customer tracking could not be opened.' }, { status: 503 });
  }
  if (!order) return NextResponse.json({ error: 'No order was found with that number.' }, { status: 404 });

  try {
    const token = createDeliveryTrackingSession(orderId);
    return NextResponse.json({ token }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    console.error('[AdminSupportView] Could not create customer preview session:', error);
    return NextResponse.json({ error: 'Customer tracking preview is not configured on the server.' }, { status: 503 });
  }
}
