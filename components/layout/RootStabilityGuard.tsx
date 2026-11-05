'use client';

import React, { useEffect } from 'react';
import { OB_OS } from '@/lib/onlineBarOS';
import { setAnalyticsProvider } from '@/lib/analyticsProvider';

export default function RootStabilityGuard({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        void fetch('/api/settings', { cache: 'no-store' })
            .then(async response => {
                if (!response.ok) throw new Error('Public analytics settings could not be loaded.');
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
                console.warn('[ONLINE_BAR] Analytics source could not be loaded; using the last saved browser setting:', error);
            })
            .finally(() => {
                try {
                    OB_OS.init();
                } catch (error) {
                    console.error('[ONLINE_BAR] Initialization failure:', error);
                }
            });

        const handleGlobalError = (event: ErrorEvent) => {
            if (event.error) {
                console.error("[ONLINE_BAR] Unhandled browser error:", event.error);
            }
        };

        window.addEventListener('error', handleGlobalError);
        return () => window.removeEventListener('error', handleGlobalError);
    }, []);

    return children;
}
