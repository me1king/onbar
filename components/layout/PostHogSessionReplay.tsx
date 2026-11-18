'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { isAllowed } from '@/lib/consentService';
import { initializePostHogAnalytics, stopPostHogAnalytics } from '@/lib/posthogClient';

const EXCLUDED_PATHS = ['/lord', '/checkout', '/payment', '/merchant', '/profile', '/track', '/dispatch', '/rider', '/supplier'];

function canRecordPath(pathname: string) {
  return !EXCLUDED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function hasSensitiveQuery() {
  return [...new URLSearchParams(window.location.search).keys()]
    .some(key => /token|email|phone|otp|password|secret|code|state/i.test(key));
}

export default function PostHogSessionReplay({ appName }: { appName: string }) {
  const pathname = usePathname();
  const lastPage = useRef('');

  useEffect(() => {
    function syncRecording() {
      const analyticsAllowed = isAllowed('analytics');
      let hasReplayConsent = false;
      try {
        hasReplayConsent = window.localStorage.getItem('ob_session_replay_consent') === 'true';
      } catch (error) {
        console.warn('[PostHog] Could not read replay consent; session recording remains disabled:', error);
      }
      if (!analyticsAllowed) {
        stopPostHogAnalytics();
        return;
      }
      if (!initializePostHogAnalytics()) return;

      if (!canRecordPath(pathname) || hasSensitiveQuery()) {
        posthog.stopSessionRecording();
        lastPage.current = '';
        return;
      }

      if (hasReplayConsent) posthog.startSessionRecording();
      else posthog.stopSessionRecording();
      const page = pathname;
      if (lastPage.current !== page) {
        lastPage.current = page;
        posthog.register({ app_name: appName });
        posthog.capture('$pageview', { $current_url: `${window.location.origin}${pathname}`, app_name: appName });
      }
    }

    syncRecording();
    window.addEventListener('ob-consent-updated', syncRecording);
    return () => window.removeEventListener('ob-consent-updated', syncRecording);
  }, [appName, pathname]);

  return null;
}
