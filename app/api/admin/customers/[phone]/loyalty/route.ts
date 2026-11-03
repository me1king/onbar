import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('254') && digits.length === 12 ? `0${digits.slice(3)}` : digits;
}

function phoneVariants(value: string) {
  const digits = value.replace(/\D/g, '');
  const variants = new Set([value.trim(), digits]);
  if (digits.startsWith('0') && digits.length === 10) {
    variants.add(`254${digits.slice(1)}`);
    variants.add(`+254${digits.slice(1)}`);
  } else if (digits.startsWith('254') && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(`+${digits}`);
  }
  return [...variants].filter(Boolean);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Only senior management can manage customer rewards.' }, { status: 403 });
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'This customer reward request could not be verified.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Customer rewards are not configured on this server.' }, { status: 503 });

  let body: {
    action?: unknown;
    amount?: unknown;
    reason?: unknown;
    rewardType?: unknown;
    rewardIndex?: unknown;
    giftType?: unknown;
    giftValue?: unknown;
    giftId?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid customer reward request is required.' }, { status: 400 });
  }

  try {
    const { phone } = await params;
    const phoneKey = normalizePhone(phone);
    if (phoneKey.length < 7 || phoneKey.length > 15) {
      return NextResponse.json({ error: 'A valid customer phone number is required.' }, { status: 400 });
    }

    const { data: profiles, error: profileError } = await database.from('profiles')
      .select('id,phone_number,loyalty_points')
      .in('phone_number', phoneVariants(phone));
    if (profileError) throw profileError;
    const profile = (profiles || []).find(candidate =>
      typeof candidate.id === 'string'
      && typeof candidate.phone_number === 'string'
      && normalizePhone(candidate.phone_number) === phoneKey
      && typeof candidate.loyalty_points === 'number'
      && candidate.id.length > 0
    );
    if (!profile) return NextResponse.json({ error: 'This phone number is not linked to a registered customer profile.' }, { status: 404 });

    if (body.action === 'adjust-points') {
      if (typeof body.amount !== 'number' || !Number.isSafeInteger(body.amount)
        || body.amount === 0 || Math.abs(body.amount) > 100000) {
        return NextResponse.json({ error: 'Enter a whole-number points adjustment between -100,000 and 100,000, excluding zero.' }, { status: 400 });
      }
      if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 160) {
        return NextResponse.json({ error: 'Enter a short reason for this points adjustment.' }, { status: 400 });
      }
      const { data, error } = await database.rpc('apply_loyalty_points', {
        profile_id_input: profile.id,
        amount_input: body.amount,
        description_input: `Admin adjustment: ${body.reason.trim()}`,
        event_key_input: `admin-adjustment:${randomUUID()}`
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, balance: Number(data?.[0]?.balance ?? profile.loyalty_points) });
    }

    if (body.action === 'issue-gift') {
      if ((body.giftType !== 'amount' && body.giftType !== 'percent')
        || typeof body.giftValue !== 'number' || !Number.isSafeInteger(body.giftValue)
        || body.giftValue <= 0
        || (body.giftType === 'amount' && body.giftValue > 1000000)
        || (body.giftType === 'percent' && body.giftValue > 100)) {
        return NextResponse.json({ error: 'Choose a valid fixed-amount or percentage gift voucher.' }, { status: 400 });
      }
      const code = `OB-GIFT-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const { data, error } = await database.from('coupons').insert({
        code,
        discount_percent: body.giftType === 'percent' ? body.giftValue : 0,
        discount_amount: body.giftType === 'amount' ? body.giftValue : 0,
        owner_profile_id: profile.id,
        is_active: true
      }).select('id,code,discount_percent,discount_amount,is_active,created_at').single();
      if (error) throw error;
      return NextResponse.json({
        ok: true,
        gift: {
          ...data,
          discount_percent: Number(data.discount_percent) || 0,
          discount_amount: Number(data.discount_amount) || 0
        }
      });
    }

    if (body.action === 'revoke-gift') {
      if (typeof body.giftId !== 'number' || !Number.isSafeInteger(body.giftId) || body.giftId <= 0) {
        return NextResponse.json({ error: 'Choose a valid customer gift voucher.' }, { status: 400 });
      }
      const { data, error } = await database.from('coupons')
        .update({ is_active: false })
        .eq('id', body.giftId)
        .eq('owner_profile_id', profile.id)
        .eq('is_active', true)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'This gift is already inactive or does not belong to this customer.' }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'award-daily-reward') {
      if ((body.rewardType !== 'box' && body.rewardType !== 'spin')
        || typeof body.rewardIndex !== 'number' || !Number.isSafeInteger(body.rewardIndex) || body.rewardIndex < 0) {
        return NextResponse.json({ error: 'Choose a valid daily crate or spin reward.' }, { status: 400 });
      }
      const { data: config, error: configError } = await database.from('loyalty_config')
        .select('value')
        .eq('id', true)
        .maybeSingle();
      if (configError) throw configError;
      const rewardOptions = body.rewardType === 'box'
        ? config?.value?.rewards?.crate_probabilities
        : config?.value?.rewards?.spin_probabilities;
      const reward: unknown = Array.isArray(rewardOptions) ? rewardOptions[body.rewardIndex] : null;
      if (!reward || typeof reward !== 'object'
        || !('type' in reward) || !['xp', 'voucher'].includes(String(reward.type))
        || !('label' in reward) || typeof reward.label !== 'string'
        || !('value' in reward) || typeof reward.value !== 'number'
        || !Number.isSafeInteger(reward.value) || reward.value < 0) {
        return NextResponse.json({ error: 'Select a configured points or voucher prize. Non-redeemable perks cannot be issued as customer rewards yet.' }, { status: 400 });
      }

      const prize = reward as { type: 'xp' | 'voucher'; label: string; value: number };
      if (prize.type === 'voucher' && prize.value <= 0) {
        return NextResponse.json({ error: 'The selected voucher must have a value greater than zero.' }, { status: 400 });
      }
      const pointsAwarded = prize.type === 'xp' ? prize.value : 0;
      const couponCode = prize.type === 'voucher'
        ? `OB-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`
        : null;
      const { error } = await database.rpc('claim_loyalty_daily_reward', {
        profile_id_input: profile.id,
        reward_type_input: body.rewardType,
        reward_label_input: prize.label,
        reward_value_input: prize.value,
        points_awarded_input: pointsAwarded,
        coupon_code_input: couponCode,
        coupon_discount_percent_input: null,
        coupon_discount_amount_input: couponCode ? prize.value : null
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, reward: { ...prize, code: couponCode } });
    }

    return NextResponse.json({ error: 'Choose a supported customer reward action.' }, { status: 400 });
  } catch (error) {
    const databaseError = typeof error === 'object' && error !== null
      ? error as { code?: unknown; message?: unknown }
      : null;
    const code = typeof databaseError?.code === 'string' ? databaseError.code : '';
    const message = typeof databaseError?.message === 'string' ? databaseError.message : '';
    if (/once every 24 hours/i.test(message)) {
      return NextResponse.json({ error: 'This customer already received this daily reward in the last 24 hours.' }, { status: 409 });
    }
    if (/insufficient loyalty points/i.test(message)) {
      return NextResponse.json({ error: 'This adjustment would make the customer balance negative. Reduce the amount and try again.' }, { status: 409 });
    }
    console.error('[AdminCustomerLoyalty] Could not update customer rewards:', error);
    if (['42883', '42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) {
      return NextResponse.json({
        error: 'Customer reward controls are not installed yet. Apply supabase/LOYALTY_POINTS_MIGRATION.sql.'
      }, { status: 503 });
    }
    return NextResponse.json({ error: 'Customer rewards could not be updated. Check the loyalty setup and try again.' }, { status: 503 });
  }
}
