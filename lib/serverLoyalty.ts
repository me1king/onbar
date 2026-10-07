import type { SupabaseClient } from '@supabase/supabase-js';

export async function processOrderLoyalty(
  database: SupabaseClient,
  order: {
    id: number;
    user_id: string;
    total_price: number | string | null;
    delivery_cost: number | string | null;
    loyalty_points_redeemed: number | null;
    referred_by_code?: string | null;
  }
) {
  const { data: settings, error: settingsError } = await database
    .from('loyalty_config')
    .select('value')
    .eq('id', true)
    .single();
  if (settingsError) throw settingsError;

  const pointRules = settings.value?.points || {};
  const earnPercent = Number(pointRules.order_earn_percent);
  const referralBonus = Number(pointRules.referral_bonus || 0);
  if (!Number.isFinite(earnPercent) || earnPercent < 0 || earnPercent > 100) {
    throw new Error('The order points rate is invalid.');
  }
  if (!Number.isSafeInteger(referralBonus) || referralBonus < 0) {
    throw new Error('The referral points rule is invalid.');
  }

  const apply = async (profileId: string, amount: number, description: string, eventKey: string) => {
    if (amount <= 0) return;
    const { error } = await database.rpc('apply_loyalty_points', {
      profile_id_input: profileId,
      amount_input: amount,
      description_input: description,
      event_key_input: eventKey
    });
    if (error) throw error;
  };

  const redeemed = Number(order.loyalty_points_redeemed || 0);
  if (!Number.isSafeInteger(redeemed) || redeemed < 0) throw new Error('Order loyalty redemption is invalid.');
  if (redeemed > 0) {
    const { error } = await database.rpc('apply_loyalty_points', {
      profile_id_input: order.user_id,
      amount_input: -redeemed,
      description_input: `Redeemed at checkout for order #${order.id}`,
      event_key_input: `order:${order.id}:redeem`
    });
    if (error) throw error;
  }

  const totalPrice = Number(order.total_price || 0);
  const deliveryCost = Number(order.delivery_cost || 0);
  if (!Number.isFinite(totalPrice) || !Number.isFinite(deliveryCost) || totalPrice < 0 || deliveryCost < 0) {
    throw new Error('The order total is invalid.');
  }
  const eligibleSpend = Math.max(0, totalPrice - deliveryCost);
  const earnedPoints = Math.floor(eligibleSpend * earnPercent / 100);
  await apply(order.user_id, earnedPoints, `Earned from order #${order.id}`, `order:${order.id}:earn`);

  if (order.referred_by_code) {
    const { data: referrer, error: referrerError } = await database
      .from('profiles')
      .select('id')
      .eq('referral_code', order.referred_by_code)
      .neq('id', order.user_id)
      .maybeSingle();
    if (referrerError) throw referrerError;
    if (referrer) {
      await apply(order.user_id, referralBonus, 'Referral welcome bonus', `referral-welcome:${order.user_id}`);
      await apply(referrer.id, referralBonus, `Referral bonus for member ${order.user_id}`, `referral:${referrer.id}:${order.user_id}`);
      await recordMissionEvent(database, referrer.id, 'refer-friend', `order:${order.id}`);
    }
  }

  const { data: orderItems, error: orderItemsError } = await database
    .from('order_items')
    .select('product_id')
    .eq('order_id', order.id);
  if (orderItemsError) throw orderItemsError;
  const productIds = [...new Set((orderItems || []).map(item => Number(item.product_id)).filter(Number.isSafeInteger))];
  if (productIds.length > 0) {
    const { data: products, error: productsError } = await database
      .from('products')
      .select('id, category')
      .in('id', productIds);
    if (productsError) throw productsError;
    if ((products || []).some(product => String(product.category || '').toLowerCase().includes('mixer'))) {
      await recordMissionEvent(database, order.user_id, 'buy-mixers', `order:${order.id}`);
    }
  }

  const { data: profile, error: profileError } = await database
    .from('profiles')
    .select('loyalty_points')
    .eq('id', order.user_id)
    .single();
  if (profileError) throw profileError;
  return { earnedPoints, balance: Number(profile.loyalty_points || 0) };
}

async function recordMissionEvent(
  database: SupabaseClient,
  profileId: string,
  missionType: string,
  sourceKey: string
) {
  const { data: mission, error: missionError } = await database
    .from('mission_definitions')
    .select('id')
    .eq('id', missionType)
    .eq('is_active', true)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission) return;

  const { error } = await database.rpc('record_loyalty_mission_event', {
    profile_id_input: profileId,
    mission_type_input: missionType,
    source_key_input: sourceKey
  });
  if (error) throw error;
}
