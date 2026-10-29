export const ticketThemes = [
  { id: 'midnight', label: 'Midnight black', swatch: 'bg-[#17121e]' },
  { id: 'official-white', label: 'Official white', swatch: 'bg-white' },
  { id: 'sapphire-blue', label: 'Sapphire blue', swatch: 'bg-blue-600' },
  { id: 'royal-violet', label: 'Royal violet', swatch: 'bg-violet-600' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-600' }
] as const;

export type TicketThemeId = typeof ticketThemes[number]['id'];

export const defaultTicketTheme: TicketThemeId = 'midnight';

export function isTicketThemeId(value: unknown): value is TicketThemeId {
  return typeof value === 'string' && ticketThemes.some(theme => theme.id === value);
}

export function isMissingTicketEmailThemeColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error
    && (error.code === '42703' || error.code === 'PGRST204')
    && /buyer_email_theme/i.test(error.message || '')
  );
}
