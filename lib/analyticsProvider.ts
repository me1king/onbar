export type AnalyticsProvider = 'app' | 'vercel' | 'both';

const STORAGE_KEY = 'ob_analytics_provider';
const PROVIDER_UPDATED_EVENT = 'ob-analytics-provider-updated';
let activeProvider: AnalyticsProvider | null = null;

export function normalizeAnalyticsProvider(value: unknown): AnalyticsProvider {
  return value === 'vercel' || value === 'both' ? value : 'app';
}

export function getAnalyticsProvider(): AnalyticsProvider {
  if (activeProvider) return activeProvider;
  if (typeof window === 'undefined') return 'app';
  try {
    return normalizeAnalyticsProvider(window.localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn('[Analytics] Could not read the selected analytics provider:', error);
    return 'app';
  }
}

export function setAnalyticsProvider(value: unknown) {
  if (typeof window === 'undefined') return;
  const provider = normalizeAnalyticsProvider(value);
  activeProvider = provider;
  try {
    window.localStorage.setItem(STORAGE_KEY, provider);
  } catch (error) {
    console.warn('[Analytics] Could not persist the selected analytics provider in this browser:', error);
  }
  window.dispatchEvent(new CustomEvent(PROVIDER_UPDATED_EVENT, { detail: provider }));
}

export function isBuiltInAnalyticsEnabled() {
  return getAnalyticsProvider() !== 'vercel';
}

export function isVercelAnalyticsEnabled() {
  return getAnalyticsProvider() !== 'app';
}

export { PROVIDER_UPDATED_EVENT };
