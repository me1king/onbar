'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Smartphone,
    Activity,
    RefreshCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TelemetryEvent {
    id: number;
    event_name: string;
    session_id: string | null;
    anonymous_id: string | null;
    page_url: string | null;
    created_at: string;
}

export default function AppPulsePage() {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [pulseStats, setPulseStats] = React.useState({
        installEvents: 0,
        eventsToday: 0,
        eventsThisWeek: 0,
        customerProfiles: 0
    });
    const [recentEvents, setRecentEvents] = React.useState<TelemetryEvent[]>([]);

    const fetchPulseData = React.useCallback(async () => {
        if (!supabase) {
            setError('Supabase is not configured. Telemetry data is unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const [installsRes, todayRes, weekRes, profilesRes, recentRes] = await Promise.all([
                supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_name', 'app_installed'),
                supabase.from('analytics_events').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
                supabase.from('analytics_events').select('id', { count: 'exact', head: true }).gte('created_at', weekStart),
                supabase.from('profiles').select('id', { count: 'exact', head: true }),
                supabase.from('analytics_events').select('id, event_name, session_id, anonymous_id, page_url, created_at').order('created_at', { ascending: false }).limit(10)
            ]);

            const queryError = installsRes.error || todayRes.error || weekRes.error || profilesRes.error || recentRes.error;
            if (queryError) throw queryError;
            setPulseStats({
                installEvents: installsRes.count || 0,
                eventsToday: todayRes.count || 0,
                eventsThisWeek: weekRes.count || 0,
                customerProfiles: profilesRes.count || 0
            });
            setRecentEvents((recentRes.data || []) as TelemetryEvent[]);
        } catch (err) {
            console.error("App Pulse fetch error:", err);
            setPulseStats({ installEvents: 0, eventsToday: 0, eventsThisWeek: 0, customerProfiles: 0 });
            setRecentEvents([]);
            setError(err instanceof Error ? err.message : 'Unable to load telemetry data.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchPulseData();
        const interval = setInterval(fetchPulseData, 15000);
        return () => clearInterval(interval);
    }, [fetchPulseData]);

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">

            {/* HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Smartphone className="h-5 w-5 text-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">BAR OS APP PULSE & TELEMETRY ENGINE</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        App <span className="text-primary">Pulse.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Counts and recent activity from recorded analytics events.</p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={fetchPulseData} variant="outline" className="rounded-2xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-50">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Re-Sync Telemetry
                    </Button>
                </div>
            </header>

            {error && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Recorded Install Events', value: pulseStats.installEvents },
                    { label: 'Events Today', value: pulseStats.eventsToday },
                    { label: 'Events This Week', value: pulseStats.eventsThisWeek },
                    { label: 'Customer Profiles', value: pulseStats.customerProfiles }
                ].map(stat => (
                    <Card key={stat.label} className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{stat.label}</p>
                        <p className="mt-2 text-3xl font-black text-foreground tabular-nums">{stat.value.toLocaleString()}</p>
                    </Card>
                ))}
            </div>

            <Card className="p-6 sm:p-10 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <Activity className="h-5 w-5 text-emerald-500" />
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Recent Analytics Events</h2>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Latest records from the analytics event table</p>
                    </div>
                </div>
                {loading ? (
                    <p className="py-12 text-center text-sm font-bold text-slate-400">Loading analytics events...</p>
                ) : recentEvents.length === 0 ? (
                    <p className="py-12 text-center text-sm font-bold text-slate-400">
                        {error ? 'Analytics events could not be loaded.' : 'No analytics events have been recorded yet.'}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {recentEvents.map(event => (
                            <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-black uppercase text-foreground">{event.event_name}</p>
                                    <p className="truncate text-[10px] font-bold text-primary">{event.page_url || 'Page not recorded'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-mono font-bold text-slate-500">
                                        {event.session_id ? `Session ${event.session_id}` : event.anonymous_id ? `Visitor ${event.anonymous_id}` : 'Unidentified event'}
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-400">{new Date(event.created_at).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

        </div>
    );
}
