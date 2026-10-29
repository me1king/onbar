'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, ShieldAlert, RefreshCcw } from 'lucide-react';
import { OB_OS } from '@/lib/onlineBarOS';
import { Button } from '@/components/ui/button';
import { setAnalyticsProvider } from '@/lib/analyticsProvider';

/**
 * ROOT STABILITY GUARD
 * Ensures the hydration handshake is complete before rendering complex nodes.
 * This permanently prevents "White Screen" issues caused by hydration mismatches.
 */
export default function RootStabilityGuard({ children }: { children: React.ReactNode }) {
    const [isMounted, setIsMounted] = useState(false);
    const [showTimeoutError, setShowTimeoutError] = useState(false);

    useEffect(() => {
        // 1. Initialize OS Engine (Safe Mode)
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

        // 2. Set Hydration Milestone
        setIsMounted(true);

        // 3. Global Error Recovery Listener
        const handleGlobalError = (event: ErrorEvent) => {
            if (event.error) {
                console.error("[ONLINE_BAR] Unhandled browser error:", event.error);
            }
            // We let the ErrorBoundary handle it if possible, but log it here.
        };

        window.addEventListener('error', handleGlobalError);
        return () => window.removeEventListener('error', handleGlobalError);
    }, []);

    // 4. Hydration Safety Timeout
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isMounted) {
                setShowTimeoutError(true);
            }
        }, 10000); // 10s safety window

        return () => clearTimeout(timer);
    }, [isMounted]);

    if (showTimeoutError) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
                <div className="space-y-6 max-w-sm">
                    <div className="h-16 w-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto shadow-sm">
                        <ShieldAlert size={32} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-black uppercase text-foreground">Sync Timeout</h2>
                        <p className="text-xs font-medium text-slate-500 leading-relaxed italic">
                            &quot;The grid is taking longer than usual to synchronize with your terminal.&quot;
                        </p>
                    </div>
                    <Button
                        onClick={() => window.location.reload()}
                        className="h-12 w-full rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
                    >
                        <RefreshCcw className="mr-2 h-4 w-4" /> Force Re-Sync
                    </Button>
                </div>
            </div>
        );
    }

    if (!isMounted) {
        // Render a high-fidelity loading skeleton during SSR and initial hydration
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
                <div className="space-y-6 flex flex-col items-center">
                    <div className="h-20 w-20 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center relative">
                        <div className="absolute inset-0 border-4 border-primary/20 rounded-3xl animate-spin border-t-primary" />
                        <Loader2 className="h-10 w-10 text-primary animate-pulse" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-black uppercase tracking-[0.4em] text-foreground leading-none animate-in fade-in slide-in-from-bottom-2 duration-1000">
                            Online Bar
                        </h2>
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest italic animate-pulse">
                            Establishing Connection...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
