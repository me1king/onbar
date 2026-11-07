export function isBatteryTelemetryFresh(
  level: number | null | undefined,
  reportedAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 100 || !reportedAt) {
    return false;
  }
  const timestamp = new Date(reportedAt).getTime();
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= 5 * 60_000;
}

export function formatBatteryTelemetry(
  level: number | null | undefined,
  reportedAt: string | null | undefined,
  now = Date.now()
): string {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 100 || !reportedAt) {
    return 'Not recorded';
  }
  const timestamp = new Date(reportedAt).getTime();
  const age = now - timestamp;
  if (!Number.isFinite(timestamp) || age < 0) return 'Not recorded';

  const ageMinutes = Math.floor(age / 60_000);
  const ageLabel = ageMinutes < 1 ? 'just now' : `${ageMinutes}m ago`;
  return isBatteryTelemetryFresh(level, reportedAt, now)
    ? `${Math.round(level)}% · ${ageLabel}`
    : `Last ${Math.round(level)}% · ${ageLabel}`;
}
