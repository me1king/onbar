import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminSession, hasAdminPermission, isInternalRequest, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getPublicBaseUrl } from '@/lib/utils';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

export async function POST(request: Request) {
  const internal = isInternalRequest(request);
  const session = internal ? null : await getAdminSession();
  if (!internal && !session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!internal && !hasAdminPermission(session, 'can_manage_communications')) {
    return NextResponse.json({ error: 'Communications permission required.' }, { status: 403 });
  }
  if (!internal && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  let body: { type?: unknown; details?: Record<string, unknown> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid notification is required.' }, { status: 400 });
  }
  if (typeof body.type !== 'string' || !body.details || typeof body.details !== 'object') {
    return NextResponse.json({ error: 'A valid notification is required.' }, { status: 400 });
  }
  if (!resend) return NextResponse.json({ error: 'Email is not configured.' }, { status: 503 });

  const database = createServerSupabaseClient();
  let adminEmail = process.env.ADMIN_EMAIL;
  if (database) {
    const { data, error } = await database.from('settings').select('value')
      .eq('key', 'contact').eq('is_published', true).maybeSingle();
    if (error) {
      console.error('[AdminNotification] Could not load notification recipient:', error);
      return NextResponse.json({ error: 'Could not load notification settings.' }, { status: 500 });
    }
    if (typeof data?.value?.email === 'string') adminEmail = data.value.email;
  }
  if (!adminEmail) return NextResponse.json({ error: 'Notification recipient is not configured.' }, { status: 503 });

  const details = Object.fromEntries(
    Object.entries(body.details).map(([key, value]) => [key, escapeHtml(value)])
  );
  let subject = 'System Notification - Online Bar Nairobi';
  let html = `<p>${escapeHtml(JSON.stringify(details))}</p>`;
  if (body.type === 'NEW_ORDER') {
    subject = `NEW ORDER RECEIVED: #${details.orderId}`;
    html = `<div style="font-family:sans-serif;padding:20px"><h2>New Order Alert</h2><p><b>Order ID:</b> #${details.orderId}</p><p><b>Customer:</b> ${details.customerName}</p><p><b>Total:</b> KSh ${details.amount}</p><p><b>Payment:</b> ${details.paymentMethod}</p><a href="${escapeHtml(getPublicBaseUrl())}/admin/orders">View Orders</a></div>`;
  } else if (body.type === 'LOW_STOCK') {
    subject = `LOW STOCK ALERT: ${details.productName}`;
    html = `<div style="font-family:sans-serif;padding:20px"><h2>Stock Warning</h2><p><b>Product:</b> ${details.productName}</p><p><b>Remaining:</b> ${details.currentStock} units</p><a href="${escapeHtml(getPublicBaseUrl())}/admin/upload">Manage Inventory</a></div>`;
  }

  try {
    const result = await resend.emails.send({
      from: 'Online Bar Alerts <system@onlinebar.co.ke>',
      to: adminEmail,
      subject,
      html
    });
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[AdminNotification] Could not send notification:', error);
    return NextResponse.json({ error: 'Failed to send notification.' }, { status: 500 });
  }
}
