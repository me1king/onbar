export type WaitlistLaunchOffer = {
  enabled: boolean;
  launchAt: string;
};

export const DEFAULT_WAITLIST_LAUNCH_OFFER: WaitlistLaunchOffer = {
  enabled: true,
  launchAt: '2026-11-26T18:00:00+03:00'
};

export function parseWaitlistLaunchOffer(value: unknown): WaitlistLaunchOffer | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.enabled !== 'boolean'
    || typeof record.launchAt !== 'string'
    || record.launchAt.length > 50
    || !Number.isFinite(Date.parse(record.launchAt))) return null;
  return { enabled: record.enabled, launchAt: record.launchAt };
}

export function formatWaitlistLaunchTime(value: string, now = Date.now()) {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Nairobi'
  });
  const launchDate = dateFormatter.format(new Date(value));
  const today = dateFormatter.format(new Date(now));
  const tomorrow = dateFormatter.format(new Date(now + 24 * 60 * 60 * 1000));
  const time = new Intl.DateTimeFormat('en-KE', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi'
  }).format(new Date(value));
  if (launchDate === today) return `today at ${time}`;
  if (launchDate === tomorrow) return `tomorrow at ${time}`;
  const date = new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Africa/Nairobi'
  }).format(new Date(value));
  return `${date} at ${time}`;
}
