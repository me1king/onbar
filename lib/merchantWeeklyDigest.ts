export function getPreviousMerchantDigestWeek(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (values.weekday !== 'Mon' || Number(values.hour) < 9) return null;

  const currentMonday = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const previousMonday = new Date(currentMonday);
  previousMonday.setUTCDate(previousMonday.getUTCDate() - 7);
  return {
    start: previousMonday.toISOString().slice(0, 10),
    end: currentMonday.toISOString().slice(0, 10)
  };
}
