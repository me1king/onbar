import posthog from 'posthog-js';
import { isAllowed } from '@/lib/consentService';

const projectKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export function initializePostHogAnalytics() {
  if (typeof window === 'undefined' || !projectKey || !isAllowed('analytics')) return false;
  if (!posthog.__loaded) {
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
  return true;
}

export function stopPostHogAnalytics() {
  if (!posthog.__loaded) return;
  posthog.stopSessionRecording();
  posthog.opt_out_capturing();
}

export function reportClientRuntimeError(error: Error, hasComponentStack = false) {
  if (!initializePostHogAnalytics()) return;
  const errorType = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name) ? error.name : 'Error';
  const digest = typeof (error as Error & { digest?: unknown }).digest === 'string'
    ? (error as Error & { digest: string }).digest
    : '';
  posthog.capture('client_runtime_error', {
    app_name: 'Online Bar',
    error_type: errorType,
    error_digest: /^[A-Za-z0-9_-]{1,80}$/.test(digest) ? digest : undefined,
    has_component_stack: hasComponentStack
  });
}
