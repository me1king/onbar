export type SpinPrizeType = 'discount' | 'free_delivery' | 'free_bottle' | 'free_mixers';

export interface SpinCampaignPrize {
  id: string;
  label: string;
  type: SpinPrizeType;
  value: number;
  weight: number;
  minimum_order: number;
  max_winners: number | null;
  enabled: boolean;
}

export interface SpinCampaign {
  id: string;
  title: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
  terms_url: string;
  prizes: SpinCampaignPrize[];
}

export interface SpinCampaignWin {
  id: string;
  campaign_id: string;
  phone: string;
  prize_id: string;
  prize_label: string;
  prize_type: SpinPrizeType;
  value: number;
  minimum_order: number;
  code: string;
  expires_at: string;
  created_at: string;
  redeemed_at: string | null;
  redeemed_order_id: number | null;
  assigned_by: string | null;
}

export function normalizeKenyanPhone(value: string) {
  const digits = value.trim().replace(/\D/g, '');
  const normalized = digits.startsWith('0')
    ? `254${digits.slice(1)}`
    : digits.startsWith('254') ? digits : `254${digits}`;
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}
