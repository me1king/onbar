const CLASSIC_PRIMARY = '#F5A000';
const CREAM_FOREGROUND = '#F9F4EC';
const WHITE_FOREGROUND = '#FFFFFF';

export function getPrimaryForeground(primary: string): string {
  return primary.toUpperCase() === CLASSIC_PRIMARY ? WHITE_FOREGROUND : CREAM_FOREGROUND;
}
