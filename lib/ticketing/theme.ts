export const ticketThemes = [
  { id: 'midnight', label: 'Midnight black', swatch: 'bg-[#17121e]' },
  { id: 'official-white', label: 'Official white', swatch: 'bg-white' },
  { id: 'royal-violet', label: 'Royal violet', swatch: 'bg-violet-600' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-600' }
] as const;

export type TicketThemeId = typeof ticketThemes[number]['id'];

export const defaultTicketTheme: TicketThemeId = 'midnight';

export function isTicketThemeId(value: unknown): value is TicketThemeId {
  return typeof value === 'string' && ticketThemes.some(theme => theme.id === value);
}
