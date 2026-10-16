const CLASSIC_PRIMARY = '#F5A000';
const CREAM_FOREGROUND = '#F9F4EC';
const WHITE_FOREGROUND = '#FFFFFF';

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

export function applyPrimaryTheme(primary: string, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-foreground', getPrimaryForeground(primary));
  root.style.setProperty('--ring', primary);

  for (const [property, value] of Object.entries(classicSurfaceColors)) {
    if (primary.toUpperCase() === CLASSIC_PRIMARY) {
      root.style.setProperty(property, value);
    } else {
      root.style.removeProperty(property);
    }
  }
}
