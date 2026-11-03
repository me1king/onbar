import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { processOrderLoyalty } from '@/lib/serverLoyalty';

export const dynamic = 'force-dynamic';

function getClient() {
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

async function getMember(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const clients = getClient();
  if (!clients) throw new Error('Loyalty services are not configured.');
  const { data, error } = await clients.auth.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, database: clients.database };
}

async function getConfig(database: NonNullable<ReturnType<typeof getClient>>['database']) {
  const { data, error } = await database
    .from('loyalty_config')
    .select('value')
    .eq('id', true)
    .single();
  if (error) {
    if (['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST116'].includes(error.code || '')) {
      throw new Error('Customer rewards are not fully set up yet. Ask an administrator to apply supabase/LOYALTY_POINTS_MIGRATION.sql.');
    }
    console.error('[MemberLoyalty] Could not load loyalty configuration:', error);
    throw new Error('Could not load customer reward settings. Please try again later.');
  }
  return data.value as {
    points?: {
      order_earn_percent?: number;
      points_per_ksh?: number;
      photo_review?: number;
      referral_bonus?: number;
      welcome_back_bonus?: number;
    };
    rewards?: {
      crate_probabilities?: RewardOption[];
      spin_probabilities?: RewardOption[];
    };
  };
}

interface RewardOption {
  label: string;
  chance: number;
  value: number;
  type: 'xp' | 'voucher' | 'perk' | 'mystery';
}

function getLoyaltyFailure(error: unknown) {
  if (error instanceof Error) return { error: error.message, status: 500 };
  if (typeof error !== 'object' || error === null) {
    return { error: 'We could not complete that loyalty action. Please try again later.', status: 500 };
  }

  const databaseError = error as { code?: unknown; message?: unknown };
  const code = typeof databaseError.code === 'string' ? databaseError.code : '';
  const message = typeof databaseError.message === 'string' ? databaseError.message : '';
  if (['42883', '42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205', 'PGRST116'].includes(code)) {
    return {
      error: 'Customer rewards are not fully set up yet. Ask an administrator to apply supabase/LOYALTY_POINTS_MIGRATION.sql.',
      status: 503
    };
  }
  if (code === 'P0001' && message) {
    if (/once every 24 hours/i.test(message)) {
      return { error: 'You can claim this reward once every 24 hours.', status: 429 };
    }
    return { error: message, status: 409 };
  }
  return { error: 'We could not complete that loyalty action. Please try again later.', status: 500 };
}

function chooseReward(rewards: RewardOption[]) {
  const totalChance = rewards.reduce((total, reward) => total + reward.chance, 0);
  if (!rewards.length || Math.abs(totalChance - 100) > 0.001) {
    throw new Error('Daily reward odds are not configured correctly.');
  }
  const selection = Math.random() * 100;
  let cumulativeChance = 0;
  for (const reward of rewards) {
    cumulativeChance += reward.chance;
    if (selection < cumulativeChance) return reward;
  }
  return rewards[rewards.length - 1];
}

export async function GET(request: Request) {
  try {
    const member = await getMember(request);
    if (!member) return NextResponse.json({ error: 'Sign in to view your points.' }, { status: 401 });
    const [{ data: profile, error: profileError }, config] = await Promise.all([
      member.database.from('profiles').select('loyalty_points').eq('id', member.user.id).single(),
      getConfig(member.database)
    ]);
    if (profileError) throw profileError;

    return NextResponse.json({
      points: Number(profile.loyalty_points || 0),
      config
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[MemberLoyalty] Could not load member loyalty data:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load loyalty data.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const member = await getMember(request);
    if (!member) return NextResponse.json({ error: 'Sign in to manage loyalty points.' }, { status: 401 });

    let body: { action?: unknown; orderId?: unknown; points?: unknown; valueKsh?: unknown; rewardType?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'A valid loyalty request is required.' }, { status: 400 });
    }

    if (body.action === 'process-order') {
      const orderId = Number(body.orderId);
      if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return NextResponse.json({ error: 'A valid order is required.' }, { status: 400 });
      }

      const { data: order, error: orderError } = await member.database
        .from('orders')
        .select('id, user_id, status, total_price, delivery_cost, loyalty_points_redeemed, referred_by_code')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order || order.user_id !== member.user.id) {
        return NextResponse.json({ error: 'Order not found for this account.' }, { status: 404 });
      }
      if (!['Paid', 'Delivered', 'Completed'].includes(order.status)) {
        return NextResponse.json({ error: 'Points are awarded after an order is paid or delivered.' }, { status: 409 });
      }

      const result = await processOrderLoyalty(member.database, order);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === 'redeem') {
      const points = Number(body.points);
      const valueKsh = Number(body.valueKsh);
      if (!Number.isSafeInteger(points) || points <= 0 || !Number.isFinite(valueKsh) || valueKsh <= 0) {
        return NextResponse.json({ error: 'Choose a valid points amount and voucher value.' }, { status: 400 });
      }

      const config = await getConfig(member.database);
      const pointsPerKsh = Number(config.points?.points_per_ksh || 10);
      if (!Number.isFinite(pointsPerKsh) || points !== Math.ceil(valueKsh * pointsPerKsh)) {
        return NextResponse.json({ error: 'The voucher value does not match the current loyalty rate.' }, { status: 400 });
      }
      const couponCode = `OB-${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
      const { data, error } = await member.database.rpc('redeem_loyalty_points', {
        profile_id_input: member.user.id,
        points_input: points,
        coupon_code_input: couponCode,
        discount_amount_input: valueKsh
      });
      if (error) throw error;

      return NextResponse.json({
        ok: true,
        code: couponCode,
        valueKsh,
        balance: Number(data?.[0]?.balance ?? 0)
      });
    }

    if (body.action === 'claim-daily-reward') {
      if (body.rewardType !== 'box' && body.rewardType !== 'spin') {
        return NextResponse.json({ error: 'Select a valid reward.' }, { status: 400 });
      }
      const config = await getConfig(member.database);
      const rewardOptions = body.rewardType === 'box'
        ? config.rewards?.crate_probabilities
        : config.rewards?.spin_probabilities;
      if (!rewardOptions) throw new Error('Daily rewards are not configured.');

      const prize = chooseReward(rewardOptions);
      const pointsAwarded = prize.type === 'xp' ? Math.floor(prize.value) : 0;
      const couponCode = prize.type === 'voucher'
        ? `OB-${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`
        : null;
      const { error } = await member.database.rpc('claim_loyalty_daily_reward', {
        profile_id_input: member.user.id,
        reward_type_input: body.rewardType,
        reward_label_input: prize.label,
        reward_value_input: prize.value,
        points_awarded_input: pointsAwarded,
        coupon_code_input: couponCode,
        coupon_discount_percent_input: null,
        coupon_discount_amount_input: prize.type === 'voucher' ? prize.value : null
      });
      if (error) {
        if (error.message.includes('once every 24 hours')) {
          return NextResponse.json({ error: 'You can claim this reward once every 24 hours.' }, { status: 429 });
        }
        throw error;
      }

      return NextResponse.json({
        ok: true,
        prize: { ...prize, code: couponCode },
        pointsAwarded
      });
    }

    return NextResponse.json({ error: 'Unknown loyalty action.' }, { status: 400 });
  } catch (error) {
    console.error('[MemberLoyalty] Loyalty action failed:', error);
    const failure = getLoyaltyFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
