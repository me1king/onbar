import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const tokenPattern = /^[A-Za-z0-9_-]{40,64}$/;

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function invalidLink() {
  return NextResponse.json(
    { error: 'This company onboarding link is invalid, expired, or already used. Contact the person who invited you.' },
    {
      status: 410,
      headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' }
    }
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!tokenPattern.test(token)) return invalidLink();

  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Company onboarding is temporarily unavailable.' }, { status: 503 });
  }
  const cookieStore = await cookies();
  const editorRole = await verifySessionCookie(cookieStore.get('admin_session')?.value) ? 'admin' : 'merchant';

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: branchInvite, error: branchInviteError } = await database
    .from('merchant_business_branch_invites')
    .select('business_id,expires_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .is('used_application_id', null)
    .maybeSingle();
  if (branchInviteError && !['42P01', 'PGRST205'].includes(branchInviteError.code || '')) {
    console.error('[MerchantOnboardingInvite] Could not verify branch link:', branchInviteError);
    return NextResponse.json({ error: 'Branch onboarding could not be loaded.' }, { status: 503 });
  }
  if (branchInvite) {
    const { data: business, error: businessError } = await database.from('merchant_businesses')
      .select('business_name,business_type')
      .eq('id', branchInvite.business_id)
      .maybeSingle();
    if (businessError) {
      console.error('[MerchantOnboardingInvite] Could not load branch business:', businessError);
      return NextResponse.json({ error: 'Branch onboarding could not be loaded.' }, { status: 503 });
    }
    if (!business || !['bar', 'food_vendor', 'supplier'].includes(business.business_type)) {
      return invalidLink();
    }
    const vendorType = business.business_type === 'bar'
      ? 'retailer'
      : business.business_type === 'supplier'
        ? 'wholesaler'
        : 'street_food';
    return NextResponse.json({
      invitation: {
        businessName: business.business_name,
        vendorType,
        businessType: business.business_type,
        expiresAt: branchInvite.expires_at,
        editorRole
      }
    }, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Referrer-Policy': 'no-referrer'
      }
    });
  }

  let inviteResult = await database.from('vendor_onboarding_leads')
    .select('id,business_name,vendor_type,invite_expires_at,onboarding_mode,onboarding_step_owners')
    .eq('invite_token_hash', tokenHash)
    .gt('invite_expires_at', new Date().toISOString())
    .is('invite_used_at', null)
    .is('invite_application_id', null)
    .maybeSingle();

  let sharedOnboardingEnabled = true;
  if (inviteResult.error && /onboarding_mode|onboarding_step_owners/i.test(inviteResult.error.message)) {
    sharedOnboardingEnabled = false;
    inviteResult = await database.from('vendor_onboarding_leads')
      .select('id,business_name,vendor_type,invite_expires_at')
      .eq('invite_token_hash', tokenHash)
      .gt('invite_expires_at', new Date().toISOString())
      .is('invite_used_at', null)
      .is('invite_application_id', null)
      .maybeSingle();
  }
  const { data, error } = inviteResult;
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /invite_token_hash/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Private onboarding links are not configured yet. Contact the OnBar team.' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
      );
    }
    console.error('[MerchantOnboardingInvite] Could not verify company link:', error);
    return NextResponse.json({ error: 'Company onboarding could not be loaded.' }, { status: 503 });
  }
  if (!data || !['retailer', 'wholesaler', 'street_food'].includes(data.vendor_type)) {
    return invalidLink();
  }
  let draft = null;
  if (sharedOnboardingEnabled) {
    const draftResult = await database.from('vendor_onboarding_drafts')
      .select('form_data,current_step,updated_at')
      .eq('lead_id', data.id)
      .maybeSingle();
    if (draftResult.error) {
      console.error('[MerchantOnboardingInvite] Could not load saved progress:', draftResult.error);
      return NextResponse.json({ error: 'Saved company progress could not be loaded. Ask the OnBar team to check the shared onboarding setup.' }, { status: 503 });
    }
    draft = draftResult.data;
  }
  const { error: eventError } = await database.from('vendor_onboarding_events').insert({
    lead_id: data.id,
    event_type: 'onboarding_link_opened',
    actor: editorRole === 'admin' ? 'onboarding_admin' : 'applicant',
    details: { source: 'invite_link', editor_role: editorRole }
  });
  if (eventError) {
    console.error('[MerchantOnboardingInvite] Could not record link opening:', eventError);
    return NextResponse.json({ error: 'The onboarding link could not be recorded. Please try again.' }, { status: 503 });
  }

  const businessType = data.vendor_type === 'retailer'
    ? 'bar'
    : data.vendor_type === 'wholesaler'
      ? 'supplier'
      : 'food_vendor';
  return NextResponse.json({
    invitation: {
      businessName: data.business_name,
      vendorType: data.vendor_type,
      businessType,
      expiresAt: data.invite_expires_at,
      onboardingMode: sharedOnboardingEnabled ? data.onboarding_mode : undefined,
      stepOwners: sharedOnboardingEnabled ? data.onboarding_step_owners : undefined,
      editorRole,
      draft: draft ? {
        formData: draft.form_data,
        currentStep: draft.current_step,
        updatedAt: draft.updated_at
      } : null
    }
  }, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
