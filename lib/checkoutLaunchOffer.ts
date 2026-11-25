export type CheckoutLaunchOffer = {
  enabled: boolean;
  launchAt: string;
};

export const DEFAULT_CHECKOUT_LAUNCH_OFFER: CheckoutLaunchOffer = {
  enabled: true,
  launchAt: '2026-11-26T18:00:00+03:00'
};

export function parseCheckoutLaunchOffer(value: unknown): CheckoutLaunchOffer | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.enabled !== 'boolean'
    || typeof record.launchAt !== 'string'
    || record.launchAt.length > 50
    || !Number.isFinite(Date.parse(record.launchAt))) return null;
  return { enabled: record.enabled, launchAt: record.launchAt };
}
