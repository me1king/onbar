'use client';

import * as React from 'react';
import TacticalCameraStudio from '@/components/admin/TacticalCameraStudio';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';

export default function TacticalCameraPage() {
    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            <TacticalCameraStudio />

            <div className="pt-6">
                <TacticalEventFeed
                    title="Tactical Camera Telemetry Ticker"
                    subtitle="Live Cross-Platform Publish & Cloudinary Media Feed"
                />
            </div>
        </div>
    );
}
