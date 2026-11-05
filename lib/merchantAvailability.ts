export const merchantWeekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const;

export type MerchantWeekday = (typeof merchantWeekdays)[number];

export interface MerchantDayHours {
  enabled: boolean;
  open: string;
  close: string;
}

export type MerchantOperatingHours = Record<MerchantWeekday, MerchantDayHours>;

const defaultHours: MerchantDayHours = { enabled: false, open: '09:00', close: '17:00' };
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseHours(value: unknown): MerchantDayHours {
  if (typeof value === 'string') {
    const legacy = value.match(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/);
    if (!legacy) return { ...defaultHours };
    return { enabled: legacy[1] !== legacy[2], open: legacy[1], close: legacy[2] };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...defaultHours };

  const candidate = value as Record<string, unknown>;
  const open = typeof candidate.open === 'string' && timePattern.test(candidate.open)
    ? candidate.open
    : defaultHours.open;
  const close = typeof candidate.close === 'string' && timePattern.test(candidate.close)
    ? candidate.close
    : defaultHours.close;
  return {
    enabled: candidate.enabled === true && open !== close,
    open,
    close
  };
}

export function normalizeMerchantOperatingHours(value: unknown): MerchantOperatingHours {
  const source = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    merchantWeekdays.map(day => [day, parseHours(source[day])])
  ) as MerchantOperatingHours;
}

function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function intervalContains(hours: MerchantDayHours, minuteOfDay: number): boolean {
  if (!hours.enabled || hours.open === hours.close) return false;
  const opensAt = minutesOfDay(hours.open);
  const closesAt = minutesOfDay(hours.close);
  return opensAt < closesAt
    ? minuteOfDay >= opensAt && minuteOfDay < closesAt
    : minuteOfDay >= opensAt;
}

export function getMerchantMinutesUntilClose(schedule: unknown, at: Date = new Date()): number | null {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
  const today = parts.weekday.toLowerCase() as MerchantWeekday;
  const todayIndex = merchantWeekdays.indexOf(today);
  const currentMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const hours = normalizeMerchantOperatingHours(schedule);
  const todayHours = hours[today];

  const previousDay = merchantWeekdays[(todayIndex + merchantWeekdays.length - 1) % merchantWeekdays.length];
  const previousHours = hours[previousDay];
  if (previousHours.enabled
    && minutesOfDay(previousHours.open) > minutesOfDay(previousHours.close)
    && currentMinute < minutesOfDay(previousHours.close)) {
    return minutesOfDay(previousHours.close) - currentMinute;
  }

  if (intervalContains(todayHours, currentMinute)) {
    const opensAt = minutesOfDay(todayHours.open);
    const closesAt = minutesOfDay(todayHours.close);
    return opensAt < closesAt
      ? closesAt - currentMinute
      : 24 * 60 - currentMinute + closesAt;
  }

  return null;
}

export function isMerchantOpenAt(schedule: unknown, at: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
  const today = parts.weekday.toLowerCase() as MerchantWeekday;
  const todayIndex = merchantWeekdays.indexOf(today);
  const currentMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const hours = normalizeMerchantOperatingHours(schedule);
  if (intervalContains(hours[today], currentMinute)) return true;

  const previousDay = merchantWeekdays[(todayIndex + merchantWeekdays.length - 1) % merchantWeekdays.length];
  const previousHours = hours[previousDay];
  return previousHours.enabled
    && minutesOfDay(previousHours.open) > minutesOfDay(previousHours.close)
    && currentMinute < minutesOfDay(previousHours.close);
}

export function isValidMerchantOperatingHours(value: unknown): value is MerchantOperatingHours {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const schedule = value as Record<string, unknown>;
  return merchantWeekdays.every(day => {
    const hours = schedule[day];
    if (typeof hours !== 'object' || hours === null || Array.isArray(hours)) return false;
    const candidate = hours as Record<string, unknown>;
    return typeof candidate.enabled === 'boolean'
      && typeof candidate.open === 'string'
      && timePattern.test(candidate.open)
      && typeof candidate.close === 'string'
      && timePattern.test(candidate.close)
      && (!candidate.enabled || candidate.open !== candidate.close);
  });
}
