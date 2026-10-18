import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getCustomer(request: Request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('Customer authentication is not configured.');
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Your sign-in session is invalid. Please sign in again.');
  if (!data.user.email || !data.user.email_confirmed_at) {
    throw new Error('Verify the invited email address on your account before joining the affiliate program.');
  }
  return data.user;
}

export async function GET(request: Request) {
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Affiliate invitation service is not configured.' }, { status: 503 });

  let user;
  try {
    user = await getCustomer(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Your sign-in session is invalid.' }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: 'Sign in with the email address that received this invitation.' }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: 'The signed-in account does not have an email address.' }, { status: 401 });

  const token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return NextResponse.json({ error: 'This invitation link is invalid or incomplete.' }, { status: 400 });
  }
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: invitation, error } = await database.from('affiliate_invitations')
    .select('email, business_name, expires_at, accepted_at, accepted_user_id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) {
    console.error('[AffiliateInvitation] Could not validate invitation:', error);
    return NextResponse.json({ error: 'Could not validate the invitation. Apply the affiliate invitations migration.' }, { status: 503 });
  }
  if (!invitation) return NextResponse.json({ error: 'This invitation link is invalid.' }, { status: 404 });
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Sign in using the email address this invitation was sent to.' }, { status: 403 });
  }
  if (invitation.accepted_at) {
    if (invitation.accepted_user_id === user.id) {
      return NextResponse.json({ alreadyAccepted: true, businessName: invitation.business_name });
    }
    return NextResponse.json({ error: 'This invitation has already been accepted.' }, { status: 409 });
  }
  if (invitation.revoked_at) return NextResponse.json({ error: 'This invitation has been cancelled.' }, { status: 410 });
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This invitation has expired. Contact Online Bar for a new invitation.' }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    email: invitation.email,
    businessName: invitation.business_name,
    expiresAt: invitation.expires_at
  }, { headers: { 'Cache-Control': 'no-store' } });
}
