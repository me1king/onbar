import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getPublicBaseUrl } from '@/lib/utils';

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
    .from('rider_status')
    .update({ verification_status: 'Verified', pin })
    .eq('rider_phone', phone)
    .select('rider_phone,rider_name,rider_email')
    .maybeSingle();

  if (error) {
    console.error('[AdminDispatch] Could not verify rider:', error);
    const migrationMissing = ['42703', 'PGRST204', 'PGRST205'].includes(error.code || '');
    return NextResponse.json({
      error: migrationMissing
        ? 'Rider email storage is not installed. Apply supabase/RIDER_EMAIL_COMMUNICATIONS_MIGRATION.sql, then retry approval.'
        : 'Could not authorize rider. Please retry or check the server logs.'
    }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Rider was not found.' }, { status: 404 });

  const riderEmail = typeof data.rider_email === 'string' ? data.rider_email.trim() : '';
  if (!riderEmail) {
    return NextResponse.json({
      success: true,
      pin,
      emailSent: false,
      emailWarning: 'No rider email is on file. Share the sign-in PIN with the rider manually.'
    });
  }

  const riderName = typeof data.rider_name === 'string' ? data.rider_name.trim() : 'Rider';
  const terminalUrl = `${getPublicBaseUrl()}/rider/dashboard`;
  const safeName = escapeHtml(riderName);
  try {
    await sendTransactionalEmail({
      to: riderEmail,
      subject: 'Your Online Bar rider account is approved',
      text: `Hi ${riderName}, your Online Bar rider account has been approved. Open your rider terminal at ${terminalUrl}. Sign in with your phone number and this four-digit PIN: ${pin}. Keep the PIN private.`,
      html: `<p>Hi ${safeName},</p><p>Your Online Bar rider account has been approved.</p><p><a href="${terminalUrl}">Open your rider terminal</a> and sign in with your phone number and this four-digit PIN:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${pin}</p><p>Keep this PIN private. You can reopen the terminal from your approved Online Bar profile.</p>`,
      idempotencyKey: `rider-approval:${data.rider_phone}:${pin}`
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
