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
import { cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';

type AnalyticsTabId = 'overview' | 'roi' | 'performance' | 'ab_testing' | 'dispatch' | 'kitchen' | 'stock' | 'support' | 'ux_heatmaps' | 'ai_insights';

export default function AdminAnalyticsPage() {
    useAdmin();
    const [activeTab, setActiveTab] = React.useState<AnalyticsTabId>('overview');
    const [timeframe, setTimeframe] = React.useState<'7d' | '30d' | '90d' | 'YTD'>('30d');
    const [loading, setLoading] = React.useState(true);
    React.useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                if (supabase) {
                    await supabase.from('orders').select('id, total_price');
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const chartData = React.useMemo(() => {
        const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
        const now = new Date();

        return Array.from({ length: days }).map((_, i) => {
            const date = new Date();
            date.setDate(now.getDate() - (days - i - 1));
            const rev = Math.floor(Math.random() * 80000 + 40000);
            return {
                name: date.toLocaleDateString('en-KE', { day: '2-digit' }),
                revenue: rev,
                profit: Math.round(rev * 0.32),
                users: Math.floor(rev / 2200)
            };
        });
    }, [timeframe]);

    const handleDownloadReport = () => {
        const headers = ['Day', 'Revenue', 'Profit', 'Units'];
        const rows = chartData.map(d => [d.name, d.revenue, d.profit, d.users]);
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
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-4">Synthesizing 10 Analytics Telemetry Engines...</p>
        </div>
    );

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">BAR OS 10-ENGINE ANALYTICS COMMAND CENTER</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Unified Analytics Command</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Real-time revenue, marketing ROAS, A/B testing, dispatch routes, kitchen SLA, stock radar, and UX heatmaps.</p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-white p-1 rounded-xl flex gap-1 border border-slate-200 shadow-sm">
                        {['7d', '30d', '90d', 'YTD'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTimeframe(t as '7d' | '30d' | '90d' | 'YTD')}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all",
                                    timeframe === t ? "bg-primary text-white shadow-md" : "text-slate-500 hover:text-foreground"
                                )}
                            >
                                {t}
                            </button>
                        ))}
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

            {/* TAB 1: EXECUTIVE OVERVIEW & AI ANOMALY DETECTION (SCREENSHOT 1) */}
            {activeTab === 'overview' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Revenue</p>
                            <p className="text-3xl font-black text-foreground">$2,409,300</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ +18.6% vs Apr 1
                            </span>
                        </Card>
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Active Users</p>
                            <p className="text-3xl font-black text-foreground">1,238,303</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ +12.4% vs Apr 1
                            </span>
                        </Card>
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Conversion Rate</p>
                            <p className="text-3xl font-black text-foreground">3.42%</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ +8.7% vs Apr 1
                            </span>
                        </Card>
                        <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Avg Order Value</p>
                            <p className="text-3xl font-black text-foreground">$98.45</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                ↗ +6.1% vs Apr 1
                            </span>
                        </Card>
                    </div>

                    {/* AI Anomaly Detection Banner */}
                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-4 relative overflow-hidden">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                                <Sparkles className="h-6 w-6 text-amber-400 animate-bounce" />
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">AI Anomaly Detection Node</h3>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Automated First-Party Spike Analysis</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                High Impact Alert &bull; 92% Confidence
                            </span>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                            <h4 className="text-sm font-black uppercase text-amber-400">Unusual Spike in Revenue Detected on May 29</h4>
                            <p className="text-xs font-medium text-slate-300 italic leading-relaxed">
                                &quot;Revenue was 46% higher than expected on May 29, driving $142K additional gross revenue. Primary contributing factors: New Users from Organic Search (+67%) and Marketing Campaign: Spring Sale (+18%).&quot;
                            </p>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 2: MARKETING ROI & LEAD CONVERSION (SCREENSHOT 2) */}
            {activeTab === 'roi' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Marketing Qualified Leads</p>
                            <p className="text-3xl font-black text-foreground">847</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">+12% vs target</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Cost Per MQL</p>
                            <p className="text-3xl font-black text-foreground">$87</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">-8% vs target</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">MQL to SQL Conversion</p>
                            <p className="text-3xl font-black text-foreground">24%</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">+4% vs target</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Marketing ROI</p>
                            <p className="text-3xl font-black text-primary">4.2x</p>
                            <span className="text-[8px] font-black uppercase text-primary bg-amber-50 px-2 py-0.5 rounded border border-amber-100">$4.20 per $1 spent</span>
                        </Card>
                        <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-md space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Website Traffic</p>
                            <p className="text-3xl font-black text-foreground">142K</p>
                            <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">+18% MoM</span>
                        </Card>
                    </div>
                </div>
            )}

            {/* TAB 3: MARKETING PERFORMANCE & CHANNEL MIX (SCREENSHOTS 3 & 9) */}
            {activeTab === 'performance' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Marketing Performance (Q1 2026)</h3>
                            <span className="text-2xl font-black text-primary">14,500 Total Conversions (Mtd)</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Organic Search</p>
                                <p className="text-3xl font-black text-foreground">45%</p>
                                <p className="text-[9px] font-bold text-emerald-600 uppercase">Top Acquisition Mix</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Referral Network</p>
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
            )}

            {/* TAB 4: KEAK / CAUSALFUNNEL A/B TESTING PLATFORM (SCREENSHOTS 4, 5, 6) */}
            {activeTab === 'ab_testing' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400">Revenue Impact</p>
                            <p className="text-3xl font-black text-emerald-600">+$2,450</p>
                            <span className="text-[8px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+2% conversion lift</span>
                        </Card>
                        <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400">Total Traffic Tested</p>
                            <p className="text-3xl font-black text-foreground">2,450</p>
                            <span className="text-[8px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">+450 visitors tested</span>
                        </Card>
                        <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-2">
                            <p className="text-[9px] font-black uppercase text-slate-400">Top Performer Lift</p>
                            <p className="text-3xl font-black text-indigo-600">+24%</p>
                            <span className="text-[8px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">+28% winning variation</span>
                        </Card>
                    </div>

                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6">
                        <div className="border-b border-slate-800 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400">BAYESIAN WINNING VARIATION</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white mt-1">Product Page Pricing A/B Test</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-6 text-center">
                            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[9px] font-black uppercase text-slate-400">Winning Variation</p>
                                <p className="text-3xl font-black text-emerald-400">+28%</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[9px] font-black uppercase text-slate-400">Conversion Lift</p>
                                <p className="text-3xl font-black text-indigo-400">+15%</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[9px] font-black uppercase text-slate-400">Reliability Score</p>
                                <p className="text-3xl font-black text-amber-400">96%</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 5: DISPATCH & FLEET ROUTE ANALYTICS (SCREENSHOT 2) */}
            {activeTab === 'dispatch' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Dispatch Fleet & Route Analytics</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Live Runner Telemetry & Delivery SLA</p>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                🟢 3 Runners Active
                            </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Avg Delivery Time</p>
                                <p className="text-3xl font-black text-foreground">18 Mins</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Rider Efficiency</p>
                                <p className="text-3xl font-black text-emerald-600">94%</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Peak Hours</p>
                                <p className="text-2xl font-black text-primary">8 PM - 11 PM</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Distance SLA</p>
                                <p className="text-3xl font-black text-indigo-600">&lt; 4.2 km</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 6: KITCHEN & KDS OPERATIONS ANALYTICS (SCREENSHOT 4) */}
            {activeTab === 'kitchen' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Kitchen & KDS Operations Analytics</h3>
                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                6 Orders Preparing
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Vehicles On Road</p>
                                <p className="text-3xl font-black text-foreground">3 Runners</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Currently Prepared</p>
                                <p className="text-3xl font-black text-amber-600">6 Tickets</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Customer Satisfaction</p>
                                <p className="text-3xl font-black text-emerald-600">4.9 / 5.0</p>
                            </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-3">
                            <p className="text-[10px] font-black uppercase text-slate-400">Table Occupancy Grid (Table / Zone Telemetry)</p>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 bg-white rounded-2xl border border-slate-200 text-center">
                                    <p className="text-xs font-black text-foreground uppercase">T99 (Occupied)</p>
                                    <p className="text-[9px] font-bold text-slate-400">4 Guests</p>
                                </div>
                                <div className="p-4 bg-white rounded-2xl border border-slate-200 text-center">
                                    <p className="text-xs font-black text-foreground uppercase">T98 (Occupied)</p>
                                    <p className="text-[9px] font-bold text-slate-400">2 Guests</p>
                                </div>
                                <div className="p-4 bg-white rounded-2xl border border-slate-200 text-center">
                                    <p className="text-xs font-black text-foreground uppercase">T95 (Occupied)</p>
                                    <p className="text-[9px] font-bold text-slate-400">4 Guests</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 7: STOCK INTELLIGENCE & WAREHOUSE RADAR (SCREENSHOT 5) */}
            {activeTab === 'stock' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Stock Intelligence & Warehouse Radar</h3>
                            <span className="text-2xl font-black text-emerald-600">$58,400 Total Inventory Value</span>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                                <p className="text-[9px] font-black uppercase text-slate-400">Warehouse A (Main Cellar)</p>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: '85%' }} />
                                </div>
                                <p className="text-[10px] font-bold text-slate-500">85% Capacity</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                                <p className="text-[9px] font-black uppercase text-slate-400">Warehouse B (Chill Vault)</p>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: '72%' }} />
                                </div>
                                <p className="text-[10px] font-bold text-slate-500">72% Capacity</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                                <p className="text-[9px] font-black uppercase text-slate-400">Warehouse C (Merch Vault)</p>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{ width: '58%' }} />
                                </div>
                                <p className="text-[10px] font-bold text-slate-500">58% Capacity</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 8: SUPPORT & COMPLAINT ANALYTICS (SCREENSHOT 3) */}
            {activeTab === 'support' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Support & Complaint Analytics</h3>
                            <span className="text-xl font-black text-foreground">3,034 Total Received Tickets</span>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">First Contact Resolution</p>
                                <p className="text-3xl font-black text-emerald-600">45%</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Customer Satisfaction</p>
                                <p className="text-3xl font-black text-amber-500">3.66 ★</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-400">Avg Response Time</p>
                                <p className="text-3xl font-black text-indigo-600">17 Mins</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 9: STORE UX & CLICK DENSITY HEATMAPS (SCREENSHOTS 7 & 8) */}
            {activeTab === 'ux_heatmaps' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6">
                        <div className="border-b border-slate-800 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-400">CLICK DENSITY HEATMAP OVERLAY</span>
                            <h3 className="text-2xl font-black uppercase tracking-tight text-white mt-1">Product & Checkout Interaction Hotspots</h3>
                        </div>

                        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
                            <p className="text-xs font-bold text-slate-300">Hotspot Intensity Map: CTA Buttons (734 clicks • 10.1%), Size Selectors (412 clicks), WhatsApp Direct Order (380 clicks)</p>
                            <div className="h-48 w-full rounded-2xl bg-gradient-to-r from-rose-600/30 via-amber-500/20 to-emerald-500/30 border border-slate-800 flex items-center justify-center">
                                <span className="text-sm font-black uppercase text-amber-400 animate-pulse">🔥 High Click Density Detected on Express Checkout Button</span>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB 10: MORNING AI INSIGHTS PANEL */}
            {activeTab === 'ai_insights' && (
                <div className="space-y-8 text-left animate-in fade-in duration-500">
                    <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6 relative overflow-hidden">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <Bot className="h-8 w-8 text-amber-400 animate-bounce" />
                                <div>
                                    <h3 className="text-2xl font-black uppercase tracking-tight">Morning Executive AI Brief</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Bar OS Autonomous Intelligence Report</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                🟢 98% Confidence
                            </span>
                        </div>

                        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 relative z-10">
                            <p className="text-lg font-black uppercase text-amber-400">Good Evening David,</p>
                            <div className="space-y-2 text-sm font-medium text-slate-300 leading-relaxed italic">
                                <p>&bull; Gross Revenue is up 14% this week with peak sales at 8:12 PM.</p>
                                <p>&bull; TikTok generated 42% of new customer acquisitions driven by the Smocha challenge.</p>
                                <p>&bull; Amarula 750ml inventory velocity predicts stock-out by tomorrow evening. Recommended re-order: 18 bottles.</p>
                                <p>&bull; Friday campaign posts perform best at 7:00 PM with dark-background imagery.</p>
                                <p>&bull; 61 carts were abandoned at checkout. Recommended action: Send WhatsApp 15% discount reminder.</p>
                            </div>
                        </div>

                        <Sparkles className="absolute -bottom-10 -right-10 h-64 w-64 text-amber-400/5 rotate-12 pointer-events-none" />
                    </Card>
                </div>
            )}
        </div>
    );
}
