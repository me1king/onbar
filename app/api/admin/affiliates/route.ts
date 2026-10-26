import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { getPublicBaseUrl } from '@/lib/utils';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

export const dynamic = 'force-dynamic';

async function getAdminDatabase(request?: Request, mutation = false) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  const canManageAffiliates = session?.role === 'owner' || session?.permissions?.can_manage_affiliates === true;
  if (!session || !canManageAffiliates) {
    return { response: NextResponse.json({ error: 'Affiliate management access required.' }, { status: 403 }) };
  }
  if (mutation && (!request || !isSameOriginRequest(request))) {
    return { response: NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }
  return {
    client: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    session
  };
}

export async function GET() {
  const result = await getAdminDatabase();
  if ('response' in result) return result.response;

  const { data: applications, error } = await result.client
    .from('affiliates')
    .select('id, user_id, business_name, bio, audience_size, primary_channels, preferred_payout_method, payout_details, verification_status, commission_rate_override, created_at');
  if (error) {
    console.error('[AdminAffiliates] Could not load applications:', error);
    return NextResponse.json({ error: `Could not load affiliate applications: ${error.message}` }, { status: 500 });
  }

  const { data: performance, error: performanceError } = await result.client
    .from('affiliate_performance_summary')
    .select('affiliate_id, full_name, email, referral_code, affiliate_tier, status, clicks, conversions, total_revenue, available_earnings, pending_earnings, last_conversion_at');
  if (performanceError) {
    console.error('[AdminAffiliates] Could not load affiliate performance:', performanceError);
    return NextResponse.json({ error: `Could not load affiliate performance: ${performanceError.message}` }, { status: 500 });
  }

  const { data: invitationRows, error: invitationsError } = await result.client
    .from('affiliate_invitations')
    .select('id, email, business_name, commission_rate, created_at, expires_at, accepted_at, revoked_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (invitationsError) {
    console.error('[AdminAffiliates] Could not load invitations:', invitationsError);
    return NextResponse.json({
      error: 'Could not load affiliate invitations. Apply supabase/AFFILIATE_INVITATIONS_MIGRATION.sql and try again.'
    }, { status: 503 });
  }

  const performanceById = new Map((performance || []).map(row => [row.affiliate_id, row]));
  const affiliates = (applications || []).map(application => {
    const stats = performanceById.get(application.user_id);
    return {
      affiliate_id: application.user_id,
      full_name: stats?.full_name || application.business_name,
      email: stats?.email || '',
      referral_code: stats?.referral_code || '',
      affiliate_tier: stats?.affiliate_tier || 'Explorer',
      status: application.verification_status,
      clicks: Number(stats?.clicks || 0),
      conversions: Number(stats?.conversions || 0),
      total_revenue: Number(stats?.total_revenue || 0),
      available_earnings: Number(stats?.available_earnings || 0),
      pending_earnings: Number(stats?.pending_earnings || 0),
      last_conversion_at: stats?.last_conversion_at || null,
      business_name: application.business_name,
      bio: application.bio,
      audience_size: application.audience_size,
      primary_channels: application.primary_channels || [],
      preferred_payout_method: application.preferred_payout_method,
      payout_details: application.payout_details,
      created_at: application.created_at
    };
  });

  const invitations = (invitationRows || []).map(invitation => ({
    ...invitation,
    status: invitation.accepted_at ? 'Accepted'
      : invitation.revoked_at ? 'Revoked'
        : new Date(invitation.expires_at) <= new Date() ? 'Expired' : 'Invited'
  }));

  return NextResponse.json({ affiliates, invitations }, { headers: { 'Cache-Control': 'no-store' } });
}

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
  const result = await getAdminDatabase(request, true);
  if ('response' in result) return result.response;

  let body: { email?: unknown; businessName?: unknown; commissionRate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Valid affiliate invitation details are required.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
  const commissionRate = Number(body.commissionRate);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320
    || businessName.length < 2 || businessName.length > 120
    || !Number.isFinite(commissionRate) || commissionRate <= 0 || commissionRate > 100) {
    return NextResponse.json({ error: 'Enter a valid email and display name, and set a commission rate greater than 0 and no more than 100.' }, { status: 400 });
  }

  const { data: existingInvitation, error: existingError } = await result.client
    .from('affiliate_invitations')
    .select('id')
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existingError) {
    console.error('[AdminAffiliates] Could not check existing invitation:', existingError);
    return NextResponse.json({ error: 'Could not check existing invitations. Apply the affiliate invitations migration.' }, { status: 503 });
  }
  if (existingInvitation) {
    return NextResponse.json({ error: 'This email already has an active invitation.' }, { status: 409 });
  }

  const { data: profile } = await result.client.from('profiles').select('id').ilike('email', email).limit(1).maybeSingle();
  if (profile) {
    const { data: affiliate, error: affiliateError } = await result.client.from('affiliates')
      .select('verification_status').eq('user_id', profile.id).maybeSingle();
    if (affiliateError) {
      console.error('[AdminAffiliates] Could not check existing affiliate:', affiliateError);
      return NextResponse.json({ error: 'Could not check the recipient’s affiliate status.' }, { status: 500 });
    }
    if (affiliate && ['Pending', 'Verified', 'Suspended'].includes(affiliate.verification_status)) {
      return NextResponse.json({ error: 'This account already has an active affiliate record.' }, { status: 409 });
    }
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const invitationUrl = `${getPublicBaseUrl()}/affiliate/register?invite=${encodeURIComponent(token)}`;
  const { data: invitation, error: insertError } = await result.client
    .from('affiliate_invitations')
    .insert({
      email,
      business_name: businessName,
      commission_rate: commissionRate,
      token_hash: tokenHash,
      invited_by: result.session?.email || 'Online Bar Admin',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select('id, email, business_name, commission_rate, created_at, expires_at')
    .single();
  if (insertError || !invitation) {
    console.error('[AdminAffiliates] Could not create invitation:', insertError);
    return NextResponse.json({ error: 'Could not create the affiliate invitation.' }, { status: 500 });
  }

  let emailSent = false;
  let emailError: string | undefined;
  const emailConfig = getTransactionalEmailConfig();
  if (emailConfig.configured && emailConfig.from) {
    try {
      await sendTransactionalEmail({
        from: emailConfig.from,
        to: email,
        subject: 'You’re invited to the Online Bar Affiliate Program',
        html: `<div style="font-family:sans-serif;color:#17202a;line-height:1.6"><h1>You’re invited, ${escapeHtml(businessName)}</h1><p>Online Bar has invited you to join its affiliate program at a commission rate of ${commissionRate}%.</p><p>This invitation is for <strong>${escapeHtml(email)}</strong> and expires in 7 days. Sign in or create an account with this email address to accept.</p><p><a href="${escapeHtml(invitationUrl)}" style="display:inline-block;padding:12px 20px;background:#d91c1c;color:white;text-decoration:none;border-radius:8px">Accept your invitation</a></p><p>If you were not expecting this invitation, you can ignore this email.</p></div>`,
        text: `You’re invited to join the Online Bar Affiliate Program at a commission rate of ${commissionRate}%. This invitation is for ${email} and expires in 7 days. Accept: ${invitationUrl}`
      });
      emailSent = true;
    } catch (error) {
      console.error('[AdminAffiliates] Invitation created but email could not be sent:', error);
      emailError = 'Invitation was created, but the email could not be sent. Copy the invite link and send it manually.';
    }
  } else {
    emailError = 'Invitation created. Configure JMSURF_MAIL_KEY and JMSURF_FROM_EMAIL to email invitations automatically; copy the invite link to share it manually.';
  }

  return NextResponse.json({
    invitation,
    inviteUrl: invitationUrl,
    emailSent,
    emailError
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const result = await getAdminDatabase(request, true);
  if ('response' in result) return result.response;

  let body: { affiliateId?: unknown; status?: unknown; invitationId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid affiliate decision is required.' }, { status: 400 });
  }
  if (body.action === 'revoke_invitation') {
    const invitationId = typeof body.invitationId === 'string' ? body.invitationId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
      return NextResponse.json({ error: 'Select a valid invitation.' }, { status: 400 });
    }
    const { data, error } = await result.client.from('affiliate_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', invitationId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[AdminAffiliates] Could not revoke invitation:', error);
      return NextResponse.json({ error: 'Could not revoke this invitation.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'This invitation is already accepted, expired, or revoked.' }, { status: 409 });
    return NextResponse.json({ success: true });
  }

  const affiliateId = typeof body.affiliateId === 'string' ? body.affiliateId : '';
  const status = body.status;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(affiliateId) || !['Verified', 'Rejected'].includes(String(status))) {
    return NextResponse.json({ error: 'Select a valid application and approval decision.' }, { status: 400 });
  }

  const { data, error } = await result.client
    .from('affiliates')
    .update({ verification_status: status, updated_at: new Date().toISOString() })
    .eq('user_id', affiliateId)
    .eq('verification_status', 'Pending')
    .select('user_id')
    .maybeSingle();
  if (error) {
    console.error('[AdminAffiliates] Could not update application:', error);
    return NextResponse.json({ error: `Could not update affiliate application: ${error.message}` }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Pending affiliate application not found.' }, { status: 404 });
  return NextResponse.json({ success: true, status });
}
