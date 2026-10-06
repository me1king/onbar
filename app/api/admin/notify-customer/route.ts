import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminSession, hasAdminPermission, isInternalRequest, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getPublicBaseUrl } from '@/lib/utils';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
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

  if (!internal && !session) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  }
  if (!internal && !hasAdminPermission(session, 'can_manage_communications')) {
    return NextResponse.json({ error: 'Communications permission required.' }, { status: 403 });
  }
  if (!internal && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  let body: { orderId?: unknown; status?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid order notification is required.' }, { status: 400 });
  }

  const orderId = Number(body.orderId);
  const status = body.status;
  if (!Number.isSafeInteger(orderId) || orderId < 1 || !['Paid', 'Dispatched', 'Delivered'].includes(String(status))) {
    return NextResponse.json({ error: 'A valid order and notification status are required.' }, { status: 400 });
  }
  if (internal && status !== 'Paid') {
    return NextResponse.json({ error: 'Internal notifications may only report verified payments.' }, { status: 403 });
  }
  if (!resend) {
    return NextResponse.json({ error: 'Customer email is not configured.' }, { status: 503 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Order verification is not configured.' }, { status: 503 });

  const { data: order, error } = await database
    .from('orders')
    .select('id, customer_email, customer_name, status')
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    console.error('[CustomerNotification] Could not verify order:', error);
    return NextResponse.json({ error: 'Could not verify the order.' }, { status: 500 });
  }
  if (!order || order.status !== status) {
    return NextResponse.json({ error: 'The order does not currently have that status.' }, { status: 409 });
  }
  if (!order.customer_email) {
    return NextResponse.json({ error: 'No customer email is available for this order.' }, { status: 409 });
  }

  const content = {
    Paid: {
      subject: `Payment Confirmed for Order #${order.id}`,
      headline: "We've received your payment!",
      message: `Hello ${order.customer_name}, your payment for order #${order.id} has been successfully confirmed. We are now preparing your items for dispatch.`
    },
    Dispatched: {
      subject: `Your Order #${order.id} is on the way!`,
      headline: 'Good news, your order is moving!',
      message: `Hello ${order.customer_name}, your order #${order.id} has been dispatched and is currently with our rider. You should receive it shortly.`
    },
    Delivered: {
      subject: `Order #${order.id} Delivered`,
      headline: 'Delivery Complete!',
      message: `Hello ${order.customer_name}, your order #${order.id} has been successfully delivered. We hope you enjoy your selection!`
    }
  }[status as 'Paid' | 'Dispatched' | 'Delivered'];

  try {
    const result = await resend.emails.send({
      from: 'Online Bar Nairobi <onboarding@resend.dev>',
      to: order.customer_email,
      subject: content.subject,
      html: `<div style="font-family:sans-serif;padding:20px;color:#333"><h1 style="color:#ff6b00">${escapeHtml(content.headline)}</h1><p>${escapeHtml(content.message)}</p><p>Track your order: <a href="${escapeHtml(getPublicBaseUrl())}/track">Track Order</a></p><hr/><p style="font-size:12px;color:#999">Online Bar Nairobi</p></div>`
    });
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true });
  } catch (sendError) {
    console.error('[CustomerNotification] Could not send notification:', sendError);
    return NextResponse.json({ error: 'Failed to send notification.' }, { status: 500 });
  }
}
