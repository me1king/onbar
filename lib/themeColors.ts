const CLASSIC_PRIMARY = '#F5A000';
const CREAM_FOREGROUND = '#F9F4EC';
const WHITE_FOREGROUND = '#FFFFFF';

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: CLASSIC_PRIMARY,
  secondary: '#0F172A',
  accent: '#5B5BFF'
};

export const THEME_UPDATED_EVENT = 'onlinebar:theme-updated';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
}

export function getPrimaryForeground(primary: string): string {
  return primary.toUpperCase() === CLASSIC_PRIMARY.toUpperCase() ? WHITE_FOREGROUND : CREAM_FOREGROUND;
}

const classicSurfaceColors = {
  '--background': '#FFFFFF',
  '--card': '#FFFFFF',
  '--popover': '#FFFFFF',
  '--secondary': '#F8FAFC',
  '--muted': '#F8FAFC',
  '--accent': '#F1F5F9',
  '--border': '#E2E8F0',
  '--input': '#E2E8F0',
  '--sidebar': '#FFFFFF',
  '--sidebar-border': '#E2E8F0',
  '--titanium-bg': '#FFFFFF',
  '--titanium-border': '#E2E8F0'
} as const;

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function normalizeThemeColors(value: unknown): ThemeColors | null {
  if (typeof value !== 'object' || value === null) return null;
  const colors = value as Partial<Record<keyof ThemeColors, unknown>>;
  if (!isHexColor(colors.primary) || !isHexColor(colors.secondary) || !isHexColor(colors.accent)) {
    return null;
  }
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent
  };
}

export function applyThemeColors(theme: ThemeColors, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-foreground', getPrimaryForeground(theme.primary));
  root.style.setProperty('--ring', theme.primary);
  root.style.setProperty('--brand-secondary', theme.secondary);
  root.style.setProperty('--brand-accent', theme.accent);

  for (const [property, value] of Object.entries(classicSurfaceColors)) {
    if (theme.primary.toUpperCase() === CLASSIC_PRIMARY) {
      root.style.setProperty(property, value);
    } else {
      root.style.removeProperty(property);
    }
  }
}
