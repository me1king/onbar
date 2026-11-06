import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { normalizeTicketPhoneNumber } from '@/lib/ticketing/phone';

export const dynamic = 'force-dynamic';

function phoneVariants(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return [];

  const national = digits.startsWith('254')
    ? digits.slice(3)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;

  return [...new Set([
    value.trim(),
    digits,
    national,
    `0${national}`,
    `254${national}`,
    `+254${national}`
  ].filter(Boolean))];
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Workspace access is not configured on this server.' }, { status: 503 });
  }
  if (!token) {
    return NextResponse.json({ error: 'Sign in to view your approved workspaces.' }, { status: 401 });
  }

  const authClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const user = authData.user;
  const emailVerified = Boolean(user?.email && (user.email_confirmed_at || user.confirmed_at));
  if (authError || !user || !(emailVerified || user.phone_confirmed_at)) {
    return NextResponse.json({ error: 'A verified account is required to view workspace access.' }, { status: 401 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: linkedApplications, error: linkedApplicationsError } = await database
    .from('merchant_applications')
    .select('id, business_name, status, offered_goods, offered_goods_pricing')
    .eq('account_user_id', user.id)
    .order('submitted_at', { ascending: false })
    .limit(25);

  if (linkedApplicationsError) {
    console.error('[ProfileWorkspaces] Could not load account workspace access:', linkedApplicationsError);
    if (linkedApplicationsError && /account_user_id|schema cache/i.test(linkedApplicationsError.message)) {
      return NextResponse.json({ error: 'Merchant account linking is not installed yet. Run supabase/MERCHANT_APPLICATION_ACCOUNT_LINK_MIGRATION.sql.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Your approved workspace access could not be checked.' }, { status: 503 });
  }

  let applications = linkedApplications || [];
  if (!applications.length && emailVerified && user.email) {
    const { data: legacyApplications, error: legacyApplicationsError } = await database.from('merchant_applications')
      .select('id, business_name, status, offered_goods, offered_goods_pricing')
      .eq('email', user.email.toLowerCase())
      .order('submitted_at', { ascending: false })
      .limit(25);
    if (legacyApplicationsError) {
      console.error('[ProfileWorkspaces] Could not load legacy merchant workspace access:', legacyApplicationsError);
      return NextResponse.json({ error: 'Your approved workspace access could not be checked.' }, { status: 503 });
    }
    applications = legacyApplications || [];
  }

  const verifiedEmail = emailVerified && user.email ? user.email.trim().toLowerCase() : null;
  const verifiedPhone = user.phone_confirmed_at && user.phone
    ? normalizeTicketPhoneNumber(user.phone)
    : null;
  const riderCandidates: Array<{ rider_phone: string; rider_name: string; rider_email?: string | null }> = [];
  if (verifiedEmail) {
    const { data: riders, error: ridersError } = await database
      .from('rider_status')
      .select('rider_phone, rider_name, rider_email, verification_status')
      .eq('verification_status', 'Verified')
      .eq('rider_email', verifiedEmail)
      .limit(3);
    if (ridersError) {
      console.error('[ProfileWorkspaces] Could not check rider email access:', ridersError);
      if (!verifiedPhone || !/rider_email|schema cache/i.test(ridersError.message)) {
        return NextResponse.json({
          error: /rider_email|schema cache/i.test(ridersError.message)
            ? 'Rider email linking is not installed. Apply supabase/RIDER_EMAIL_COMMUNICATIONS_MIGRATION.sql or use the verified phone on your OnlineBar account.'
            : 'Your approved workspace access could not be checked.'
        }, { status: 503 });
      }
    } else {
      riderCandidates.push(...(riders || []).filter(rider =>
        rider.rider_email?.trim().toLowerCase() === verifiedEmail
      ));
    }
  }
  if (verifiedPhone) {
    const variants = phoneVariants(verifiedPhone);
    const { data: riders, error: ridersError } = await database
      .from('rider_status')
      .select('rider_phone, rider_name, verification_status')
      .in('rider_phone', variants)
      .limit(10);
    if (ridersError) {
      console.error('[ProfileWorkspaces] Could not check rider approval:', ridersError);
      return NextResponse.json({ error: 'Your approved workspace access could not be checked.' }, { status: 503 });
    }
    riderCandidates.push(...(riders || []).filter(rider =>
      rider.verification_status === 'Verified'
      && normalizeTicketPhoneNumber(rider.rider_phone) === verifiedPhone
    ));
  }
  const approvedRiders = [...new Map(riderCandidates
    .filter(rider => rider.rider_phone)
    .map(rider => [normalizeTicketPhoneNumber(rider.rider_phone) || rider.rider_phone, rider])
  ).values()];
  const riderApproved = approvedRiders.length === 1;

  return NextResponse.json({
    merchantApplications: (applications || []).map(application => ({
      id: application.id,
      businessName: application.business_name,
      status: application.status,
      offeredGoods: Array.isArray(application.offered_goods)
        ? application.offered_goods.filter((good): good is string => typeof good === 'string')
        : [],
      offeredGoodsPricing: Array.isArray(application.offered_goods_pricing)
        ? application.offered_goods_pricing.filter((offer): offer is { product_id: number; product_name: string; price: number; currency: string } =>
          typeof offer === 'object'
          && offer !== null
          && typeof offer.product_id === 'number'
          && typeof offer.product_name === 'string'
          && typeof offer.price === 'number'
          && typeof offer.currency === 'string'
        )
        : []
    })),
    riderApproved,
    riderName: riderApproved ? approvedRiders[0].rider_name : null,
    riderAccessUnavailableReason: approvedRiders.length > 1
      ? 'More than one approved rider account matches this profile. Contact dispatch to correct the account link.'
      : null
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
