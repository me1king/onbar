'use client';

import { Analytics } from '@vercel/analytics/next';
import AnalyticsTracker from '@/components/layout/AnalyticsTracker';
import { isAllowed } from '@/lib/consentService';
import { getAnalyticsProvider, isBuiltInAnalyticsEnabled, isVercelAnalyticsEnabled, normalizeAnalyticsProvider, PROVIDER_UPDATED_EVENT, setAnalyticsProvider } from '@/lib/analyticsProvider';
import { useEffect, useState } from 'react';

const EXCLUDED_PATHS = ['/lord', '/checkout', '/payment', '/merchant', '/profile', '/track', '/dispatch', '/rider', '/supplier'];

function canSendVercelEvent(url: string) {
  if (!isAllowed('analytics')) return false;
  try {
    const parsedUrl = new URL(url, window.location.origin);
    if (EXCLUDED_PATHS.some(path => parsedUrl.pathname === path || parsedUrl.pathname.startsWith(`${path}/`))) {
      return false;
    }
    return ![...parsedUrl.searchParams.keys()]
      .some(key => /token|email|phone|otp|password|secret|code|state/i.test(key));
  } catch (error) {
    console.warn('[AnalyticsSwitcher] Could not validate analytics URL:', error);
    return false;
  }
}

export default function AnalyticsSwitcher() {
  const [loading, setLoading] = useState(true);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [provider, setProvider] = useState(getAnalyticsProvider);

  useEffect(() => {
    const syncConsent = () => setAnalyticsAllowed(isAllowed('analytics'));
    const syncProvider = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setProvider(normalizeAnalyticsProvider(detail));
    };
    syncConsent();
    window.addEventListener('ob-consent-updated', syncConsent);
    window.addEventListener(PROVIDER_UPDATED_EVENT, syncProvider);
    void fetch('/api/settings', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Published analytics settings could not be loaded.');
        return await response.json() as {
          settings?: Array<{ key: string; value: Record<string, unknown> }>;
        };
      })
      .then(result => {
        const features = result.settings?.find(setting => setting.key === 'features')?.value;
        if (features?.analytics_provider !== undefined) {
          setAnalyticsProvider(features.analytics_provider);
        }
      })
      .catch(error => {
        console.warn('[AnalyticsSwitcher] Could not load the analytics source; keeping the last saved browser setting:', error);
      })
      .finally(() => setLoading(false));
    return () => {
      window.removeEventListener('ob-consent-updated', syncConsent);
      window.removeEventListener(PROVIDER_UPDATED_EVENT, syncProvider);
    };
  }, []);

  if (loading || !analyticsAllowed) return null;

  return (
    <>
      {isBuiltInAnalyticsEnabled() && provider !== 'vercel' && <AnalyticsTracker />}
      {isVercelAnalyticsEnabled() && provider !== 'app' && (
        <Analytics beforeSend={event => canSendVercelEvent(event.url) ? event : null} />
      )}
    </>
  );
}
