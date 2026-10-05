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
    device: 'Mobile' | 'Desktop' | 'Unknown';
    location: string;
    active_time_sec: number;
    cart_value: number;
    last_seen_at: string;
    last_action: string;
    session_status: string;
}

interface StreamEventItem {
    id: number;
    timestamp: string;
    customer_code: string;
    session_id: string | null;
    action_type: string;
    description: string;
    page_url: string;
}

function categorizeEvent(eventName: string) {
    const name = eventName.toUpperCase();
    if (name.includes('PRODUCT')) return 'PRODUCTS';
    if (name.includes('SEARCH')) return 'SEARCH';
    if (name.includes('CART')) return 'CART';
    if (name.includes('CHECKOUT') || name.includes('PAYMENT')) return 'CHECKOUT';
    if (name.includes('ORDER')) return 'ORDERS';
    if (name.includes('ERROR')) return 'ERRORS';
    return 'OTHER';
}

export default function LiveBehaviorCommandCenter() {
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [terminals, setTerminals] = React.useState<LiveTerminalSession[]>([]);
    const [streamEvents, setStreamEvents] = React.useState<StreamEventItem[]>([]);
    const [activeEventFilter, setActiveEventFilter] = React.useState<string>('ALL');
    const [metrics, setMetrics] = React.useState({
        activeSessions: 0,
        productViews: 0,
        cartsWithItems: 0,
        checkoutsStarted: 0,
        ordersToday: 0,
        activeDeliveries: 0
    });

    // "WATCH SESSION" Drawer State
    const [selectedTerminal, setSelectedTerminal] = React.useState<LiveTerminalSession | null>(null);

    const fetchLiveData = React.useCallback(async () => {
        if (!supabase) {
            setError('Supabase is not configured. Live behavior data is unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const activeSince = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
            const [sessionsRes, eventsRes, activeRes, productViewsRes, cartsRes, checkoutsRes, ordersRes, dispatchRes] = await Promise.all([
                supabase.from('customer_sessions').select('*').order('last_seen_at', { ascending: false }).limit(20),
                supabase.from('analytics_events').select('id, event_name, session_id, anonymous_id, page_url, payload, created_at').order('created_at', { ascending: false }).limit(30),
                supabase.from('customer_sessions').select('id', { count: 'exact', head: true }).gte('last_seen_at', activeSince),
                supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_name', 'PRODUCT_VIEW').gte('created_at', todayStart),
                supabase.from('customer_sessions').select('id', { count: 'exact', head: true }).gt('cart_value', 0),
                supabase.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_name', 'CHECKOUT_START').gte('created_at', todayStart),
                supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
                supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'Dispatched')
            ]);

            const queryError = sessionsRes.error || eventsRes.error || activeRes.error || productViewsRes.error || cartsRes.error || checkoutsRes.error || ordersRes.error || dispatchRes.error;
            if (queryError) throw queryError;

            const events = eventsRes.data || [];
            setMetrics({
                activeSessions: activeRes.count || 0,
                productViews: productViewsRes.count || 0,
                cartsWithItems: cartsRes.count || 0,
                checkoutsStarted: checkoutsRes.count || 0,
                ordersToday: ordersRes.count || 0,
                activeDeliveries: dispatchRes.count || 0
            });
            setStreamEvents(events.map(event => ({
                id: event.id,
                timestamp: new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                customer_code: event.session_id ? `Session ${event.session_id}` : event.anonymous_id ? `Visitor ${event.anonymous_id}` : 'Unidentified event',
                session_id: event.session_id,
                action_type: categorizeEvent(event.event_name),
                description: JSON.stringify(event.payload || {}),
                page_url: event.page_url || 'Page not recorded'
            })));
            setTerminals((sessionsRes.data || []).map(session => {
                const deviceInfo = session.device_info as { user_agent?: string; ua?: string } | null;
                const userAgent = deviceInfo?.user_agent || deviceInfo?.ua || '';
                const sessionEvent = events.find(event => event.session_id === session.id);
                return {
                    id: session.id,
                    session_code: session.id,
                    customer_name: `Session ${session.id}`,
                    device: userAgent ? (/mobile/i.test(userAgent) ? 'Mobile' : 'Desktop') : 'Unknown',
                    location: session.current_page || session.entry_page || 'Page not recorded',
                    active_time_sec: Number(session.total_active_time_sec || 0),
                    cart_value: Number(session.cart_value || 0),
                    last_seen_at: session.last_seen_at,
                    last_action: sessionEvent?.event_name || 'No recent event',
                    session_status: session.session_status || 'Unknown',
                };
            }));
        } catch (err) {
            console.error('Live behavior fetch error:', err);
            setTerminals([]);
            setStreamEvents([]);
            setMetrics({ activeSessions: 0, productViews: 0, cartsWithItems: 0, checkoutsStarted: 0, ordersToday: 0, activeDeliveries: 0 });
            setError(err instanceof Error ? err.message : 'Unable to load live behavior data.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchLiveData();

        if (supabase) {
            const channel = supabase.channel('live_behavior_stream')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_sessions' }, fetchLiveData)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'analytics_events' }, fetchLiveData)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, fetchLiveData)
                .subscribe();
            return () => { if (supabase) supabase.removeChannel(channel); };
        }
    }, [fetchLiveData]);

    const filteredEvents = streamEvents.filter(evt => {
        if (activeEventFilter === 'ALL') return true;
        return evt.action_type === activeEventFilter;
    });

    const metricCards = [
        { label: 'Active Sessions', value: metrics.activeSessions },
        { label: 'Product Views Today', value: metrics.productViews },
        { label: 'Carts With Items', value: metrics.cartsWithItems },
        { label: 'Checkouts Today', value: metrics.checkoutsStarted },
        { label: 'Orders Today', value: metrics.ordersToday },
        { label: 'Active Deliveries', value: metrics.activeDeliveries }
    ];

    return (
        <div className="min-h-screen space-y-6 bg-slate-50 p-3 pb-32 text-left selection:bg-primary/20 animate-in fade-in duration-700 sm:space-y-10 sm:p-6 sm:pb-40 lg:p-8">

            {/* HEADER & LIVE TELEMETRY STRIP */}
            <header className="space-y-6 border-b border-slate-200 pb-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                    <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                        <button aria-label="Go back" onClick={() => router.back()} className="h-11 w-11 shrink-0 rounded-2xl border border-slate-200 bg-white flex items-center justify-center text-slate-400 shadow-sm transition-all hover:text-primary sm:h-12 sm:w-12">
                            <ChevronLeft size={24} />
                        </button>
                        <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2 sm:gap-3">
                                <Flame className="h-5 w-5 shrink-0 text-rose-500 animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-rose-600 italic sm:text-[10px] sm:tracking-[0.3em]">REAL-TIME INTERACTION RADAR</span>
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[8px] font-black uppercase text-emerald-600">
                                    Recorded analytics
                                </span>
                            </div>
                            <h1 className="break-words text-3xl font-black uppercase leading-tight tracking-tighter text-foreground italic sm:text-4xl lg:text-5xl">
                                Live <span className="text-rose-500 italic">Activity.</span>
                            </h1>
                        </div>
                    </div>

                    <Button onClick={fetchLiveData} variant="outline" className="rounded-2xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[9px] tracking-widest shadow-sm">
                        <RefreshCcw size={16} className={cn("mr-2", loading && "animate-spin")} /> Re-Sync Signals
                    </Button>
                </div>

                <p className="text-sm font-medium text-slate-500">Current session activity and order metrics loaded from Supabase.</p>
            </header>

            {error && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {metricCards.map(metric => (
                    <Card key={metric.label} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
                        <p className="text-[8px] font-black uppercase text-slate-400">{metric.label}</p>
                        <p className="mt-1 text-2xl font-black text-foreground tabular-nums">{metric.value.toLocaleString()}</p>
                    </Card>
                ))}
            </div>
            {/* EVENT STREAM FILTER BAR */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {['ALL', 'PRODUCTS', 'SEARCH', 'CART', 'CHECKOUT', 'ORDERS', 'ERRORS', 'OTHER'].map(f => (
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

            <div className="grid min-w-0 gap-5 text-left lg:grid-cols-12 lg:gap-8">

                <div className="min-w-0 lg:col-span-7">

                    {/* 2. REAL-TIME INTERACTION STREAM */}
                    <Card className="min-w-0 space-y-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md sm:space-y-6 sm:rounded-[2.5rem] sm:p-6 lg:rounded-[3.5rem] lg:p-8">
                        <div className="flex min-w-0 flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <h2 className="break-words text-xl font-black uppercase tracking-tight text-foreground italic sm:text-2xl">Real-Time Interaction Stream</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Live Signal Uplink</p>
                            </div>
                            <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase bg-slate-50 text-slate-600 border border-slate-200">
                                Supabase analytics
                            </span>
                        </div>

                        <div className="space-y-3 max-h-[480px] overflow-y-auto no-scrollbar pr-1">
                            {loading && <p className="py-8 text-center text-sm font-bold text-slate-400">Loading analytics events...</p>}
                            {!loading && filteredEvents.length === 0 && (
                                <p className="py-8 text-center text-sm font-bold text-slate-400">
                                    {error ? 'Analytics events could not be loaded.' : 'No matching analytics events have been recorded.'}
                                </p>
                            )}
                            {filteredEvents.map(evt => (
                                <div key={evt.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 transition-colors hover:bg-slate-100 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
                                    <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 sm:flex sm:items-center sm:gap-3">
                                        <span className="text-[10px] font-mono font-black text-slate-400 shrink-0">{evt.timestamp}</span>
                                        <span className="w-fit shrink-0 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[8px] font-black uppercase text-indigo-700">
                                            {evt.action_type}
                                        </span>
                                        <p title={`${evt.customer_code} · ${evt.description}`} className="col-span-2 min-w-0 break-all text-xs font-bold leading-relaxed text-foreground [overflow-wrap:anywhere] sm:line-clamp-2 sm:break-words">
                                            <span className="text-slate-500">{evt.customer_code}</span> &bull; {evt.description}
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => setSelectedTerminal(terminals.find(terminal => terminal.id === evt.session_id) || null)}
                                        disabled={!evt.session_id || !terminals.some(terminal => terminal.id === evt.session_id)}
                                        variant="outline"
                                        className="h-9 w-full shrink-0 rounded-xl border-slate-200 px-3 text-[8px] font-black uppercase hover:bg-primary hover:text-white sm:h-8 sm:w-auto"
                                    >
                                        View session
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Card>

                </div>

                <div className="min-w-0 space-y-5 lg:col-span-5">

                    {/* 4. SESSION RADAR TERMINALS */}
                    <Card className="min-w-0 space-y-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md sm:space-y-6 sm:rounded-[2.5rem] sm:p-6 lg:rounded-[3.5rem] lg:p-8">
                        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-100 pb-4">
                            <div className="min-w-0">
                                <h3 className="break-words text-xl font-black uppercase tracking-tight text-foreground italic sm:text-2xl">Session Radar Terminals</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Stored customer sessions</p>
                            </div>
                            <Users size={20} className="text-primary animate-pulse" />
                        </div>

                        <div className="space-y-4 max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                            {terminals.map(t => (
                                <div key={t.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 transition-colors hover:bg-slate-100 sm:rounded-3xl sm:p-5">
                                    <div className="flex min-w-0 items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white font-black text-primary">
                                                {t.device === 'Mobile' ? <Smartphone size={18} /> : <Monitor size={18} />}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 title={t.customer_name} className="truncate text-xs font-black uppercase text-foreground">{t.customer_name}</h4>
                                                <p title={t.location} className="truncate text-[9px] font-bold uppercase text-slate-400">{t.location}</p>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "px-3 py-1 rounded-full text-[8px] font-black uppercase border",
                                            t.session_status.toUpperCase() === 'ACTIVE' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            "bg-slate-50 text-slate-700 border-slate-200"
                                        )}>
                                            {t.session_status}
                                        </span>
                                    </div>

                                    <div className="grid min-w-0 grid-cols-3 gap-1.5 text-center font-mono text-[9px] sm:gap-2">
                                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                                            <p className="text-slate-400 uppercase text-[7px] font-sans">Active Time</p>
                                            <p className="font-bold text-foreground">{Math.floor(t.active_time_sec / 60)}m {t.active_time_sec % 60}s</p>
                                        </div>
                                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                                            <p className="text-slate-400 uppercase text-[7px] font-sans">Last Activity</p>
                                            <p title={t.last_action} className="line-clamp-2 break-all font-bold text-foreground">{t.last_action}</p>
                                        </div>
                                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                                            <p className="text-slate-400 uppercase text-[7px] font-sans">Cart Value</p>
                                            <p className="font-bold text-emerald-600">{formatPrice(t.cart_value)}</p>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={() => setSelectedTerminal(t)}
                                        className="w-full h-11 rounded-2xl bg-primary text-white font-black uppercase text-[9px] tracking-widest hover:bg-primary/90 transition-colors"
                                    >
                                        <Eye size={14} className="mr-2" /> View session
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Card>

                </div>

            </div>

            {/* Session details contain only fields captured for this session. */}
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
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">Session details</span>
                            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">{selectedTerminal.customer_name} ({selectedTerminal.session_code})</h2>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 font-mono text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400 uppercase font-sans text-[9px] font-black">Last activity:</span>
                                <span className="font-bold text-foreground truncate max-w-[200px]">{selectedTerminal.last_action}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 uppercase font-sans text-[9px] font-black">Last seen:</span>
                                <span className="font-bold text-foreground">{new Date(selectedTerminal.last_seen_at).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 uppercase font-sans text-[9px] font-black">Cart Total:</span>
                                <span className="font-bold text-primary">{formatPrice(selectedTerminal.cart_value)}</span>
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
