import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
    if (!clients) return NextResponse.json({ error: "Gamification services are not configured." }, { status: 503 });

    try {
        const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!token) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
        const { data: { user }, error: authError } = await clients.auth.auth.getUser(token);
        if (authError || !user) return NextResponse.json({ error: 'Your sign-in session is invalid.' }, { status: 401 });

        const body = await request.json() as {
            userId?: unknown;
            action?: unknown;
            payload?: { type?: unknown; missionType?: unknown; reviewId?: unknown };
        };
        if (body.userId !== undefined && body.userId !== user.id) {
            return NextResponse.json({ error: 'You can only update your own account.' }, { status: 403 });
        }
        switch (body.action) {
            case 'update-streak':
                return await handleUpdateStreak(clients.database, user.id);
            case 'claim-daily-reward':
                return NextResponse.json({ error: 'Use the loyalty rewards endpoint to claim daily rewards.' }, { status: 410 });
            case 'update-mission-progress':
                return await handleUpdateMissionProgress(
                    clients.database,
                    user.id,
                    body.payload?.missionType,
                    body.payload?.reviewId
                );
            case 'sync-all-stats':
                return await handleSyncAllStats(clients.database, user.id);
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
    const kenyaDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const todayKey = kenyaDay.format(now);
    const yesterdayKey = kenyaDay.format(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    if (lastUpdate && kenyaDay.format(lastUpdate) === todayKey) {
        return NextResponse.json({ ok: true, streak: profile.current_streak, message: "Already updated today" });
    }

    const newStreak = lastUpdate && kenyaDay.format(lastUpdate) === yesterdayKey
        ? Number(profile.current_streak || 0) + 1
        : 1;

    const { error: updateError } = await database
        .from('profiles')
        .update({
            current_streak: newStreak,
            last_streak_update: now.toISOString()
        })
        .eq('id', userId);

    if (updateError) throw updateError;

    const { data: config, error: configError } = await database
        .from('loyalty_config')
        .select('value')
        .eq('id', true)
        .single();
    if (configError) throw configError;
    const points = Number(config.value?.streak?.xp_per_day || 0);
    if (!Number.isSafeInteger(points) || points < 0) throw new Error('Daily streak reward is invalid.');
    if (points > 0) {
        const { error: rewardError } = await database.rpc('apply_loyalty_points', {
            profile_id_input: userId,
            amount_input: points,
            description_input: 'Daily login streak reward',
            event_key_input: `streak:${userId}:${todayKey}`
        });
        if (rewardError) throw rewardError;
    }

    return NextResponse.json({ ok: true, newStreak, pointsAwarded: points });
}

async function handleUpdateMissionProgress(
    database: SupabaseClient,
    userId: string,
    missionTypeValue: unknown,
    reviewIdValue: unknown
) {
    if (missionTypeValue !== 'review-product') {
        return NextResponse.json(
            { error: 'This mission action is not yet connected to a verifiable server event.' },
            { status: 409 }
        );
    }
    const reviewId = Number(reviewIdValue);
    if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
        return NextResponse.json({ error: 'A saved review is required for this mission.' }, { status: 400 });
    }

    const { data: review, error: reviewError } = await database
        .from('reviews')
        .select('id, customer_user_id')
        .eq('id', reviewId)
        .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review || review.customer_user_id !== userId) {
        return NextResponse.json({ error: 'Review not found for this member.' }, { status: 404 });
    }

    const { data, error } = await database.rpc('record_loyalty_mission_event', {
        profile_id_input: userId,
        mission_type_input: 'review-product',
        source_key_input: `review:${review.id}`
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, ...data?.[0] });
}

async function handleSyncAllStats(database: SupabaseClient, userId: string) {
    // 1. Recalculate Commissions from Orders
    const { data: profile, error: profileError } = await database.from('profiles').select('referral_code').eq('id', userId).single();
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
