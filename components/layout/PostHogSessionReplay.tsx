'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { isAllowed } from '@/lib/consentService';

const EXCLUDED_PATHS = ['/admin', '/checkout', '/payment', '/merchant', '/profile', '/track', '/dispatch', '/rider', '/supplier'];

function canRecordPath(pathname: string) {
  return !EXCLUDED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function hasSensitiveQuery() {
  return [...new URLSearchParams(window.location.search).keys()]
    .some(key => /token|email|phone|otp|password|secret|code|state/i.test(key));
}

export default function PostHogSessionReplay({ appName }: { appName: string }) {
  const pathname = usePathname();
  const initialized = useRef(false);
  const lastPage = useRef('');
  const projectKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  useEffect(() => {
    function syncRecording() {
      const hasReplayConsent = window.localStorage.getItem('ob_session_replay_consent') === 'true';
      if (!isAllowed('analytics') || !hasReplayConsent) {
        if (initialized.current) {
          posthog.stopSessionRecording();
          posthog.opt_out_capturing();
        }
        return;
      }
      if (!projectKey) return;

      if (!initialized.current) {
        initialized.current = true;
        posthog.init(projectKey, {
          api_host: apiHost,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: true,
          disable_session_recording: true,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '.ph-no-capture, [data-private], [data-sensitive]'
          }
        });
      } else {
        posthog.opt_in_capturing();
      }

      if (!canRecordPath(pathname) || hasSensitiveQuery()) {
        posthog.stopSessionRecording();
        lastPage.current = '';
        return;
      }

      posthog.startSessionRecording();
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
  }, [apiHost, appName, pathname, projectKey]);

  return null;
}
