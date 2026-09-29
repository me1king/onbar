import { supabase } from './supabaseClient';

export function isInstalledApp(): boolean {
    if (typeof window === 'undefined') return false;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return isStandalone || isIosStandalone;
}

export async function trackEvent(eventName: string, properties: Record<string, unknown> = {}) {
    if (typeof window === 'undefined' || !supabase) return;

    try {
        const sessionId = (window as unknown as { sessionId?: string }).sessionId || 'sess-anon-001';
        const page = window.location.pathname;
        const installed = isInstalledApp();

        await supabase.from('analytics_events').insert([{
            session_id: sessionId,
            event_name: eventName,
            page,
            properties,
            installed
        }]);
    } catch (err) {
        console.warn("Analytics telemetry dispatch failed:", err);
    }
}

let screenStartedAt = Date.now();
let currentScreen = 'home';

export function startScreen(screenName: string) {
    if (typeof window === 'undefined') return;

    if (currentScreen) {
        const duration = Date.now() - screenStartedAt;
        trackEvent('screen_time', {
            screen: currentScreen,
            duration_ms: duration
        });
    }

    currentScreen = screenName;
    screenStartedAt = Date.now();

    trackEvent('screen_view', {
        screen: screenName
    });
}

// Global data-track click listener
if (typeof window !== 'undefined') {
    document.addEventListener('click', (event) => {
        const target = (event.target as HTMLElement).closest('[data-track]');
        if (!target) return;

        const action = (target as HTMLElement).dataset.track;
        trackEvent('ui_interaction', { action });
    });

    window.addEventListener('appinstalled', () => {
        trackEvent('app_installed', { source: 'onboarding' });
    });
}
