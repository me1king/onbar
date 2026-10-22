export function normalizeTicketPhoneNumber(value: string) {
  const normalized = value.trim().replace(/[\s()-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(normalized)) return normalized;
  if (normalized.startsWith('+')) return null;

  if (!/^\d+$/.test(normalized)) return null;
  if (/^254[17]\d{8}$/.test(normalized)) return `+${normalized}`;
  if (/^0[17]\d{8}$/.test(normalized)) return `+254${normalized.slice(1)}`;
  if (/^[17]\d{8}$/.test(normalized)) return `+254${normalized}`;
  return null;
}
