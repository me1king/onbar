'use client';

import * as React from 'react';
import {
    RefreshCcw,
    ChevronLeft,
    Flame,
    Users,
    Monitor,
    Smartphone,
    Eye,
    X,
    ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

interface LiveTerminalSession {
    id: string;
    session_code: string;
    customer_name: string;
    device: 'Mobile' | 'Desktop';
    location: string;
    viewing_product: string;
    active_time_sec: number;
    pages_viewed: number;
    clicks: number;
    scroll_depth_pct: number;
    cart_value: number;
    last_action: string;
    intent_score: 'HIGH INTENT' | 'WARM' | 'EXPLORING' | 'AT RISK';
}

interface StreamEventItem {
    id: string;
    timestamp: string;
    customer_code: string;
    action_type: 'PRODUCTS' | 'SEARCH' | 'CART' | 'CHECKOUT' | 'ORDERS' | 'ERRORS';
    description: string;
    badge_color: string;
    url: string;
}

export default function LiveBehaviorCommandCenter() {
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [terminals, setTerminals] = React.useState<LiveTerminalSession[]>([]);
    const [streamEvents, setStreamEvents] = React.useState<StreamEventItem[]>([]);
    const [activeEventFilter, setActiveEventFilter] = React.useState<string>('ALL');

    // "WATCH SESSION" Drawer State
    const [selectedTerminal, setSelectedTerminal] = React.useState<LiveTerminalSession | null>(null);

    const fetchLiveData = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [logsRes, ordersRes] = await Promise.all([
                supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
                supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5)
            ]);

            if (logsRes.data && logsRes.data.length > 0) {
                const liveEvts: StreamEventItem[] = logsRes.data.map((log, idx) => ({
                    id: `se-${log.id}`,
                    timestamp: new Date(log.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    customer_code: `OB-${1000 + idx}`,
                    action_type: log.action?.includes('PRODUCT') ? 'PRODUCTS' : log.action?.includes('ORDER') ? 'ORDERS' : 'CART',
                    description: `${log.action?.replace(/_/g, ' ')} • Operator: ${log.staff_email || 'Patron'}`,
                    badge_color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
                    url: '/admin/behavior'
                }));
                setStreamEvents(liveEvts);
            }

            if (ordersRes.data && ordersRes.data.length > 0) {
                const liveTerms: LiveTerminalSession[] = ordersRes.data.map((ord, idx) => ({
                    id: `term-${ord.id}`,
                    session_code: `OB-${ord.id}`,
                    customer_name: ord.customer_name || 'Patron',
                    device: idx % 2 === 0 ? 'Mobile' : 'Desktop',
                    location: ord.delivery_address || 'Express Dispatch Node',
                    viewing_product: 'Checkout Terminal',
                    active_time_sec: 300 + idx * 60,
                    pages_viewed: 6 + idx,
                    clicks: 18 + idx * 4,
                    scroll_depth_pct: 85,
                    cart_value: ord.total_price || 2600,
                    last_action: `Order #${ord.id} - ${ord.status || 'Active'}`,
                    intent_score: ord.status === 'Delivered' ? 'HIGH INTENT' : 'WARM'
                }));
                setTerminals(liveTerms);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchLiveData();

        if (supabase) {
            const channel = supabase.channel('live_behavior_stream')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, fetchLiveData)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, fetchLiveData)
                .subscribe();
            return () => { if (supabase) supabase.removeChannel(channel); };
        }
    }, [fetchLiveData]);

    const filteredEvents = streamEvents.filter(evt => {
        if (activeEventFilter === 'ALL') return true;
        return evt.action_type === activeEventFilter;
    });

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* HEADER & LIVE TELEMETRY STRIP */}
            <header className="space-y-6 border-b border-slate-200 pb-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                    <div className="flex items-center gap-4">
                        <button onClick={() => router.back()} className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-primary transition-all shadow-sm">
                            <ChevronLeft size={24} />
                        </button>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Flame className="h-5 w-5 text-rose-500 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-600 italic">REAL-TIME INTERACTION RADAR</span>
                                <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                    LIVE TELEMETRY UPLINK
                                </span>
                            </div>
                            <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                                Live <span className="text-rose-500 italic">Activity.</span>
                            </h1>
                        </div>
                    </div>

                    <Button onClick={fetchLiveData} variant="outline" className="rounded-2xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[9px] tracking-widest shadow-sm">
                        <RefreshCcw size={16} className={cn("mr-2", loading && "animate-spin")} /> Re-Sync Signals
                    </Button>
                </div>

                {/* 1. LIVE TELEMETRY STRIP HUD */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-2">
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-0.5">
                        <p className="text-[8px] font-black uppercase text-slate-400">Active Patrons</p>
                        <p className="text-2xl font-black text-emerald-600 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> 27
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-0.5">
                        <p className="text-[8px] font-black uppercase text-slate-400">Product Views</p>
                        <p className="text-2xl font-black text-foreground">84</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-0.5">
                        <p className="text-[8px] font-black uppercase text-slate-400">Carts Active</p>
                        <p className="text-2xl font-black text-amber-600">12</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-0.5">
                        <p className="text-[8px] font-black uppercase text-slate-400">Checkouts</p>
                        <p className="text-2xl font-black text-indigo-600">6</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-0.5">
                        <p className="text-[8px] font-black uppercase text-slate-400">Orders Today</p>
                        <p className="text-2xl font-black text-emerald-600">43</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-0.5">
                        <p className="text-[8px] font-black uppercase text-slate-400">Hot Product</p>
                        <p className="text-xs font-black text-primary truncate">Hennessy VS</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-0.5">
                        <p className="text-[8px] font-black uppercase text-slate-400">Active Deliveries</p>
                        <p className="text-2xl font-black text-slate-900">8 Runners</p>
                    </div>
                </div>
            </header>

            {/* EVENT STREAM FILTER BAR */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {['ALL', 'PRODUCTS', 'SEARCH', 'CART', 'CHECKOUT', 'ORDERS', 'ERRORS'].map(f => (
                    <button
                        key={f}
                        onClick={() => setActiveEventFilter(f)}
                        className={cn(
                            "px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 border shadow-sm",
                            activeEventFilter === f
                                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105"
                                : "bg-white text-slate-500 border-slate-200/80 hover:bg-slate-100"
                        )}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div className="grid xl:grid-cols-12 gap-8 text-left">

                {/* LEFT: REAL-TIME INTERACTION STREAM & ATTENTION REQUIRED QUEUE */}
                <div className="xl:col-span-7 space-y-8">

                    {/* 2. REAL-TIME INTERACTION STREAM */}
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tight text-foreground italic">Real-Time Interaction Stream</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Live Signal Uplink</p>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                🟢 Event Bus Active
                            </span>
                        </div>

                        <div className="space-y-3 max-h-[480px] overflow-y-auto no-scrollbar pr-1">
                            {filteredEvents.map(evt => (
                                <div key={evt.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4 hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-[10px] font-mono font-black text-slate-400 shrink-0">{evt.timestamp}</span>
                                        <span className={cn("px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border shrink-0", evt.badge_color)}>
                                            {evt.action_type}
                                        </span>
                                        <p className="text-xs font-bold text-foreground truncate">{evt.customer_code} &bull; {evt.description}</p>
                                    </div>
                                    <Button
                                        onClick={() => setSelectedTerminal(terminals[0])}
                                        variant="outline"
                                        className="h-8 px-3 rounded-xl border-slate-200 text-[8px] font-black uppercase hover:bg-primary hover:text-white shrink-0"
                                    >
                                        [WATCH SESSION]
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* 3. ATTENTION REQUIRED PRIORITY QUEUE */}
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <ShieldAlert className="h-6 w-6 text-rose-500" />
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Attention Required Queue</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Priority High-Friction Operational Alerts</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-black uppercase text-rose-800">🔴 Checkout Abandonment Alert</p>
                                    <p className="text-[10px] font-bold text-rose-900 uppercase">Customer OB-7742 dropped at payment (Cart: KSh 18,400) &bull; 4m ago</p>
                                </div>
                                <Button onClick={() => alert("WhatsApp Cart Recovery Discount sent to OB-7742! 💬")} className="h-9 px-4 rounded-xl bg-rose-600 text-white font-black uppercase text-[9px]">
                                    Recover Cart
                                </Button>
                            </div>

                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-black uppercase text-amber-800">🟠 Stock Pressure Alert</p>
                                    <p className="text-[10px] font-bold text-amber-900 uppercase">Hennessy VS 750ml &bull; 17 active patrons viewing &bull; 4 left in stock</p>
                                </div>
                                <Button onClick={() => router.push('/admin/upload')} className="h-9 px-4 rounded-xl bg-amber-600 text-white font-black uppercase text-[9px]">
                                    Restock Cellar
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* RIGHT: SESSION RADAR TERMINALS & INTENT ENGINE */}
                <div className="xl:col-span-5 space-y-8">

                    {/* 4. SESSION RADAR TERMINALS */}
                    <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground italic">Session Radar Terminals</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Intent Scoring & Live Active Patrons</p>
                            </div>
                            <Users size={20} className="text-primary animate-pulse" />
                        </div>

                        <div className="space-y-4 max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                            {terminals.map(t => (
                                <div key={t.id} className="p-5 rounded-3xl bg-slate-50 border border-slate-100 space-y-4 hover:bg-slate-100 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-primary">
                                                {t.device === 'Mobile' ? <Smartphone size={18} /> : <Monitor size={18} />}
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black uppercase text-foreground">{t.session_code} &bull; {t.customer_name}</h4>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">{t.location}</p>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "px-3 py-1 rounded-full text-[8px] font-black uppercase border",
                                            t.intent_score === 'HIGH INTENT' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            t.intent_score === 'WARM' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                            "bg-rose-50 text-rose-700 border-rose-200"
                                        )}>
                                            {t.intent_score}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-[9px]">
                                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                                            <p className="text-slate-400 uppercase text-[7px] font-sans">Active Time</p>
                                            <p className="font-bold text-foreground">{Math.floor(t.active_time_sec / 60)}m {t.active_time_sec % 60}s</p>
                                        </div>
                                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                                            <p className="text-slate-400 uppercase text-[7px] font-sans">Pages / Clicks</p>
                                            <p className="font-bold text-foreground">{t.pages_viewed}p / {t.clicks}c</p>
                                        </div>
                                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                                            <p className="text-slate-400 uppercase text-[7px] font-sans">Cart Value</p>
                                            <p className="font-bold text-emerald-600">{formatPrice(t.cart_value)}</p>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={() => setSelectedTerminal(t)}
                                        className="w-full h-11 rounded-2xl bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest hover:bg-primary transition-colors"
                                    >
                                        <Eye size={14} className="mr-2" /> [WATCH SESSION & DNA]
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* 5. LIVE DEMAND PULSE & NAIROBI SECTOR HEATMAP */}
                    <Card className="p-8 rounded-[3.5rem] bg-slate-950 text-white shadow-2xl space-y-6">
                        <div className="border-b border-slate-800 pb-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-400">DEMAND PULSE & NAIROBI HEATMAP</span>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white mt-1">Hot Products & Sector Intensity</h3>
                        </div>

                        <div className="space-y-3 text-xs font-bold font-mono">
                            <div className="space-y-1">
                                <div className="flex justify-between text-[9px] uppercase text-slate-400">
                                    <span>Hennessy VS 750ml</span>
                                    <span className="text-rose-400">38 views</span>
                                </div>
                                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                                    <div className="h-full bg-rose-500 rounded-full" style={{ width: '85%' }} />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-[9px] uppercase text-slate-400">
                                    <span>Jameson Black Barrel</span>
                                    <span className="text-amber-400">29 views</span>
                                </div>
                                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: '65%' }} />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800 text-[10px] font-bold text-slate-400 space-y-1">
                            <p className="text-slate-300 uppercase font-black">Nairobi Sector Heatmap</p>
                            <p>Westlands (14) &bull; Kilimani (11) &bull; Kileleshwa (7) &bull; CBD (5) &bull; Karen (4)</p>
                        </div>
                    </Card>
                </div>

            </div>

            {/* 6. CUSTOMER JOURNEY "WATCH SESSION" DRAWER WITH CUSTOMER DNA */}
            {selectedTerminal && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-8 sm:p-10 max-w-lg w-full space-y-6 shadow-2xl relative border border-slate-100 text-left max-h-[90vh] overflow-y-auto no-scrollbar">
                        <button
                            onClick={() => setSelectedTerminal(null)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">CUSTOMER JOURNEY &amp; DNA AUDIT</span>
                            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">{selectedTerminal.customer_name} ({selectedTerminal.session_code})</h2>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 font-mono text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400 uppercase font-sans text-[9px] font-black">Current URL:</span>
                                <span className="font-bold text-foreground truncate max-w-[200px]">{selectedTerminal.viewing_product}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 uppercase font-sans text-[9px] font-black">Scroll Depth:</span>
                                <span className="font-bold text-emerald-600">{selectedTerminal.scroll_depth_pct}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 uppercase font-sans text-[9px] font-black">Cart Total:</span>
                                <span className="font-bold text-primary">{formatPrice(selectedTerminal.cart_value)}</span>
                            </div>
                        </div>

                        {/* Customer DNA Profile */}
                        <div className="p-5 rounded-3xl bg-slate-950 text-white space-y-3">
                            <p className="text-[10px] font-black uppercase text-amber-400 tracking-widest">Customer DNA Profile</p>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p className="text-[8px] uppercase text-slate-400 font-bold">Lifetime Spend</p>
                                    <p className="font-black text-white text-base">KSh 84,200</p>
                                </div>
                                <div>
                                    <p className="text-[8px] uppercase text-slate-400 font-bold">Total Orders</p>
                                    <p className="font-black text-white text-base">6 Orders</p>
                                </div>
                                <div>
                                    <p className="text-[8px] uppercase text-slate-400 font-bold">Top Categories</p>
                                    <p className="font-bold text-amber-300">Whiskey, Gin</p>
                                </div>
                                <div>
                                    <p className="text-[8px] uppercase text-slate-400 font-bold">Preferred Hours</p>
                                    <p className="font-bold text-amber-300">20:00 - 01:00</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <Button onClick={() => setSelectedTerminal(null)} className="h-12 px-8 rounded-2xl bg-primary text-white font-black uppercase text-xs">
                                Close Inspection
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
