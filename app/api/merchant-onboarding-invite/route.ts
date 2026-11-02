import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
        expiresAt: branchInvite.expires_at
      }
    }, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Referrer-Policy': 'no-referrer'
      }
    });
  }

  const { data, error } = await database.from('vendor_onboarding_leads')
    .select('business_name,vendor_type,invite_expires_at')
    .eq('invite_token_hash', tokenHash)
    .gt('invite_expires_at', new Date().toISOString())
    .is('invite_used_at', null)
    .is('invite_application_id', null)
    .maybeSingle();

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
      expiresAt: data.invite_expires_at
    }
  }, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
