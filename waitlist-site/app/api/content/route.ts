import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const fallbackContent = {
    eyebrow: 'A BETTER NIGHT STARTS HERE',
    headline: 'Something good is coming.',
    intro: 'Your next drink night is about to get a lot easier. Online Bar is bringing your favorites to your door, starting in selected areas.',
    benefit_one: 'Priority access',
    benefit_two: 'Launch surprises',
    benefit_three: 'Area-first delivery',
    hero_image_url: null,
    hero_image_alt: 'Online Bar early access',
    launch_at: null,
    tokens_per_referral: 25,
    rewards: [
      {
        id: 'launch-bundle',
        name: 'Launch bundle',
        description: 'Early-access tokens for your first launch drop and surprise delivery perks.',
        image_url: null,
        token_cost: 25,
        is_active: true,
        sort_order: 1
      },
      {
        id: 'vip-night',
        name: 'VIP night',
        description: 'Priority access to limited-release cocktails, tastings and surprise bar experiences.',
        image_url: null,
        token_cost: 60,
        is_active: true,
        sort_order: 2
      }
    ],
    age_group_tracks: {}
  } as const;
  if (!url || !key) {
    const missing = [
      !url && 'NEXT_PUBLIC_SUPABASE_URL',
      !key && 'SUPABASE_SERVICE_ROLE_KEY'
    ].filter((name): name is string => Boolean(name));
    console.warn(`[WaitlistSite] Missing server environment variables: ${missing.join(', ')}. Using built-in default content.`);
    return NextResponse.json({ content: fallbackContent }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  const database = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const contentQuery = database.from('waitlist_site_content')
    .select('eyebrow,headline,intro,benefit_one,benefit_two,benefit_three,hero_image_url,hero_image_alt,launch_at,tokens_per_referral,age_group_tracks')
    .eq('id', 'default')
    .maybeSingle();
  const rewardsQuery = database.from('waitlist_site_rewards')
    .select('id,name,description,image_url,token_cost,is_active,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const [{ data, error }, { data: rewardsData, error: rewardsError }] = await Promise.all([contentQuery, rewardsQuery]);
  if (error) {
    console.warn('[WaitlistSite] Could not load published website content; using fallback copy.', error);
    return NextResponse.json({ content: fallbackContent }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  if (!data) {
    return NextResponse.json({ content: fallbackContent }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  if (rewardsError) {
    console.warn('[WaitlistSite] Could not load published reward catalog; using fallback rewards.', rewardsError);
  }
  const allowedAgeGroups = new Set(['18_20', '21_24', '25_34', '35_44', '45_plus']);
  const rawTracks = data.age_group_tracks && typeof data.age_group_tracks === 'object'
    ? data.age_group_tracks as Record<string, { title?: unknown; url?: unknown }>
    : {};
  const ageGroupTracks = Object.fromEntries(
    Object.entries(rawTracks)
      .filter(([group, track]) => {
        if (!allowedAgeGroups.has(group) || !track || typeof track !== 'object'
          || typeof track.title !== 'string' || typeof track.url !== 'string') return false;
        try {
          return new URL(track.url).protocol === 'https:';
        } catch {
          return false;
        }
      })
      .map(([group, track]) => [group, { title: track.title, url: track.url }])
  );
  const content = {
    eyebrow: data.eyebrow,
    headline: data.headline,
    intro: data.intro,
    benefit_one: data.benefit_one,
    benefit_two: data.benefit_two,
    benefit_three: data.benefit_three,
    hero_image_url: data.hero_image_url,
    hero_image_alt: data.hero_image_alt,
    launch_at: data.launch_at ?? null,
    tokens_per_referral: Number(data.tokens_per_referral || 25),
    rewards: ((rewardsData || []) as Array<{ id: string; name: string; description: string; image_url: string | null; token_cost: number; is_active: boolean; sort_order: number }>).filter(reward => reward && reward.is_active !== false).map(reward => ({
      id: reward.id,
      name: reward.name,
      description: reward.description,
      image_url: reward.image_url,
      token_cost: Number(reward.token_cost || 0),
      is_active: true,
      sort_order: Number(reward.sort_order || 0)
    })).sort((a, b) => a.sort_order - b.sort_order),
    age_group_tracks: ageGroupTracks
  };
  return NextResponse.json({ content }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
  });
}
