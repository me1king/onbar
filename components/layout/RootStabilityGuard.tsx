'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * APEX OS: ROOT STABILITY GUARD
 * Ensures the hydration handshake is complete before rendering complex nodes.
 * This permanently prevents "White Screen" issues caused by hydration mismatches.
 */
export default function RootStabilityGuard({ children }: { children: React.ReactNode }) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        // Render a high-fidelity loading skeleton during SSR and initial hydration
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center animate-pulse">
                <div className="space-y-6 flex flex-col items-center">
                    <div className="h-20 w-20 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-black uppercase tracking-[0.4em] text-slate-200 leading-none">
                            Online Bar
                        </h2>
                        <p className="text-[10px] font-black text-slate-100 uppercase tracking-widest italic">
                            Synchronizing Interface Nodes...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
