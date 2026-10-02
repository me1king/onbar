'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Activity as Zap,
    Camera as Instagram,
    PieChart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function MarketingOverview() {
    const [error, setError] = React.useState<string | null>(null);
    const [stats, setStats] = React.useState({
        reach: 'Unavailable',
        reachTrend: 'No social account metrics connected',
        contentInteraction: 'Unavailable',
        interactionTrend: 'No social account metrics connected',
        followers: 'Unavailable',
        followersTrend: 'No social account metrics connected',
        linkClicks: 'Unavailable',
        clicksTrend: 'No link attribution source connected',
        totalImpressions: 'Unavailable',
        impressionsTrend: 'No social account metrics connected',
        mqls: 'Unavailable',
        costPerMql: 'Unavailable',
        conversionRate: 'Unavailable',
        marketingRoi: 'Unavailable'
    });

    React.useEffect(() => {
        async function fetchMarketingStats() {
            if (!supabase) {
                setError('Supabase is not configured. Marketing metrics are unavailable.');
                return;
            }
            try {
                const [eventsRes, profilesRes] = await Promise.all([
                    supabase.from('analytics_events').select('id', { count: 'exact', head: true }),
                    supabase.from('profiles').select('id', { count: 'exact', head: true })
                ]);

                if (eventsRes.error) throw eventsRes.error;
                if (profilesRes.error) throw profilesRes.error;

                setStats({
                    reach: profilesRes.count === null ? 'Unavailable' : profilesRes.count.toLocaleString(),
                    reachTrend: 'Registered customer accounts',
                    contentInteraction: eventsRes.count === null ? 'Unavailable' : eventsRes.count.toLocaleString(),
                    interactionTrend: 'Recorded storefront analytics events',
                    followers: 'Unavailable',
                    followersTrend: 'No social account metrics connected',
                    linkClicks: 'Unavailable',
                    clicksTrend: 'No link attribution source connected',
                    totalImpressions: 'Unavailable',
                    impressionsTrend: 'No social account metrics connected',
                    mqls: 'Unavailable',
                    costPerMql: 'Unavailable',
                    conversionRate: 'Unavailable',
                    marketingRoi: 'Unavailable'
                });
            } catch (err) {
                console.error("Marketing stats fetch failure:", err);
                setError(err instanceof Error ? err.message : 'Unable to load marketing metrics.');
            }
        }
        fetchMarketingStats();
    }, []);

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">BAR OS MARKETING INTELLIGENCE</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Growth & Analytics Command</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Storefront event and account counts; social reach and ROI require connected platform data.</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/admin/marketing/stories">
                        <Button variant="outline" className="rounded-2xl h-12 px-6 border-primary/20 bg-primary/5 text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary hover:text-white transition-all">
                            <Instagram className="h-4 w-4 mr-2" /> Story Scheduler
                        </Button>
                    </Link>
                    <Link href="/admin/marketing/ab-testing">
                        <Button variant="outline" className="rounded-2xl h-12 px-6 border-indigo-200 bg-indigo-50 text-indigo-700 font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                            <Zap className="h-4 w-4 mr-2" /> A/B Testing Platform
                        </Button>
                    </Link>
                </div>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}

            {/* 1. TOP DASHBOARD PERFORMANCE HUD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Registered Accounts</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.reach}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                            {stats.reachTrend}
                        </span>
                    </div>
                </Card>

                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Storefront Events</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.contentInteraction}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                            {stats.interactionTrend}
                        </span>
                    </div>
                </Card>

                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Followers</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.followers}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                            {stats.followersTrend}
                        </span>
                    </div>
                </Card>

                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Link Clicks</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.linkClicks}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                            {stats.clicksTrend}
                        </span>
                    </div>
                </Card>
            </div>

            {/* 2. WORLD AUDIENCE MAP & IMPRESSIONS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
                <Card className="lg:col-span-8 p-8 sm:p-10 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-8 relative overflow-hidden">
                    <div className="flex justify-between items-start relative z-10 border-b border-slate-800 pb-6">
                        <div>
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-400">Social Audience Metrics</span>
                            <h3 className="text-3xl font-black uppercase tracking-tight text-white mt-1">Total Impressions: {stats.totalImpressions}</h3>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-slate-800 text-slate-200 border border-slate-700">
                            {stats.impressionsTrend}
                        </span>
                    </div>

                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 relative overflow-hidden min-h-[220px] flex flex-col justify-center">
                        <div className="flex justify-around items-center text-center grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Social Regions</p>
                                <p className="text-sm font-black text-white">Unavailable</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Impressions</p>
                                <p className="text-sm font-black text-white">Unavailable</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Followers</p>
                                <p className="text-sm font-black text-white">Unavailable</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Attribution</p>
                                <p className="text-sm font-black text-white">Unavailable</p>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card className="lg:col-span-4 p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <PieChart className="h-5 w-5 text-primary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Marketing Yield</span>
                        </div>
                        <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Conversion Telemetry</h3>
                    </div>

                    <div className="space-y-4 font-mono text-xs">
                        <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-500 font-sans font-bold">MQLs</span>
                            <span className="font-black text-foreground">{stats.mqls}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-500 font-sans font-bold">Conversion Rate</span>
                            <span className="font-black text-emerald-600">{stats.conversionRate}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-500 font-sans font-bold">Marketing ROI</span>
                            <span className="font-black text-primary">{stats.marketingRoi}</span>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
