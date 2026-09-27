'use client';

import * as React from 'react';
import {
    Activity as Zap,
    Camera as Instagram,
    PieChart,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function MarketingOverview() {
    const stats = {
        reach: '1.6K',
        reachTrend: '-7%',
        contentInteraction: '19',
        interactionTrend: '+18%',
        followers: '1.1K',
        followersTrend: '+5%',
        linkClicks: '2',
        clicksTrend: '-80%',
        totalImpressions: '12,514',
        impressionsTrend: '+37%',
        mqls: '847',
        costPerMql: '$87',
        conversionRate: '24%',
        marketingRoi: '4.2x',
        websiteTraffic: '142K'
    };

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
                    <p className="text-muted-foreground text-sm font-medium mt-1">First-party social metrics, audience locations, and marketing ROI telemetry.</p>
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

            {/* 1. TOP DASHBOARD PERFORMANCE HUD (SCREENSHOT 1) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Reach</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.reach}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                            <ArrowDownRight size={12} className="mr-0.5" /> {stats.reachTrend}
                        </span>
                    </div>
                </Card>

                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Content Interaction</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.contentInteraction}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            <ArrowUpRight size={12} className="mr-0.5" /> {stats.interactionTrend}
                        </span>
                    </div>
                </Card>

                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Followers</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.followers}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            <ArrowUpRight size={12} className="mr-0.5" /> {stats.followersTrend}
                        </span>
                    </div>
                </Card>

                <Card className="p-6 sm:p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2 text-left">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Link Clicks</p>
                    <div className="flex items-baseline justify-between">
                        <p className="text-3xl font-black text-foreground tabular-nums">{stats.linkClicks}</p>
                        <span className="inline-flex items-center text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                            <ArrowDownRight size={12} className="mr-0.5" /> {stats.clicksTrend}
                        </span>
                    </div>
                </Card>
            </div>

            {/* 2. WORLD AUDIENCE MAP & IMPRESSIONS (SCREENSHOT 1) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
                <Card className="lg:col-span-8 p-8 sm:p-10 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-8 relative overflow-hidden">
                    <div className="flex justify-between items-start relative z-10 border-b border-slate-800 pb-6">
                        <div>
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-400">Audience Location & Reach</span>
                            <h3 className="text-3xl font-black uppercase tracking-tight text-white mt-1">Total Impressions: {stats.totalImpressions}</h3>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <ArrowUpRight size={12} className="inline mr-1" /> {stats.impressionsTrend}
                        </span>
                    </div>

                    {/* World Map Representation */}
                    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 relative overflow-hidden min-h-[220px] flex flex-col justify-center">
                        <div className="flex justify-around items-center text-center grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Kenya (Nairobi)</p>
                                <p className="text-2xl font-black text-amber-400">50%</p>
                                <p className="text-[8px] font-black text-emerald-400">↗ 56%</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Australia</p>
                                <p className="text-2xl font-black text-slate-100">30%</p>
                                <p className="text-[8px] font-black text-emerald-400">↗ 12%</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">United States</p>
                                <p className="text-2xl font-black text-slate-100">10%</p>
                                <p className="text-[8px] font-black text-rose-400">↘ 6%</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">United Kingdom</p>
                                <p className="text-2xl font-black text-slate-100">10%</p>
                                <p className="text-[8px] font-black text-rose-400">↘ 4%</p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Profile Activity & Taps */}
                <Card className="lg:col-span-4 p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                    <h3 className="text-xl font-black uppercase tracking-tight text-foreground border-b border-slate-100 pb-4">Profile Telemetry</h3>
                    <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-black uppercase text-foreground">Profile Activity</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Oct - Dec Period</p>
                            </div>
                            <span className="text-lg font-black text-foreground">306</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-black uppercase text-foreground">Profile Visits</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Oct - Dec Period</p>
                            </div>
                            <span className="text-lg font-black text-foreground">302</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-black uppercase text-foreground">External Link Taps</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Oct - Dec Period</p>
                            </div>
                            <span className="text-lg font-black text-primary">4 Taps</span>
                        </div>
                    </div>
                </Card>
            </div>

            {/* 3. MARKETING ROI & LEAD CONVERSION METRICS (SCREENSHOT 2) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-left">
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Marketing Leads (MQL)</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{stats.mqls}</p>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        +12% vs Target
                    </span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Cost Per MQL</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{stats.costPerMql}</p>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        -8% vs Target
                    </span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">MQL to SQL Conversion</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{stats.conversionRate}</p>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        +4% vs Target
                    </span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Marketing ROI</p>
                    <p className="text-3xl font-black text-primary tabular-nums">{stats.marketingRoi}</p>
                    <span className="text-[8px] font-black uppercase text-primary bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                        $4.20 per $1 spent
                    </span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-2 col-span-2 sm:col-span-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Website Traffic</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{stats.websiteTraffic}</p>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        +18% MoM
                    </span>
                </Card>
            </div>

            {/* 4. CUSTOMER ACQUISITION MIX PIE BREAKDOWN (SCREENSHOT 3) */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <PieChart className="h-6 w-6 text-primary" />
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">New Customer Acquisition Mix</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Q1 Channel Performance & Conversion Attribution</p>
                        </div>
                    </div>
                    <span className="text-xl font-black text-primary font-mono">14,500 Total Conversions</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <p className="text-[9px] font-black uppercase text-slate-400">Organic Search</p>
                        <p className="text-3xl font-black text-foreground">45%</p>
                        <p className="text-[9px] font-bold text-emerald-600 uppercase">Top Acquisition Channel</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <p className="text-[9px] font-black uppercase text-slate-400">Referrals</p>
                        <p className="text-3xl font-black text-foreground">30%</p>
                        <p className="text-[9px] font-bold text-emerald-600 uppercase">Viral Word of Mouth</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <p className="text-[9px] font-black uppercase text-slate-400">Paid Social Ads</p>
                        <p className="text-3xl font-black text-foreground">15%</p>
                        <p className="text-[9px] font-bold text-amber-600 uppercase">Meta & TikTok Ads</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <p className="text-[9px] font-black uppercase text-slate-400">Direct Traffic</p>
                        <p className="text-3xl font-black text-foreground">10%</p>
                        <p className="text-[9px] font-bold text-indigo-600 uppercase">Repeat Patrons</p>
                    </div>
                </div>
            </Card>
        </div>
    );
}
