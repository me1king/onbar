'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Users,
    ShoppingBag,
    Zap,
    BarChart3,
    ArrowUpRight,
    Monitor,
    Smartphone,
    History,
    ChevronRight,
    RefreshCcw
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';

interface ActiveVisitor {
    session_id: string;
    customer_name: string | null;
    current_page: string;
    last_active_at: string;
    cart_value: number;
    status: string;
    total_active_time_sec: number;
    recent_journey?: string[];
    device_info?: {
        ua: string;
        res: string;
    };
}

interface DBActiveVisitor {
    session_id: string;
    customer_name: string | null;
    current_page: string;
    cart_value: number;
    last_active_at: string;
    status: string;
    total_active_time_sec: number;
    recent_journey: string[];
    device_info?: {
        ua: string;
        res: string;
    };
}

export default function ApexLiveRadar() {
    const [visitors, setVisitors] = React.useState<ActiveVisitor[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [stats, setStats] = React.useState({
        total: 0,
        carts: 0,
        checkouts: 0,
        avgTime: '0m 0s'
    });

    const fetchData = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            // 1. Fetch Active Visitors with Session Context and Journey (Real Data)
            const { data } = await supabase
                .from('live_behavior_radar')
                .select('*');

            if (data) {
                const formatted = (data as unknown as DBActiveVisitor[]).map(v => ({
                    ...v,
                    recent_journey: Array.isArray(v.recent_journey) ? v.recent_journey : []
                }));
                setVisitors(formatted);

                // Calculate real-time stats
                const totalActiveSec = formatted.reduce((sum, v) => sum + (v.total_active_time_sec || 0), 0);
                const avgMin = formatted.length > 0 ? Math.floor((totalActiveSec / formatted.length) / 60) : 0;
                const avgSec = formatted.length > 0 ? Math.floor((totalActiveSec / formatted.length) % 60) : 0;

                setStats({
                    total: formatted.length,
                    carts: formatted.filter(v => (v.cart_value || 0) > 0).length,
                    checkouts: formatted.filter(v => v.status === 'Checkout').length,
                    avgTime: `${avgMin}m ${avgSec}s`
                });
            }
        } catch (err) {
            console.error("Radar Link Failure:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000); // 15s Pulse
        return () => clearInterval(interval);
    }, [fetchData]);

    return (
        <div className="p-8 space-y-12 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* RADAR HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200 pb-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 italic">Live Grid Protocol</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Apex <span className="text-primary">Live Radar.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium">Real-time situational awareness of all patrons currently synchronized with the grid.</p>
                </div>
                <div className="flex gap-4">
                    <Button onClick={fetchData} variant="outline" className="rounded-2xl h-14 px-8 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                        <RefreshCcw size={16} className={cn("mr-3", loading && "animate-spin")} /> Manual Refresh
                    </Button>
                </div>
            </header>

            {/* LIVE METRICS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                    { label: 'Live Now', val: stats.total, icon: Users, color: 'primary' },
                    { label: 'Active Carts', val: stats.carts, icon: ShoppingBag, color: 'indigo' },
                    { label: 'In Checkout', val: stats.checkouts, icon: Zap, color: 'amber' },
                    { label: 'Avg Active Time', val: stats.avgTime, icon: History, color: 'emerald' },
                ].map(stat => (
                    <Card key={stat.label} className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm group hover:shadow-2xl transition-all">
                        <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center mb-8 shadow-inner transition-transform group-hover:scale-110",
                            stat.color === 'primary' ? "bg-primary/10 text-primary" :
                            stat.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                            stat.color === 'amber' ? "bg-amber-50 text-amber-500" :
                            "bg-emerald-50 text-emerald-500"
                        )}>
                            <stat.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h3 className="text-3xl font-black text-foreground uppercase tracking-tight tabular-nums">{stat.val}</h3>
                    </Card>
                ))}
            </div>

            {/* LIVE VISITORS FEED */}
            <section className="space-y-8">
                <div className="flex justify-between items-center px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Live Patrons</h2>
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Grid Active
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {visitors.length === 0 ? (
                        <Card className="col-span-full py-40 rounded-[4rem] border-2 border-dashed border-slate-100 text-center opacity-30">
                            <Users size={64} className="mx-auto mb-6" />
                            <p className="text-xl font-black uppercase tracking-[0.3em]">Grid Node Clear</p>
                        </Card>
                    ) : visitors.map((visitor) => (
                        <Card key={visitor.session_id} className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm group hover:border-primary/20 transition-all flex flex-col sm:flex-row gap-10">

                            {/* IDENTITY NODE */}
                            <div className="flex flex-col items-center gap-4 text-center sm:border-r sm:border-slate-50 sm:pr-10">
                                <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 relative group-hover:scale-105 transition-transform">
                                    <Users size={32} />
                                    <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white p-1 shadow-md flex items-center justify-center">
                                        {visitor.device_info?.ua?.includes('Mobile') ? <Smartphone size={12} className="text-primary" /> : <Monitor size={12} className="text-primary" />}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-black text-foreground uppercase tracking-tight truncate max-w-[120px]">
                                        {visitor.customer_name || `Anon #${visitor.session_id.substring(0, 5)}`}
                                    </p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        {visitor.device_info?.ua?.includes('Chrome') ? 'Chrome' : 'Safari'} • Mobile
                                    </p>
                                </div>
                            </div>

                            {/* BEHAVIOR NODE */}
                            <div className="flex-1 space-y-8 min-w-0">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className={cn(
                                                "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                                visitor.status === 'Checkout' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                            )}>
                                                {visitor.status}
                                            </span>
                                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                                Active {Math.floor(visitor.total_active_time_sec / 60)}m {visitor.total_active_time_sec % 60}s
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Node</p>
                                        <h4 className="text-lg font-black text-foreground uppercase tracking-tighter leading-tight truncate italic">
                                            {visitor.current_page}
                                        </h4>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-black text-primary tracking-tighter tabular-nums leading-none">
                                            {formatPrice(visitor.cart_value)}
                                        </p>
                                        <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-2">Active Cart</p>
                                    </div>
                                </div>

                                {/* JOURNEY PREVIEW */}
                                <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-[2rem] border border-slate-100/50 overflow-hidden">
                                    <History size={16} className="text-slate-300 shrink-0" />
                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase overflow-hidden truncate italic">
                                        {visitor.recent_journey && visitor.recent_journey.length > 0 ? (
                                            visitor.recent_journey.reverse().map((action, idx) => (
                                                <React.Fragment key={idx}>
                                                    <span className={cn(idx === visitor.recent_journey!.length - 1 && "text-primary")}>
                                                        {action.replace(/_/g, ' ')}
                                                    </span>
                                                    {idx < visitor.recent_journey!.length - 1 && (
                                                        <ChevronRight size={10} className="text-slate-300 shrink-0" />
                                                    )}
                                                </React.Fragment>
                                            ))
                                        ) : (
                                            <span>Establishing Journey...</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ACTIONS */}
                            <div className="flex items-center sm:flex-col justify-center gap-3">
                                <Button size="icon" variant="ghost" className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 text-slate-300 hover:text-primary hover:bg-white transition-all">
                                    <BarChart3 size={24} />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 text-slate-300 hover:text-primary hover:bg-white transition-all">
                                    <ArrowUpRight size={24} />
                                </Button>
                            </div>

                        </Card>
                    ))}
                </div>
            </section>

        </div>
    );
}
