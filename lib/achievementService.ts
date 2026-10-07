import { supabase } from './supabaseClient';

/**
 * Tactical Achievement Engine
 * Automatically unlocks rewards based on user behavior
 */
export async function unlockAchievement(userId: string, key: string) {
    if (!supabase || !userId) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || session.user.id !== userId) throw new Error('A signed-in member session is required.');
        const response = await fetch('/api/member/achievement', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ achievementKey: key })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Achievement reward failed.');
        return result.unlocked === true;
    } catch (err) {
        console.error("Achievement Unlock Failure:", err);
        return false;
    }
}

/**
 * Post-Checkout Reliability Check
 * Scans user history to grant badges and XP
 */
export async function runPostCheckoutAudit(userId: string, orderTotal: number) {
    if (!supabase || !userId) return;

    try {
        // 1. First Pour
        await unlockAchievement(userId, 'first-pour');

        // 2. VVIP Patron (Spent over 50k)
        if (orderTotal >= 50000) {
            await unlockAchievement(userId, 'vvip-shopper');
        }

        // 3. Bar Regular (Own 5+ unique orders)
        const { data: profileData } = await supabase.from('profiles').select('phone_number').eq('id', userId).single();
        if (profileData?.phone_number) {
            const { count: orderCount } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('customer_phone', profileData.phone_number)
                .eq('status', 'Delivered');

            if (orderCount && orderCount >= 5) {
                await unlockAchievement(userId, 'bar-regular');
            }
        }
    } catch (err) {
        console.warn("Post-checkout audit interrupted:", err);
    }
}
