import { supabase } from './supabaseClient';

export interface Coupon {
  id: number;
  code: string;
  discount_percent: number;
  is_active: boolean;
  discount_amount?: number;
  spin_prize_type?: 'discount' | 'free_delivery' | 'free_bottle' | 'free_mixers';
  prize_label?: string;
  minimum_order?: number;
  expires_at?: string;
}

/**
 * Validates a coupon code against Supabase
 */
export async function validateCoupon(code: string, phone = '', subtotal = 0): Promise<Coupon | null> {
  if (!code.trim()) return null;

  try {
    if (/^BN-/i.test(code.trim())) {
      const response = await fetch('/api/spin-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate', code, phone, subtotal }),
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const result = await response.json() as { coupon?: Coupon };
      return result.coupon || null;
    }
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !data) return null;
    return data as Coupon;
  } catch (err) {
    console.error("Coupon Validation Error:", err);
    return null;
  }
}

/**
 * Calculates the discounted amount
 */
export function calculateDiscount(total: number, percent: number): number {
  return (total * percent) / 100;
}
