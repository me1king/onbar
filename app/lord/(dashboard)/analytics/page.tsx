'use client';

import * as React from 'react';
import {
    BarChart3,
    Activity as Zap,
    Download,
    Sparkles,
    Loader2,
    DollarSign,
    Truck,
    Flame,
    MessageSquare,
    MousePointer2,
    Bot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';

type AnalyticsTabId = 'overview' | 'roi' | 'performance' | 'ab_testing' | 'dispatch' | 'kitchen' | 'stock' | 'support' | 'ux_heatmaps' | 'ai_insights';

interface PerformanceReport {
    periodDays: number;
    data: {
        summary: {
            sessions: number;
            visitors: number;
            pageViews: number;
            orders: number;
            convertedSessions: number;
            revenue: number;
            averageSessionSeconds: number;
            averageActiveSeconds: number;
            singlePageSessions: number;
            conversionRate: number;
            singlePageRate: number;
        };
        daily: Array<{ date: string; sessions: number; pageViews: number; orders: number; revenue: number }>;
        sources: Array<{
            source: string;
            medium: string;
            sessions: number;
            convertedSessions: number;
            orders: number;
            revenue: number;
            conversionRate: number;
        }>;
        campaigns: Array<{
            source: string;
            medium: string;
            campaign: string;
            sessions: number;
            convertedSessions: number;
            orders: number;
            revenue: number;
            conversionRate: number;
        }>;
        pages: Array<{ page: string; views: number; sessions: number; averageSeconds: number }>;
        devices: Array<{ device: string; sessions: number }>;
        funnel: {
            visitors: number;
            productViewers: number;
            cartSessions: number;
            checkoutSessions: number;
            purchasers: number;
        };
    };
}

interface HeatmapClick {
    x: number;
    y: number;
    path: string;
    device: 'mobile' | 'desktop';
    coordinateSpace: 'page' | 'floating';
}

interface HeatmapResponse {
    clicks?: HeatmapClick[];
    totalEvents?: number;
    sampledEvents?: number;
    truncated?: boolean;
    error?: string;
}

export default function AdminAnalyticsPage() {
    const [activeTab, setActiveTab] = React.useState<AnalyticsTabId>('overview');
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [liveStats, setLiveStats] = React.useState<{
        totalRevenue: number | null;
        activeUsers: number | null;
        conversionRate: string | null;
        avgOrderValue: number | null;
        inventoryValue: number | null;
        supportTickets: number | null;
    }>({
        totalRevenue: null,
        activeUsers: null,
        conversionRate: null,
        avgOrderValue: null,
        inventoryValue: null,
        supportTickets: null
    });
    const [kdsStats, setKdsStats] = React.useState<{
        activeRunners: number | null;
        preparingOrders: number | null;
        totalSignals: number | null;
    }>({
        activeRunners: null,
        preparingOrders: null,
        totalSignals: null
    });
    const [heatmapClicks, setHeatmapClicks] = React.useState<HeatmapClick[]>([]);
    const [heatmapLoading, setHeatmapLoading] = React.useState(false);
    const [heatmapError, setHeatmapError] = React.useState<string | null>(null);
    const [heatmapDays, setHeatmapDays] = React.useState(7);
    const [heatmapPath, setHeatmapPath] = React.useState('');
    const [heatmapDevice, setHeatmapDevice] = React.useState<'mobile' | 'desktop'>('mobile');
    const [heatmapCoordinateSpace, setHeatmapCoordinateSpace] = React.useState<'page' | 'floating'>('page');
    const [heatmapSampleInfo, setHeatmapSampleInfo] = React.useState({ total: 0, sampled: 0, truncated: false });
    const [performanceDays, setPerformanceDays] = React.useState(30);
    const [performanceReport, setPerformanceReport] = React.useState<PerformanceReport | null>(null);
    const [performanceLoading, setPerformanceLoading] = React.useState(false);
    const [performanceError, setPerformanceError] = React.useState<string | null>(null);
    const displayCount = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString();
    const displayPrice = (value: number | null) => value === null ? 'Unavailable' : formatPrice(value);
    const formatDuration = (seconds: number) => seconds < 60
        ? `${Math.round(seconds)} sec`
        : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`;

    React.useEffect(() => {
        if (new URLSearchParams(window.location.search).get('tab') === 'ux_heatmaps') {
            setActiveTab('ux_heatmaps');
        }
    }, []);

    React.useEffect(() => {
        if (activeTab !== 'ux_heatmaps') return;
        let active = true;
        setHeatmapLoading(true);
        setHeatmapError(null);

        fetch(`/api/admin/analytics/heatmap?days=${heatmapDays}`, { cache: 'no-store' })
            .then(async response => {
                const result = await response.json() as HeatmapResponse;
                if (!response.ok) throw new Error(result.error || 'Could not load recorded click data.');
                if (active) {
                    const clicks = result.clicks || [];
                    setHeatmapClicks(clicks);
                    setHeatmapSampleInfo({
                        total: result.totalEvents ?? clicks.length,
                        sampled: result.sampledEvents ?? clicks.length,
                        truncated: result.truncated ?? false
                    });
                    setHeatmapPath(currentPath =>
                        currentPath && clicks.some(click => click.path === currentPath)
                            ? currentPath
                            : clicks.some(click => click.path === '/')
                                ? '/'
                                : clicks[0]?.path || ''
                    );
                }
            })
            .catch(error => {
                if (!active) return;
                console.error('[AnalyticsHeatmap] Could not load recorded clicks:', error);
                setHeatmapClicks([]);
                setHeatmapSampleInfo({ total: 0, sampled: 0, truncated: false });
                setHeatmapError(error instanceof Error ? error.message : 'Could not load recorded click data.');
            })
            .finally(() => {
                if (active) setHeatmapLoading(false);
            });

        return () => { active = false; };
    }, [activeTab, heatmapDays]);

    const heatmapPaths = React.useMemo(
        () => Array.from(new Set(heatmapClicks.map(click => click.path))).sort(),
        [heatmapClicks]
    );
    const visibleHeatmapClicks = React.useMemo(
        () => heatmapClicks.filter(click =>
            click.path === heatmapPath &&
            click.device === heatmapDevice &&
            click.coordinateSpace === heatmapCoordinateSpace
        ),
        [heatmapClicks, heatmapPath, heatmapDevice, heatmapCoordinateSpace]
    );
    const heatmapCells = React.useMemo(() => {
        const columns = 24;
        const rows = 48;
        const counts = Array.from({ length: columns * rows }, () => 0);
        visibleHeatmapClicks.forEach(click => {
            const column = Math.min(columns - 1, Math.floor(click.x / 100 * columns));
            const row = Math.min(rows - 1, Math.floor(click.y / 100 * rows));
            counts[row * columns + column] += 1;
        });
        return counts;
    }, [visibleHeatmapClicks]);
    const heatmapPeak = Math.max(0, ...heatmapCells);

    React.useEffect(() => {
        let active = true;
        async function fetchData() {
            setLoading(true);
            try {
                const response = await fetch('/api/admin/analytics/dashboard', { cache: 'no-store' });
                const result = await response.json() as {
                    stats?: typeof liveStats & typeof kdsStats;
                    problems?: string[];
                    error?: string;
                };
                if (!response.ok) throw new Error(result.error || 'Unable to load analytics.');
                if (!active) return;
                const stats = result.stats;
                if (!stats) throw new Error('Analytics response did not include dashboard metrics.');
                setLiveStats({
                    totalRevenue: stats.totalRevenue,
                    activeUsers: stats.activeUsers,
                    conversionRate: stats.conversionRate,
                    avgOrderValue: stats.avgOrderValue,
                    inventoryValue: stats.inventoryValue,
                    supportTickets: stats.supportTickets
                });
                setKdsStats({
                    activeRunners: stats.activeRunners,
                    preparingOrders: stats.preparingOrders,
                    totalSignals: stats.totalSignals
                });
                setError((result.problems || []).join(' · '));
            } catch (err) {
                if (!active) return;
                console.error("Analytics fetch error:", err);
                setError(err instanceof Error ? err.message : 'Unable to load analytics.');
                setLiveStats({
                    totalRevenue: null,
                    activeUsers: null,
                    conversionRate: null,
                    avgOrderValue: null,
                    inventoryValue: null,
                    supportTickets: null
                });
                setKdsStats({ activeRunners: null, preparingOrders: null, totalSignals: null });
            } finally {
                if (active) setLoading(false);
            }
        }
        fetchData();
        return () => { active = false; };
    }, []);

    React.useEffect(() => {
        let active = true;
        setPerformanceLoading(true);
        setPerformanceError(null);
        fetch(`/api/admin/analytics/performance?days=${performanceDays}`, { cache: 'no-store' })
            .then(async response => {
                const result = await response.json() as { data?: PerformanceReport['data']; periodDays?: number; error?: string };
                if (!response.ok) throw new Error(result.error || 'Unable to load traffic and conversion analytics.');
                if (!result.data || !result.periodDays) throw new Error('Analytics response did not include traffic metrics.');
                if (active) setPerformanceReport({ data: result.data, periodDays: result.periodDays });
            })
            .catch(error => {
                if (!active) return;
                console.error('[StorefrontAnalytics] Could not load traffic metrics:', error);
                setPerformanceReport(null);
                setPerformanceError(error instanceof Error ? error.message : 'Unable to load traffic and conversion analytics.');
            })
            .finally(() => {
                if (active) setPerformanceLoading(false);
            });
        return () => { active = false; };
    }, [performanceDays]);

    const handleDownloadReport = () => {
        const headers = ['Metric', 'Value'];
        const rows: Array<[string, string | number | null | undefined]> = [
            ['Traffic reporting period', performanceReport ? `Last ${performanceReport.periodDays} days` : 'Unavailable'],
            ['Completed Order Revenue (All Time)', liveStats.totalRevenue],
            ['Registered Members', liveStats.activeUsers],
            ['Consented Session Conversion Rate', performanceReport ? `${performanceReport.data.summary.conversionRate}%` : null],
            ['Consented Unique Visitors', performanceReport?.data.summary.visitors],
            ['Consented Sessions', performanceReport?.data.summary.sessions],
            ['Consented Page Views', performanceReport?.data.summary.pageViews],
            ['Average Engaged Time (seconds)', performanceReport?.data.summary.averageActiveSeconds],
            ['Average Order Value', liveStats.avgOrderValue],
            ['Listed-Price Stock Value', liveStats.inventoryValue],
            ['Support Tickets', liveStats.supportTickets]
        ];
        performanceReport?.data.sources.forEach(row => {
            rows.push([`Source ${row.source} / ${row.medium} · sessions`, row.sessions]);
            rows.push([`Source ${row.source} / ${row.medium} · orders`, row.orders]);
            rows.push([`Source ${row.source} / ${row.medium} · revenue`, row.revenue]);
        });
        performanceReport?.data.campaigns.forEach(row => {
            rows.push([`Campaign ${row.campaign} (${row.source} / ${row.medium}) · sessions`, row.sessions]);
            rows.push([`Campaign ${row.campaign} (${row.source} / ${row.medium}) · orders`, row.orders]);
            rows.push([`Campaign ${row.campaign} (${row.source} / ${row.medium}) · revenue`, row.revenue]);
        });
        const encodeCsv = (value: string | number | null | undefined) =>
            `"${String(value == null ? 'Unavailable' : value).replaceAll('"', '""')}"`;
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows]
            .map(row => row.map(encodeCsv).join(","))
            .join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `BAR_OS_Analytics_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-4">Loading analytics...</p>
        </div>
    );

    return (
        <div className="min-w-0 p-4 sm:p-8 space-y-8 sm:space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Store Analytics</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-foreground uppercase tracking-tighter">Unified Analytics Command</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Store totals use completed orders; unavailable metrics are labeled rather than estimated.</p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm text-[9px] font-black uppercase text-slate-500">
                        Built-in · all-time totals
                    </div>
                    <a
                        href="https://vercel.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-[9px] font-black uppercase tracking-widest text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        Open Vercel Analytics ↗
                    </a>
                    <Button
                        onClick={handleDownloadReport}
                        variant="outline"
                        className="rounded-xl h-11 px-6 border-slate-200 bg-white font-black uppercase text-[9px] tracking-widest shadow-sm"
                    >
                        <Download className="h-3.5 w-3.5 mr-2" /> Report
                    </Button>
                </div>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}

            {/* 10 ANALYTICS TABS NAVIGATION BAR */}
            <div className="flex gap-2 p-1.5 bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-x-auto no-scrollbar max-w-full">
                {[
                    { id: 'overview', label: '1. Executive Overview', icon: Sparkles },
                    { id: 'roi', label: '2. Completed Sales', icon: DollarSign },
                    { id: 'performance', label: '3. Traffic & Conversion', icon: BarChart3 },
                    { id: 'ab_testing', label: '4. Experiment Tracking', icon: Zap },
                    { id: 'dispatch', label: '5. Dispatch Fleet', icon: Truck },
                    { id: 'kitchen', label: '6. Kitchen KDS', icon: Flame },
                    { id: 'stock', label: '7. Stock Radar', icon: BarChart3 },
                    { id: 'support', label: '8. Support Tickets', icon: MessageSquare },
                    { id: 'ux_heatmaps', label: '9. UX Events', icon: MousePointer2 },
                    { id: 'ai_insights', label: '10. Store Summary', icon: Bot },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as AnalyticsTabId)}
                        className={cn(
                            "flex items-center gap-2.5 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border border-transparent",
                            activeTab === tab.id ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" : "text-slate-500 hover:bg-slate-100 hover:text-foreground"
                        )}
                    >
                        <tab.icon className="h-3.5 w-3.5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB 1: EXECUTIVE OVERVIEW */}
            {activeTab === 'overview' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
                        <Card className="min-w-0 p-4 sm:p-8 rounded-2xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Completed Revenue · All Time</p>
                            <p className="text-3xl font-black text-foreground">{displayPrice(liveStats.totalRevenue)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Paid and delivered orders
                            </span>
                        </Card>
                        <Card className="min-w-0 p-4 sm:p-8 rounded-2xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Registered Members</p>
                            <p className="text-3xl font-black text-foreground">{displayCount(liveStats.activeUsers)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Registered customer profiles
                            </span>
                        </Card>
                        <Card className="min-w-0 p-4 sm:p-8 rounded-2xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Conversion Rate</p>
                            <p className="text-3xl font-black text-foreground">
                                {performanceReport ? `${performanceReport.data.summary.conversionRate}%` : performanceLoading ? 'Loading…' : 'Unavailable'}
                            </p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                {performanceReport ? `Consented sessions · ${performanceReport.periodDays} days` : 'Apply analytics migration to enable'}
                            </span>
                        </Card>
                        <Card className="min-w-0 p-4 sm:p-8 rounded-2xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Avg Order Value</p>
                            <p className="text-3xl font-black text-foreground">{displayPrice(liveStats.avgOrderValue)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Paid and delivered orders
                            </span>
                        </Card>
                    </div>

                    <Card className="p-5 sm:p-8 rounded-2xl sm:rounded-[3.5rem] bg-white text-foreground border border-slate-200 shadow-sm space-y-4 relative overflow-hidden">
                        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-200 pb-4">
                            <div className="flex items-center gap-3">
                                <Sparkles className="h-6 w-6 text-primary" />
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">Analytics availability</h3>
                                    <p className="text-[9px] font-bold text-slate-500 uppercase">Recorded store metrics</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                Anomaly detection not configured
                            </span>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                            <h4 className="text-sm font-black uppercase text-foreground">Current snapshot</h4>
                            <p className="text-xs font-medium text-slate-600 leading-relaxed">
                                Completed-order revenue: {displayPrice(liveStats.totalRevenue)}; registered profiles: {displayCount(liveStats.activeUsers)}; listed-price stock value: {displayPrice(liveStats.inventoryValue)}. The traffic report counts only analytics-consented visits; visitors who decline are excluded.
                            </p>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 2: MARKETING ROI */}
            {activeTab === 'roi' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Registered Members</p>
                            <p className="text-3xl font-black text-foreground">{displayCount(liveStats.activeUsers)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Live DB</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Avg Order Value</p>
                            <p className="text-3xl font-black text-foreground">{displayPrice(liveStats.avgOrderValue)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Live DB</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Conversion Rate</p>
                            <p className="text-3xl font-black text-foreground">
                                {performanceReport ? `${performanceReport.data.summary.conversionRate}%` : performanceLoading ? 'Loading…' : 'Unavailable'}
                            </p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Consented sessions · period selected</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Completed Revenue · All Time</p>
                            <p className="text-3xl font-black text-primary">{displayPrice(liveStats.totalRevenue)}</p>
                            <span className="text-[8px] font-black uppercase text-primary bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Live Orders</span>
                        </Card>
                    </div>
                </div>
            )}

            {/* TAB 3: TRAFFIC & CONVERSION */}
            {activeTab === 'performance' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">Traffic & conversion</h2>
                            <p className="mt-1 text-xs font-medium text-slate-500">Visits, engagement, campaign attribution, and completed orders from opted-in visitors.</p>
                        </div>
                        <label className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Reporting period
                            <select
                                aria-label="Analytics reporting period"
                                value={performanceDays}
                                onChange={event => setPerformanceDays(Number(event.target.value))}
                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                            >
                                {[7, 30, 90, 365].map(days => <option key={days} value={days}>Last {days} days</option>)}
                            </select>
                        </label>
                    </div>

                    <p className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs leading-relaxed text-sky-900">
                        Privacy note: counts include only sessions with analytics consent. “Unique visitors” is an estimate based on consented account or browser IDs. Campaign revenue is attributed to the session source; ad spend is not connected, so this is not profit or ad ROI.
                    </p>

                    {performanceError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{performanceError}</p>}
                    {performanceLoading && <div className="flex items-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading traffic report…</div>}
                    {performanceReport && (
                        <>
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
                                {[
                                    ['Unique visitors', performanceReport.data.summary.visitors.toLocaleString(), 'Consented browsers/accounts'],
                                    ['Visits / sessions', performanceReport.data.summary.sessions.toLocaleString(), 'New session after 30 min idle'],
                                    ['Page views', performanceReport.data.summary.pageViews.toLocaleString(), 'Public pages only'],
                                    ['Average time on site', formatDuration(performanceReport.data.summary.averageSessionSeconds), 'Page dwell; heartbeat fallback'],
                                    ['Average engaged time', formatDuration(performanceReport.data.summary.averageActiveSeconds), 'Active time from session heartbeats'],
                                    ['Completed orders', performanceReport.data.summary.orders.toLocaleString(), 'Paid or delivered'],
                                    ['Session conversion', `${performanceReport.data.summary.conversionRate}%`, `${performanceReport.data.summary.convertedSessions.toLocaleString()} converted sessions`],
                                    ['Completed revenue', displayPrice(performanceReport.data.summary.revenue), 'From consented attributed sessions'],
                                    ['Single-page sessions', `${performanceReport.data.summary.singlePageRate}%`, `${performanceReport.data.summary.singlePageSessions.toLocaleString()} sessions`]
                                ].map(([label, value, note]) => (
                                    <Card key={label} className="min-w-0 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                        <p className="break-words text-2xl font-black text-foreground">{value}</p>
                                        <p className="text-[9px] font-bold text-slate-500">{note}</p>
                                    </Card>
                                ))}
                            </div>

                            <Card className="p-5 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5">
                                <div>
                                    <h3 className="text-lg font-black uppercase text-foreground">Conversion funnel</h3>
                                    <p className="text-xs text-slate-500">Distinct consented sessions at each tracked stage.</p>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                    {[
                                        ['Visited', performanceReport.data.funnel.visitors],
                                        ['Viewed product', performanceReport.data.funnel.productViewers],
                                        ['Added to cart', performanceReport.data.funnel.cartSessions],
                                        ['Started checkout', performanceReport.data.funnel.checkoutSessions],
                                        ['Completed order', performanceReport.data.funnel.purchasers]
                                    ].map(([label, value], index) => (
                                        <div key={label} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                                            <p className="mt-2 text-2xl font-black text-foreground">{Number(value).toLocaleString()}</p>
                                            {index > 0 && <p className="mt-1 text-[9px] text-slate-400">{performanceReport.data.funnel.visitors ? `${(Number(value) / performanceReport.data.funnel.visitors * 100).toFixed(1)}% of visitors` : '—'}</p>}
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm">
                                <div className="p-5 sm:p-7 border-b border-slate-100">
                                    <h3 className="text-lg font-black uppercase text-foreground">Traffic sources</h3>
                                    <p className="text-xs text-slate-500">UTM source and medium, or referring domain. Revenue includes paid/delivered orders only.</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[700px] text-left text-xs">
                                        <thead className="bg-slate-50 text-[9px] uppercase tracking-widest text-slate-500">
                                            <tr>{['Source', 'Medium', 'Sessions', 'Orders', 'Conversion', 'Revenue'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {performanceReport.data.sources.map((row, index) => (
                                                <tr key={`${row.source}-${row.medium}-${index}`} className="border-t border-slate-100">
                                                    <td className="px-5 py-4 font-bold text-foreground">{row.source}</td>
                                                    <td className="px-5 py-4 text-slate-600">{row.medium}</td>
                                                    <td className="px-5 py-4">{row.sessions.toLocaleString()}</td>
                                                    <td className="px-5 py-4">{row.orders.toLocaleString()}</td>
                                                    <td className="px-5 py-4">{row.conversionRate}%</td>
                                                    <td className="px-5 py-4 font-bold">{displayPrice(row.revenue)}</td>
                                                </tr>
                                            ))}
                                            {performanceReport.data.sources.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No consented sessions recorded in this period.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                <Card className="overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm">
                                    <div className="p-5 border-b border-slate-100">
                                        <h3 className="text-lg font-black uppercase text-foreground">Campaigns</h3>
                                        <p className="text-xs text-slate-500">
                                            Tag ad links, for example <code className="rounded bg-slate-100 px-1 py-0.5">?utm_source=instagram&amp;utm_medium=paid_social&amp;utm_campaign=launch</code>.
                                        </p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[560px] text-left text-xs">
                                            <thead className="bg-slate-50 text-[9px] uppercase tracking-widest text-slate-500"><tr>{['Campaign', 'Source / medium', 'Sessions', 'Orders', 'Revenue'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
                                            <tbody>
                                                {performanceReport.data.campaigns.map((row, index) => (
                                                    <tr key={`${row.campaign}-${row.source}-${index}`} className="border-t border-slate-100">
                                                        <td className="px-4 py-3 font-bold">{row.campaign}</td>
                                                        <td className="px-4 py-3 text-slate-600">{row.source} / {row.medium}</td>
                                                        <td className="px-4 py-3">{row.sessions.toLocaleString()}</td>
                                                        <td className="px-4 py-3">{row.orders.toLocaleString()} · {row.conversionRate}%</td>
                                                        <td className="px-4 py-3 font-bold">{displayPrice(row.revenue)}</td>
                                                    </tr>
                                                ))}
                                                {performanceReport.data.campaigns.length === 0 && <tr><td colSpan={5} className="px-4 py-7 text-center text-slate-500">No tagged campaigns recorded in this period.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>

                                <Card className="overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm">
                                    <div className="p-5 border-b border-slate-100">
                                        <h3 className="text-lg font-black uppercase text-foreground">Top pages</h3>
                                        <p className="text-xs text-slate-500">Page-view counts and average time before leaving each page.</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[420px] text-left text-xs">
                                            <thead className="bg-slate-50 text-[9px] uppercase tracking-widest text-slate-500"><tr>{['Page', 'Views', 'Sessions', 'Avg. time'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
                                            <tbody>
                                                {performanceReport.data.pages.map((row, index) => (
                                                    <tr key={`${row.page}-${index}`} className="border-t border-slate-100">
                                                        <td className="max-w-[200px] truncate px-4 py-3 font-bold" title={row.page}>{row.page}</td>
                                                        <td className="px-4 py-3">{row.views.toLocaleString()}</td>
                                                        <td className="px-4 py-3">{row.sessions.toLocaleString()}</td>
                                                        <td className="px-4 py-3">{formatDuration(row.averageSeconds)}</td>
                                                    </tr>
                                                ))}
                                                {performanceReport.data.pages.length === 0 && <tr><td colSpan={4} className="px-4 py-7 text-center text-slate-500">No page views recorded in this period.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                <Card className="p-5 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-sm">
                                    <h3 className="text-lg font-black uppercase text-foreground">Daily visits</h3>
                                    <p className="mb-5 text-xs text-slate-500">Daily session counts in East Africa Time.</p>
                                    <div className="space-y-2">
                                        {performanceReport.data.daily.map(day => {
                                            const maximum = Math.max(1, ...performanceReport.data.daily.map(item => item.sessions));
                                            return (
                                                <div key={day.date} className="grid grid-cols-[76px_1fr_42px] items-center gap-3 text-[10px]">
                                                    <span className="text-slate-500">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${day.sessions / maximum * 100}%` }} /></div>
                                                    <span className="text-right font-bold text-slate-700">{day.sessions}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Card>
                                <Card className="p-5 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-sm">
                                    <h3 className="text-lg font-black uppercase text-foreground">Device mix</h3>
                                    <p className="mb-5 text-xs text-slate-500">Visitor sessions by broad device type.</p>
                                    <div className="space-y-3">
                                        {performanceReport.data.devices.map(row => (
                                            <div key={row.device} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                                                <span className="text-xs font-bold text-slate-700">{row.device}</span>
                                                <span className="text-sm font-black text-foreground">{row.sessions.toLocaleString()} sessions</span>
                                            </div>
                                        ))}
                                        {performanceReport.data.devices.length === 0 && <p className="text-xs text-slate-500">No device data recorded yet.</p>}
                                    </div>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* TAB 4: A/B TESTING */}
            {activeTab === 'ab_testing' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-5 sm:p-8 rounded-2xl sm:rounded-[3.5rem] bg-white text-foreground border border-slate-200 shadow-sm space-y-6">
                        <div className="border-b border-slate-200 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Experiment tracking</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground mt-1">A/B testing unavailable</h3>
                            <p className="mt-2 text-sm text-muted-foreground">The store does not currently record experiment assignments or variant conversions.</p>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 5: DISPATCH FLEET */}
            {activeTab === 'dispatch' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Dispatch Fleet & Route Analytics</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Live Rider Telemetry & Delivery SLA</p>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {displayCount(kdsStats.activeRunners)} Runners
                            </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Active Riders</p>
                                <p className="text-3xl font-black text-foreground">{displayCount(kdsStats.activeRunners)}</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Preparing Orders</p>
                                <p className="text-3xl font-black text-amber-600">{displayCount(kdsStats.preparingOrders)}</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Peak Delivery Window</p>
                                <p className="text-2xl font-black text-primary">Unavailable</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Delivery SLA</p>
                                <p className="text-3xl font-black text-indigo-600">Unavailable</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 6: KITCHEN & KDS OPERATIONS ANALYTICS */}
            {activeTab === 'kitchen' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="min-w-0 break-words text-lg sm:text-2xl font-black uppercase tracking-tight text-foreground">Kitchen & KDS Operations Analytics</h3>
                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                {displayCount(kdsStats.preparingOrders)} Orders Preparing
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Vehicles On Road</p>
                                <p className="break-words text-2xl sm:text-3xl font-black text-foreground">{displayCount(kdsStats.activeRunners)} Runners</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Currently Prepared</p>
                                <p className="break-words text-2xl sm:text-3xl font-black text-amber-600">{displayCount(kdsStats.preparingOrders)} Tickets</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Customer Satisfaction</p>
                                <p className="text-3xl font-black text-emerald-600">Unavailable</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 7: STOCK INTELLIGENCE & WAREHOUSE RADAR */}
            {activeTab === 'stock' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Stock Intelligence & Warehouse Radar</h3>
                            <span className="text-2xl font-black text-emerald-600">{displayPrice(liveStats.inventoryValue)} Listed-Price Stock Value</span>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 8: SUPPORT TICKETS */}
            {activeTab === 'support' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Support & Complaint Analytics</h3>
                            <span className="text-2xl font-black text-foreground">{displayCount(liveStats.supportTickets)} Tracked Support Tickets</span>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 9: UX HEATMAPS */}
            {activeTab === 'ux_heatmaps' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-5 sm:p-8 rounded-2xl sm:rounded-[3.5rem] bg-white text-foreground border border-slate-200 shadow-sm space-y-6">
                        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Consent-based click analytics</span>
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground mt-1">Storefront click heatmap</h3>
                                <p className="mt-2 text-sm text-slate-500">Actual opted-in clicks, shown separately by page and device—not estimated activity.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <select
                                    aria-label="Heatmap time range"
                                    value={heatmapDays}
                                    onChange={event => setHeatmapDays(Number(event.target.value))}
                                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"
                                >
                                    <option value={7}>Last 7 days</option>
                                    <option value={30}>Last 30 days</option>
                                </select>
                                <select
                                    aria-label="Heatmap page"
                                    value={heatmapPath}
                                    onChange={event => setHeatmapPath(event.target.value)}
                                    className="h-10 max-w-48 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"
                                >
                                    <option value="" disabled>Select a page</option>
                                    {heatmapPaths.map(path => <option key={path} value={path}>{path}</option>)}
                                </select>
                                <select
                                    aria-label="Heatmap device"
                                    value={heatmapDevice}
                                    onChange={event => setHeatmapDevice(event.target.value as 'mobile' | 'desktop')}
                                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"
                                >
                                    <option value="mobile">Mobile</option>
                                    <option value="desktop">Desktop</option>
                                </select>
                                <select
                                    aria-label="Heatmap interaction area"
                                    value={heatmapCoordinateSpace}
                                    onChange={event => setHeatmapCoordinateSpace(event.target.value as 'page' | 'floating')}
                                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"
                                >
                                    <option value="page">Page content</option>
                                    <option value="floating">Sticky & floating UI</option>
                                </select>
                            </div>
                        </div>
                        {heatmapError ? (
                            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{heatmapError}</div>
                        ) : heatmapLoading ? (
                            <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-50 p-12 text-sm font-bold text-slate-500">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading recorded clicks...
                            </div>
                        ) : heatmapClicks.length === 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center text-sm font-semibold text-amber-900">
                                No opted-in clicks are recorded for this selection yet. Heatmap collection starts after a visitor allows analytics and interacts with the storefront.
                            </div>
                        ) : visibleHeatmapClicks.length === 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center text-sm font-semibold text-amber-900">
                                No recorded clicks match this page, device, and interaction area. Select another page/device or switch between page content and sticky/floating UI.
                            </div>
                        ) : (
                            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
                                <div>
                                    <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        <span>{heatmapCoordinateSpace === 'page' ? 'Top of page' : 'Top of viewport'} · {heatmapPath}</span>
                                        <span>{visibleHeatmapClicks.length.toLocaleString()} mapped clicks · {heatmapSampleInfo.sampled.toLocaleString()} events sampled</span>
                                    </div>
                                    <div
                                        role="img"
                                        aria-label={`Page-relative click heatmap with ${visibleHeatmapClicks.length} recorded clicks`}
                                        className="grid aspect-[1/1.45] max-h-[720px] grid-cols-24 grid-rows-[repeat(48,minmax(0,1fr))] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                                    >
                                        {heatmapCells.map((count, index) => (
                                            <div
                                                key={index}
                                                title={`${count} click${count === 1 ? '' : 's'}`}
                                                className="border border-white/70"
                                                style={{
                                                    backgroundColor: count > 0
                                                        ? `rgba(249, 115, 22, ${0.12 + (count / heatmapPeak) * 0.78})`
                                                        : undefined
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div className="mt-3 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        <span>Left</span>
                                        <span>{heatmapCoordinateSpace === 'page' ? 'Page depth' : 'Viewport position'} normalized by device</span>
                                        <span>Right</span>
                                    </div>
                                </div>
                                <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Most-clicked areas</h4>
                                    <ol className="mt-4 space-y-3">
                                        {heatmapCells
                                            .map((count, index) => ({ count, index }))
                                            .filter(cell => cell.count > 0)
                                            .sort((a, b) => b.count - a.count)
                                            .slice(0, 5)
                                            .map(({ count, index }) => (
                                                <li key={index} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                                                    <span>Column {index % 24 + 1}, page depth {Math.floor(index / 24) * 100 / 48 | 0}%</span>
                                                    <strong className="shrink-0 text-slate-900">{count} clicks</strong>
                                                </li>
                                            ))}
                                    </ol>
                                    <p className="mt-5 border-t border-slate-200 pt-4 text-[10px] leading-relaxed text-slate-500">
                                        Hotter cells represent more recorded clicks. Form fields and typed values are not included in this map.
                                        {heatmapSampleInfo.truncated && ` Showing the latest ${heatmapSampleInfo.sampled.toLocaleString()} of ${heatmapSampleInfo.total.toLocaleString()} matching events.`}
                                    </p>
                                </aside>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* TAB 10: AI MORNING BRIEF */}
            {activeTab === 'ai_insights' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-5 sm:p-8 rounded-2xl sm:rounded-[3.5rem] bg-white text-foreground border border-slate-200 shadow-sm space-y-6">
                        <div className="border-b border-slate-200 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Store data summary</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground mt-1">Executive Summary</h3>
                        </div>

                        <div className="p-4 sm:p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-sm text-slate-700">
                            <p className="text-primary font-black uppercase text-sm mb-4">All-time recorded totals</p>
                            <ul className="space-y-2 leading-relaxed">
                                <li>Completed-order revenue (paid or delivered): {displayPrice(liveStats.totalRevenue)}.</li>
                                <li>Registered member profiles: {displayCount(liveStats.activeUsers)}.</li>
                                <li>Average completed-order value: {displayPrice(liveStats.avgOrderValue)}; consented-session conversion: {performanceReport ? `${performanceReport.data.summary.conversionRate}%` : 'Unavailable'}.</li>
                                <li>Listed-price stock value (not cost valuation): {displayPrice(liveStats.inventoryValue)}.</li>
                                <li>Support tickets recorded: {displayCount(liveStats.supportTickets)}.</li>
                            </ul>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
