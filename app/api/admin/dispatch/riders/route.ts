import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getPublicBaseUrl } from '@/lib/utils';
import { renderRiderApprovalEmail } from '@/lib/lifecycleEmailPreviews';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider management permission is required.' }, { status: 403 });
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ riders: [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server-side rider database access is not configured.' }, { status: 503 });

  const { data, error } = await database
    .from('rider_status')
    .select('rider_name, rider_phone')
    .ilike('rider_name', `%${query}%`)
    .limit(2);
  if (error) {
    console.error('[AdminDispatch] Could not search riders:', error);
    return NextResponse.json({ error: 'Rider search is unavailable.' }, { status: 500 });
  }
  return NextResponse.json({ riders: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider management permission is required.' }, { status: 403 });
  }

  let body: { phone?: unknown };
  try {
    body = await request.json() as { phone?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone || phone.length > 50) {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side rider database access is not configured.' }, { status: 503 });
  }

  const pin = String(randomInt(1000, 10000));
  const { data, error } = await database
    .rpc('admin_set_rider_pin', {
      phone_input: phone,
      pin_input: pin,
      action_input: 'approved',
      actor_input: session.email || session.role
    });

  if (error) {
    console.error('[AdminDispatch] Could not verify rider:', error);
    if (/admin_set_rider_pin/i.test(error.message)) {
      return NextResponse.json({
        error: 'Rider PIN security setup is missing. Apply supabase/RIDER_ACCOUNT_PIN_RESET_MIGRATION.sql, then retry.'
      }, { status: 503 });
    }
    const migrationMissing = ['42703', 'PGRST204', 'PGRST205'].includes(error.code || '');
    return NextResponse.json({
      error: migrationMissing
        ? 'Rider email storage is not installed. Apply supabase/RIDER_EMAIL_COMMUNICATIONS_MIGRATION.sql, then retry approval.'
        : 'Could not authorize rider. Please retry or check the server logs.'
    }, { status: 500 });
  }
  const updatedRider = Array.isArray(data) ? data[0] : data;
  if (!updatedRider) return NextResponse.json({ error: 'Rider was not found or is no longer eligible for approval.' }, { status: 404 });
  const { data: riderContact, error: contactError } = await database
    .from('rider_status')
    .select('rider_email')
    .eq('rider_phone', updatedRider.rider_phone)
    .maybeSingle();
  if (contactError) {
    console.error('[AdminDispatch] Rider approved, but rider email could not be loaded:', contactError);
  }

  const riderEmail = typeof riderContact?.rider_email === 'string' ? riderContact.rider_email.trim() : '';
  if (!riderEmail) {
    return NextResponse.json({
      success: true,
      pin,
      emailSent: false,
      emailWarning: 'No rider email is on file. Share the sign-in PIN with the rider manually.'
    });
  }

  const riderName = typeof data.rider_name === 'string' ? data.rider_name.trim() : 'Rider';
  const terminalUrl = `${getPublicBaseUrl()}/rider?account=1`;
  const email = renderRiderApprovalEmail({ riderName, pin, terminalUrl });
  try {
    await sendTransactionalEmail({
      to: riderEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      idempotencyKey: `rider-approval:${updatedRider.rider_phone}:${pin}`
    });
    return NextResponse.json({ success: true, emailSent: true });
  } catch (emailError) {
    console.error('[AdminDispatch] Rider approved, but onboarding email could not be sent:', emailError);
    return NextResponse.json({
      success: true,
      pin,
      emailSent: false,
      emailWarning: 'Approval was saved, but the onboarding email could not be sent. Share the PIN manually and check Email Command Center.'
    });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider management permission is required.' }, { status: 403 });
  }

  let body: { phone?: unknown };
  try {
    body = await request.json() as { phone?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone || phone.length > 50) {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side rider database access is not configured.' }, { status: 503 });
  }
  const { data, error } = await database.rpc('admin_set_rider_pin', {
    phone_input: phone,
    pin_input: '0000',
    action_input: 'pin_reset',
    actor_input: session.email || session.role
  });
  if (error) {
    console.error('[AdminDispatch] Could not reset rider PIN:', error);
    return NextResponse.json({
      error: /admin_set_rider_pin/i.test(error.message)
        ? 'Rider PIN security setup is missing. Apply supabase/RIDER_ACCOUNT_PIN_RESET_MIGRATION.sql first.'
        : 'Rider PIN could not be reset. Please retry or check the server logs.'
    }, { status: 503 });
  }
  const rider = Array.isArray(data) ? data[0] : data;
  if (!rider) {
    return NextResponse.json({ error: 'No approved rider was found for that phone number.' }, { status: 404 });
  }

  const { data: contact, error: contactError } = await database.from('rider_status')
    .select('rider_email')
    .eq('rider_phone', rider.rider_phone)
    .maybeSingle();
  if (contactError) {
    console.error('[AdminDispatch] PIN reset succeeded, but rider email could not be loaded:', contactError);
  }

  const riderEmail = typeof contact?.rider_email === 'string' ? contact.rider_email.trim() : '';
  if (!riderEmail) {
    return NextResponse.json({
      success: true,
      emailSent: false,
      emailWarning: 'PIN reset. Share the temporary PIN 0000 directly with the rider.'
    });
  }

  try {
    const terminalUrl = `${getPublicBaseUrl()}/rider/dashboard?phone=${encodeURIComponent(rider.rider_phone)}`;
    await sendTransactionalEmail({
      to: riderEmail,
      subject: 'Your Online Bar rider PIN was reset',
      text: `Hi ${rider.rider_name}, an Online Bar administrator reset your rider sign-in PIN. Your temporary PIN is 0000. Sign in at ${terminalUrl} and change it in the Security section of your rider terminal. If you did not request this, contact Online Bar support immediately.`,
      html: `<p>Hi ${escapeHtml(rider.rider_name || 'Rider')},</p><p>An Online Bar administrator reset your rider sign-in PIN.</p><p>Your temporary PIN is <strong>0000</strong>.</p><p><a href="${escapeHtml(terminalUrl)}">Open your rider terminal</a> and change it in the Security section. If you did not request this, contact Online Bar support immediately.</p>`,
      idempotencyKey: `rider-pin-reset:${rider.rider_phone}:${Date.now()}`
    });
    return NextResponse.json({ success: true, emailSent: true });
  } catch (emailError) {
    console.error('[AdminDispatch] Rider PIN was reset, but the notification email failed:', emailError);
    return NextResponse.json({
      success: true,
      emailSent: false,
      emailWarning: 'PIN reset, but the rider email could not be sent. Share the temporary PIN 0000 directly.'
    });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider management permission is required.' }, { status: 403 });
  }

  let body: { phone?: unknown };
  try {
    body = await request.json() as { phone?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone || phone.length > 50) {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side rider database access is not configured.' }, { status: 503 });
  }

  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('rider_phone,verification_status')
    .eq('rider_phone', phone)
    .maybeSingle();
  if (riderError) {
    console.error('[AdminDispatch] Could not load rider before deactivation:', riderError);
    return NextResponse.json({ error: 'Rider status could not be checked; access was not changed.' }, { status: 503 });
  }
  if (!rider) return NextResponse.json({ error: 'Rider was not found.' }, { status: 404 });
  if (rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only an approved rider can be deactivated from this action.' }, { status: 409 });
  }

  const { count, error: activeOrdersError } = await database.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('rider_phone', rider.rider_phone)
    .in('status', ['Dispatched', 'Picked Up', 'Out for Delivery']);
  if (activeOrdersError) {
    console.error('[AdminDispatch] Could not check active rider deliveries:', activeOrdersError);
    return NextResponse.json({ error: 'Active deliveries could not be checked; rider access was not changed.' }, { status: 503 });
  }
  if ((count || 0) > 0) {
    return NextResponse.json({ error: 'This rider has an active delivery. Reassign or complete it before deactivation.' }, { status: 409 });
  }

  const { data: deactivatedRider, error: updateError } = await database.from('rider_status')
    .update({
      verification_status: 'Rejected',
      status: 'Offline',
      pin: null,
      updated_at: new Date().toISOString()
    })
    .eq('rider_phone', rider.rider_phone)
    .eq('verification_status', 'Verified')
    .select('rider_phone')
    .maybeSingle();
  if (updateError) {
    console.error('[AdminDispatch] Could not deactivate rider:', updateError);
    return NextResponse.json({ error: 'Rider access could not be deactivated.' }, { status: 503 });
  }
  if (!deactivatedRider) {
    return NextResponse.json({ error: 'Rider status changed before deactivation completed. Refresh and try again.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, phone: rider.rider_phone });
}
