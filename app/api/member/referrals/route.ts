import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;
  return {
    auth: createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    database: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  };
}

export async function POST(request: Request) {
  const clients = getClients();
  if (!clients) return NextResponse.json({ error: 'Referral services are not configured.' }, { status: 503 });

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Sign in to register your referral.' }, { status: 401 });

  try {
    const { data: { user }, error: authError } = await clients.auth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Your sign-in session is invalid.' }, { status: 401 });

    const referralCode = user.user_metadata?.referred_by_code;
    if (typeof referralCode !== 'string' || !referralCode.trim()) {
      return NextResponse.json({ error: 'No referral was attached to this account.' }, { status: 400 });
    }

    const { data, error } = await clients.database.rpc('record_loyalty_referral', {
      referred_profile_id_input: user.id,
      referral_code_input: referralCode.trim(),
      qualifying_order_id_input: null
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, ...data?.[0] });
  } catch (error) {
    console.error('[MemberReferrals] Could not register referral:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not register referral rewards.' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const clients = getClients();
  if (!clients) return NextResponse.json({ error: 'Referral services are not configured.' }, { status: 503 });

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Sign in to view your referral network.' }, { status: 401 });

  try {
    const { data: { user }, error: authError } = await clients.auth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Your sign-in session is invalid.' }, { status: 401 });

    const visited = new Set<string>([user.id]);
    let frontier = [user.id];
    const levelCounts: number[] = [];

    while (frontier.length > 0) {
      const nextFrontier: string[] = [];
      for (let start = 0; start < frontier.length; start += 200) {
        const parentIds = frontier.slice(start, start + 200);
        let offset = 0;
        while (true) {
          const { data, error } = await clients.database
            .from('loyalty_referrals')
            .select('referred_profile_id')
            .in('referrer_profile_id', parentIds)
            .order('referred_profile_id', { ascending: true })
            .range(offset, offset + 999);
          if (error) throw error;

          for (const referral of data) {
            if (visited.has(referral.referred_profile_id)) continue;
            visited.add(referral.referred_profile_id);
            nextFrontier.push(referral.referred_profile_id);
          }
          if (data.length < 1000) break;
          offset += 1000;
        }
      }
      if (nextFrontier.length === 0) break;
      levelCounts.push(nextFrontier.length);
      frontier = nextFrontier;
    }

    let pointsEarned = 0;
    let offset = 0;
    while (true) {
      const { data, error } = await clients.database
        .from('loyalty_ledger')
        .select('amount')
        .eq('profile_id', user.id)
        .like('event_key', 'referral:%')
        .range(offset, offset + 999);
      if (error) throw error;

      pointsEarned += data.reduce((total, entry) => total + Math.max(0, Number(entry.amount) || 0), 0);
      if (data.length < 1000) break;
      offset += 1000;
    }

    return NextResponse.json({
      directReferrals: levelCounts[0] || 0,
      networkSize: levelCounts.reduce((total, count) => total + count, 0),
      pointsEarned,
      levelCounts
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[MemberReferrals] Could not load referral network:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load your referral network.' },
      { status: 500 }
    );
  }
}
