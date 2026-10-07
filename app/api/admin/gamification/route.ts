import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = {
  points: {
    order_earn_percent: 5,
    points_per_ksh: 10,
    photo_review: 50,
    referral_bonus: 100,
    welcome_back_bonus: 50
  },
  rewards: {
    crate_probabilities: [
      { label: '50 Points', chance: 40, value: 50, type: 'xp' },
      { label: '100 Points', chance: 30, value: 100, type: 'xp' },
      { label: 'KSh 100 Voucher', chance: 20, value: 100, type: 'voucher' },
      { label: 'Free Delivery', chance: 10, value: 0, type: 'perk' }
    ],
    spin_probabilities: [
      { label: '10 Points', chance: 50, value: 10, type: 'xp' },
      { label: '100 Points', chance: 25, value: 100, type: 'xp' },
      { label: 'Free Delivery', chance: 15, value: 0, type: 'perk' },
      { label: 'KSh 500 Voucher', chance: 5, value: 500, type: 'voucher' },
      { label: 'Mystery Prize', chance: 5, value: 0, type: 'mystery' }
    ]
  }
};

const VERIFIED_MISSION_TYPES = new Set(['buy-mixers', 'review-product', 'refer-friend']);

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function authorize() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || (session.role !== 'owner' && session.permissions?.can_manage_settings !== true)) {
    return { response: NextResponse.json({ error: 'Gamification settings access required.' }, { status: 403 }) };
  }
  const database = getDatabase();
  if (!database) return { response: NextResponse.json({ error: 'Gamification settings are not configured.' }, { status: 503 }) };
  return { database, session };
}

function validRewardOptions(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return false;
  let chanceTotal = 0;
  for (const item of value) {
    if (
      typeof item !== 'object' || item === null
      || !('label' in item) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80
      || !('chance' in item) || typeof item.chance !== 'number' || !Number.isFinite(item.chance) || item.chance < 0 || item.chance > 100
      || !('value' in item) || typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value < 0
      || !('type' in item) || !['xp', 'voucher', 'perk', 'mystery'].includes(String(item.type))
    ) return false;
    chanceTotal += item.chance;
  }
  return Math.abs(chanceTotal - 100) < 0.001;
}

function validateConfig(value: unknown) {
  if (typeof value !== 'object' || value === null || !('points' in value) || !('rewards' in value) || !('missions' in value) || !('badges' in value)) return false;
  const config = value as typeof DEFAULT_CONFIG;
  const fullConfig = value as typeof DEFAULT_CONFIG & { missions: Array<{ type: string; label: string; target: number; xp: number }> };
  const points = config.points;
  const rewards = config.rewards;
  const missions = fullConfig.missions;
  const badges = (value as typeof DEFAULT_CONFIG & { badges: Array<{ key: string; label: string; icon: string; desc: string }> }).badges;
  return typeof points === 'object' && points !== null
    && Number.isFinite(points.order_earn_percent) && points.order_earn_percent >= 0 && points.order_earn_percent <= 100
    && Number.isSafeInteger(points.points_per_ksh) && points.points_per_ksh >= 1 && points.points_per_ksh <= 10000
    && Number.isSafeInteger(points.photo_review) && points.photo_review >= 0 && points.photo_review <= 100000
    && Number.isSafeInteger(points.referral_bonus) && points.referral_bonus >= 0 && points.referral_bonus <= 100000
    && Number.isSafeInteger(points.welcome_back_bonus) && points.welcome_back_bonus >= 0 && points.welcome_back_bonus <= 100000
    && typeof rewards === 'object' && rewards !== null
    && validRewardOptions(rewards.crate_probabilities)
    && validRewardOptions(rewards.spin_probabilities)
    && Array.isArray(missions) && missions.length <= 100
    && missions.every(mission => typeof mission.type === 'string'
      && /^[a-z0-9-]{1,80}$/i.test(mission.type)
      && VERIFIED_MISSION_TYPES.has(mission.type)
      && typeof mission.label === 'string' && mission.label.trim().length > 0 && mission.label.length <= 120
      && Number.isSafeInteger(mission.target) && mission.target > 0 && mission.target <= 100000
      && Number.isSafeInteger(mission.xp) && mission.xp >= 0 && mission.xp <= 100000)
    && Array.isArray(badges) && badges.length <= 100
    && badges.every(badge => typeof badge.key === 'string'
      && /^[a-z0-9-]{1,80}$/i.test(badge.key)
      && typeof badge.label === 'string' && badge.label.trim().length > 0 && badge.label.length <= 120
      && typeof badge.icon === 'string' && badge.icon.length <= 80
      && typeof badge.desc === 'string' && badge.desc.length <= 500);
}

export async function GET() {
  const auth = await authorize();
  if ('response' in auth) return auth.response;
  const { data, error } = await auth.database
    .from('loyalty_config')
    .select('value')
    .eq('id', true)
    .maybeSingle();
  if (error) {
    console.error('[AdminGamification] Could not load reward rules:', error);
    return NextResponse.json({ error: 'Could not load reward rules.' }, { status: 500 });
  }
  return NextResponse.json({ config: data?.value ?? DEFAULT_CONFIG }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const auth = await authorize();
  if ('response' in auth) return auth.response;

  let body: { config?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid reward configuration is required.' }, { status: 400 });
  }
  if (!validateConfig(body.config)) {
    return NextResponse.json({ error: 'Check point values, mission rules, and make sure each reward wheel totals exactly 100%.' }, { status: 400 });
  }

  const config = body.config as typeof DEFAULT_CONFIG & { missions: Array<{ type: string; label: string; target: number; xp: number }> };
  const badges = (body.config as typeof DEFAULT_CONFIG & { badges: Array<{ key: string; label: string; icon: string; desc: string }> }).badges;
  const { error: badgesError } = await auth.database
    .from('achievements')
    .upsert(badges.map(badge => ({
      key: badge.key,
      label: badge.label.trim(),
      description: badge.desc.trim(),
      icon: badge.icon,
      category: 'Patron'
    })), { onConflict: 'key' });
  if (badgesError) {
    console.error('[AdminGamification] Could not save achievements:', badgesError);
    return NextResponse.json({ error: 'Could not save achievement rules.' }, { status: 500 });
  }

  const { error: missionsError } = await auth.database
    .from('mission_definitions')
    .upsert(config.missions.map(mission => ({
      id: mission.type,
      label: mission.label.trim(),
      target_count: mission.target,
      xp_reward: mission.xp,
      is_active: true,
      updated_at: new Date().toISOString()
    })), { onConflict: 'id' });
  if (missionsError) {
    console.error('[AdminGamification] Could not save missions:', missionsError);
    return NextResponse.json({ error: 'Could not save mission rules.' }, { status: 500 });
  }

  const { error } = await auth.database
    .from('loyalty_config')
    .upsert({ id: true, value: config, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) {
    console.error('[AdminGamification] Could not save reward rules:', error);
    return NextResponse.json({ error: 'Could not save reward rules.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
