import { supabase } from "@/lib/supabaseClient";
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    if (!supabase) return NextResponse.json({ error: "DB not connected" }, { status: 500 });

    try {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
        if (!token) return NextResponse.json({ error: "Sign in to use member rewards." }, { status: 401 });
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return NextResponse.json({ error: "Invalid Auth Token" }, { status: 401 });

        const database = createServerSupabaseClient();
        if (!database) return NextResponse.json({ error: "Member rewards are not configured." }, { status: 503 });
        const body = await request.json() as { action?: unknown; payload?: unknown };
        if (typeof body.action !== 'string' || typeof body.payload !== 'object' || body.payload === null) {
            return NextResponse.json({ error: "Invalid member reward request." }, { status: 400 });
        }
        const payload = body.payload as Record<string, unknown>;

        switch (body.action) {
            case 'update-streak':
                return await handleUpdateStreak(database, user.id);
            case 'claim-daily-reward':
                if (payload.type !== 'spin' && payload.type !== 'box') {
                    return NextResponse.json({ error: "Invalid reward type." }, { status: 400 });
                }
                return await handleClaimDailyReward(database, user.id, payload.type);
            case 'update-mission-progress':
                return NextResponse.json(
                    { error: "Mission progress is temporarily disabled until actions can be verified server-side." },
                    { status: 501 }
                );
            case 'sync-all-stats':
                return await handleSyncAllStats(database, user.id);
            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

    } catch (error: unknown) {
        console.error('[MemberGamification] Request failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Member reward request failed.' },
            { status: 500 }
        );
    }
}

async function handleUpdateStreak(database: SupabaseClient, userId: string) {
    const { data: profile, error: fetchError } = await database
        .from('profiles')
        .select('current_streak, last_streak_update')
        .eq('id', userId)
        .single();

    if (fetchError) throw fetchError;

    const lastUpdate = profile.last_streak_update ? new Date(profile.last_streak_update) : null;
    const now = new Date();

    // Check if updated today already (Kenya Time focus)
    if (lastUpdate && lastUpdate.toDateString() === now.toDateString()) {
        return NextResponse.json({ ok: true, streak: profile.current_streak, message: "Already updated today" });
    }

    let newStreak = 1;
    if (lastUpdate) {
        const diffDays = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 1) {
            newStreak = (profile.current_streak || 0) + 1;
        }
    }

    const { error: updateError } = await database
        .from('profiles')
        .update({
            current_streak: newStreak,
            last_streak_update: now.toISOString()
        })
        .eq('id', userId);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, newStreak });
}

async function handleClaimDailyReward(database: SupabaseClient, userId: string, type: 'spin' | 'box') {
    // Logic to select reward based on admin settings (to be added in admin phase)
    // For now, simple random reward
    const rewards = [
        { type: 'xp', amount: 50, label: '50 XP' },
        { type: 'xp', amount: 100, label: '100 XP' },
        { type: 'voucher', amount: 100, label: 'KSh 100 Coupon' },
        { type: 'perk', amount: 0, label: 'Free Delivery' }
    ];
    const prize = rewards[Math.floor(Math.random() * rewards.length)];

    const { data: claim, error: claimError } = await database.rpc('claim_daily_member_reward', {
        profile_id_input: userId,
        reward_type_input: type,
        reward_label_input: prize.label,
        reward_value_input: prize.amount,
        points_input: prize.type === 'xp' ? prize.amount : 0
    }).maybeSingle();
    if (claimError) {
        if (claimError.code === 'P0001') {
            return NextResponse.json({ error: claimError.message }, { status: 429 });
        }
        throw claimError;
    }

    const claimResult = claim as { next_claim_at?: string } | null;
    return NextResponse.json({ ok: true, prize, nextClaimAt: claimResult?.next_claim_at });
}

async function handleSyncAllStats(database: SupabaseClient, userId: string) {
    // 1. Recalculate Commissions from Orders
    const { data: profile, error: profileError } = await database
        .from('profiles')
        .select('referral_code')
        .eq('id', userId)
        .single();
    if (profileError) throw profileError;
    if (!profile?.referral_code) return NextResponse.json({ ok: false, error: "No referral code" });

    const { data: orders, error: ordersError } = await database
        .from('orders')
        .select('total_price')
        .eq('referred_by_code', profile.referral_code)
        .eq('status', 'Delivered');
    if (ordersError) throw ordersError;

    const totalCom = (orders || []).reduce((sum, o) => sum + (o.total_price * 0.05), 0);

    // 2. Update Profile
    const { error: updateError } = await database
        .from('profiles')
        .update({ total_commission_earned: Math.round(totalCom) })
        .eq('id', userId);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, commission: totalCom });
}
