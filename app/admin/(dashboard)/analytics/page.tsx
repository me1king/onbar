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
    const displayCount = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString();
    const displayPrice = (value: number | null) => value === null ? 'Unavailable' : formatPrice(value);

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

    const handleDownloadReport = () => {
        const headers = ['Metric', 'Value'];
        const rows = [
            ['Completed Order Revenue (All Time)', liveStats.totalRevenue],
            ['Registered Members', liveStats.activeUsers],
            ['Conversion Rate', liveStats.conversionRate],
            ['Average Order Value', liveStats.avgOrderValue],
            ['Listed-Price Stock Value', liveStats.inventoryValue],
            ['Support Tickets', liveStats.supportTickets]
        ];
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows]
            .map(row => row.map(value => value == null ? 'Unavailable' : String(value)).join(","))
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
                        All-time totals
                    </div>
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
                    { id: 'performance', label: '3. Channel Attribution', icon: BarChart3 },
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
                            <p className="text-3xl font-black text-foreground">{liveStats.conversionRate ?? 'Unavailable'}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Requires session conversion data
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
                                Completed-order revenue: {displayPrice(liveStats.totalRevenue)}; registered profiles: {displayCount(liveStats.activeUsers)}; listed-price stock value: {displayPrice(liveStats.inventoryValue)}. Conversion rate is unavailable because session conversion tracking is not configured.
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
                            <p className="text-3xl font-black text-foreground">{liveStats.conversionRate ?? 'Unavailable'}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Live DB</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Completed Revenue · All Time</p>
                            <p className="text-3xl font-black text-primary">{displayPrice(liveStats.totalRevenue)}</p>
                            <span className="text-[8px] font-black uppercase text-primary bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Live Orders</span>
                        </Card>
                    </div>
                </div>
            )}

            {/* TAB 3: CHANNEL MIX */}
            {activeTab === 'performance' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Marketing Performance & Channel Mix</h3>
                            <span className="text-2xl font-black text-primary">{displayPrice(liveStats.totalRevenue)} Revenue Volume</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Direct Traffic</p>
                                <p className="text-3xl font-black text-foreground">Unavailable</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">No attribution data</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Referral Network</p>
                                <p className="text-3xl font-black text-foreground">Unavailable</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">No attribution data</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Social Channels</p>
                                <p className="text-3xl font-black text-foreground">Unavailable</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">No attribution data</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">WhatsApp Dispatch</p>
                                <p className="text-3xl font-black text-foreground">Unavailable</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">No attribution data</p>
                            </div>
                        </div>
                    </Card>
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
                                <li>Average completed-order value: {displayPrice(liveStats.avgOrderValue)}; conversion rate: {liveStats.conversionRate ?? 'Unavailable'}.</li>
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
