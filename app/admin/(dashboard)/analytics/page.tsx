'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
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
import { useAdmin } from '@/context/AdminContext';

type AnalyticsTabId = 'overview' | 'roi' | 'performance' | 'ab_testing' | 'dispatch' | 'kitchen' | 'stock' | 'support' | 'ux_heatmaps' | 'ai_insights';

export default function AdminAnalyticsPage() {
    const { email: adminEmail } = useAdmin();
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
    const displayCount = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString();
    const displayPrice = (value: number | null) => value === null ? 'Unavailable' : formatPrice(value);

    React.useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                if (supabase) {
                    const [ordersRes, profilesRes, productsRes, ridersRes, eventsRes] = await Promise.all([
                        supabase.from('orders').select('id, total_price, status'),
                        supabase.from('profiles').select('id', { count: 'exact', head: true }),
                        supabase.from('products').select('price, stock'),
                        supabase.from('rider_status').select('id', { count: 'exact', head: true }).neq('status', 'Offline'),
                        supabase.from('analytics_events').select('id', { count: 'exact', head: true })
                    ]);

                    const queryError = ordersRes.error || profilesRes.error || productsRes.error || ridersRes.error || eventsRes.error;
                    if (queryError) throw queryError;

                    const orders = ordersRes.error ? null : ordersRes.data || [];
                    const rev = orders ? orders.reduce((acc, o) => acc + (Number(o.total_price) || 0), 0) : null;
                    const orderCount = orders?.length ?? null;
                    const users = profilesRes.error ? null : profilesRes.count || 0;
                    const aov = orderCount === 0 ? 0 : orderCount !== null && rev !== null ? Math.round(rev / orderCount) : null;

                    const products = productsRes.error ? null : productsRes.data || [];
                    const invVal = products?.reduce((acc, p) => acc + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0) ?? null;

                    const preparingCount = orders?.filter(o => o.status === 'Pending' || o.status === 'Preparing').length ?? null;

                    setLiveStats({
                        totalRevenue: rev,
                        activeUsers: users,
                        conversionRate: null,
                        avgOrderValue: aov,
                        inventoryValue: invVal,
                        supportTickets: null
                    });

                    setKdsStats({
                        activeRunners: ridersRes.error ? null : ridersRes.count || 0,
                        preparingOrders: preparingCount,
                        totalSignals: eventsRes.error ? null : eventsRes.count || 0
                    });
                } else {
                    setError('Supabase is not configured. Analytics are unavailable.');
                }
            } catch (err) {
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
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const handleDownloadReport = () => {
        const headers = ['Metric', 'Value'];
        const rows = [
            ['Total Revenue', liveStats.totalRevenue],
            ['Registered Members', liveStats.activeUsers],
            ['Conversion Rate', liveStats.conversionRate],
            ['Average Order Value', liveStats.avgOrderValue],
            ['Inventory Value', liveStats.inventoryValue],
            ['Support Tickets', liveStats.supportTickets]
        ];
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
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
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Store Analytics</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Unified Analytics Command</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Real-time revenue, marketing ROAS, A/B testing, dispatch routes, kitchen SLA, stock radar, and UX heatmaps.</p>
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
                    { id: 'roi', label: '2. Marketing ROI', icon: DollarSign },
                    { id: 'performance', label: '3. Channel Mix', icon: BarChart3 },
                    { id: 'ab_testing', label: '4. A/B Testing', icon: Zap },
                    { id: 'dispatch', label: '5. Dispatch Fleet', icon: Truck },
                    { id: 'kitchen', label: '6. Kitchen KDS', icon: Flame },
                    { id: 'stock', label: '7. Stock Radar', icon: BarChart3 },
                    { id: 'support', label: '8. Support Tickets', icon: MessageSquare },
                    { id: 'ux_heatmaps', label: '9. UX Heatmaps', icon: MousePointer2 },
                    { id: 'ai_insights', label: '10. AI Morning Brief', icon: Bot },
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Revenue</p>
                            <p className="text-3xl font-black text-foreground">{displayPrice(liveStats.totalRevenue)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ Live Order Volume
                            </span>
                        </Card>
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Registered Members</p>
                            <p className="text-3xl font-black text-foreground">{displayCount(liveStats.activeUsers)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ Verified Customer Accounts
                            </span>
                        </Card>
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Conversion Rate</p>
                            <p className="text-3xl font-black text-foreground">{liveStats.conversionRate ?? 'Unavailable'}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ Live Storefront Yield
                            </span>
                        </Card>
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Avg Order Value</p>
                            <p className="text-3xl font-black text-foreground">{displayPrice(liveStats.avgOrderValue)}</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ Live Cart Average
                            </span>
                        </Card>
                    </div>

                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-4 relative overflow-hidden">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                                <Sparkles className="h-6 w-6 text-amber-400 animate-bounce" />
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">Anomaly Detection Node</h3>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Automated First-Party Spike Analysis</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                Analysis unavailable
                            </span>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                            <h4 className="text-sm font-black uppercase text-amber-400">Telemetry Snapshot</h4>
                            <p className="text-xs font-medium text-slate-300 italic leading-relaxed">
                                Conversion: {liveStats.conversionRate ?? 'Unavailable'}; registered accounts: {displayCount(liveStats.activeUsers)}; inventory value: {displayPrice(liveStats.inventoryValue)}.
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
                            <p className="text-[9px] font-black uppercase text-slate-400">Total Revenue</p>
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
                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6">
                        <div className="border-b border-slate-800 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400">A/B TESTING & EXPERIMENTATION PLATFORM</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white mt-1">Product Page Pricing Optimization</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-6 text-center">
                            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[9px] font-black uppercase text-slate-400">Conversion Rate</p>
                                <p className="text-3xl font-black text-emerald-400">{liveStats.conversionRate ?? 'Unavailable'}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[9px] font-black uppercase text-slate-400">Avg Order Value</p>
                                <p className="text-3xl font-black text-indigo-400">{displayPrice(liveStats.avgOrderValue)}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[9px] font-black uppercase text-slate-400">Registered Members</p>
                                <p className="text-3xl font-black text-amber-400">{displayCount(liveStats.activeUsers)}</p>
                            </div>
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
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Kitchen & KDS Operations Analytics</h3>
                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                {displayCount(kdsStats.preparingOrders)} Orders Preparing
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Vehicles On Road</p>
                                <p className="text-3xl font-black text-foreground">{displayCount(kdsStats.activeRunners)} Runners</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Currently Prepared</p>
                                <p className="text-3xl font-black text-amber-600">{displayCount(kdsStats.preparingOrders)} Tickets</p>
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
                            <span className="text-2xl font-black text-emerald-600">{displayPrice(liveStats.inventoryValue)} Total Inventory Value</span>
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
                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6">
                        <div className="border-b border-slate-800 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400">CLICK DENSITY HEATMAP OVERLAY</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white mt-1">Product & Checkout Interaction Hotspots</h3>
                        </div>
                        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
                            <p className="text-xs font-mono text-slate-400">Analytics events recorded: {displayCount(kdsStats.totalSignals)}</p>
                            <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs">
                                Coordinate-level heatmaps are unavailable because the application does not record interaction coordinates.
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 10: AI MORNING BRIEF */}
            {activeTab === 'ai_insights' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6">
                        <div className="border-b border-slate-800 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-400">BAR OS AUTONOMOUS INTELLIGENCE REPORT</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white mt-1">Executive AI Brief</h3>
                        </div>

                        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 font-mono text-xs text-slate-300">
                            <p className="text-amber-400 font-black uppercase text-sm mb-4">Good Evening {adminEmail ? adminEmail.split('@')[0].toUpperCase() : 'Admin'},</p>
                            <ul className="space-y-2 leading-relaxed">
                                <li>&bull; Gross revenue: {displayPrice(liveStats.totalRevenue)} across {displayCount(liveStats.activeUsers)} registered accounts.</li>
                                <li>&bull; Average order value: {displayPrice(liveStats.avgOrderValue)}; conversion rate: {liveStats.conversionRate ?? 'Unavailable'}.</li>
                                <li>&bull; Inventory value: {displayPrice(liveStats.inventoryValue)}.</li>
                                <li>&bull; Support tickets: {displayCount(liveStats.supportTickets)}.</li>
                            </ul>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
