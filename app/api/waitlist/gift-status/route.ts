import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getCustomer(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: NextResponse.json({ error: 'A signed-in account is required.' }, { status: 401 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !publicKey) {
    return { response: NextResponse.json({ error: 'Mystery gift status is not configured.' }, { status: 503 }) };
  }
  const auth = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) {
    return { response: NextResponse.json({ error: 'Your sign-in session is invalid or expired.' }, { status: 401 }) };
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return { response: NextResponse.json({ error: 'Mystery gift status is not configured.' }, { status: 503 }) };
  }
  return {
    user: data.user,
    database: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  };
}

export async function GET(request: Request) {
  const customer = await getCustomer(request);
  if ('response' in customer) return customer.response;
  const { database, user } = customer;

  try {
    let { data: member, error: memberError } = await database.from('market_waitlist')
      .select('id')
      .eq('converted_to_user', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!member && !memberError) {
      const fallback = await database.from('market_waitlist')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      member = fallback.data;
      memberError = fallback.error;
    }
    if (memberError) throw memberError;
    if (!member) {
      return NextResponse.json({ eligible: false, shouldShowWelcome: false }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data: events, error: eventsError } = await database.from('waitlist_lifecycle_events')
      .select('event_type,welcome_popup_seen_at')
      .eq('user_id', user.id)
      .in('event_type', ['account_created', 'first_purchase']);
    if (eventsError) throw eventsError;
    const accountEvent = events?.find(event => event.event_type === 'account_created');
    const hasPurchased = Boolean(events?.some(event => event.event_type === 'first_purchase'));
    return NextResponse.json({
      eligible: !hasPurchased,
      shouldShowWelcome: Boolean(accountEvent && !hasPurchased && !accountEvent.welcome_popup_seen_at)
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[WaitlistGiftStatus] Could not load mystery gift status:', error);
    return NextResponse.json({
      error: 'Mystery gift status could not be loaded. Apply supabase/WAITLIST_ACCOUNT_GIFT_MIGRATION.sql.'
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const customer = await getCustomer(request);
  if ('response' in customer) return customer.response;
  const { database, user } = customer;
  const { error } = await database.from('waitlist_lifecycle_events')
    .update({ welcome_popup_seen_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('event_type', 'account_created')
    .is('welcome_popup_seen_at', null);
  if (error) {
    console.error('[WaitlistGiftStatus] Could not record the welcome popup dismissal:', error);
    return NextResponse.json({ error: 'The welcome message could not be marked as seen.' }, { status: 503 });
  }
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
