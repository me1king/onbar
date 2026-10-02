'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Loader2,
    Play,
    RefreshCcw,
    Flame,
    Truck,
    PackageCheck,
    Wine
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface KdsItem {
    name: string;
    quantity: number;
    spec?: string;
}

interface KdsTicket {
    id: string;
    order_id: string;
    customer_name: string;
    stage: 'QUEUED' | 'PREPARING' | 'PACKED' | 'DISPATCHED';
    items: KdsItem[];
    customer_notes?: string;
    payment_method: string;
    order_age_sec: number;
    created_time: string;
    assigned_rider?: string;
}

export default function KitchenCommandHUD() {
    const [tickets, setTickets] = React.useState<KdsTicket[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);

    // Fetch live kitchen tickets from Supabase
    const fetchKitchenTickets = React.useCallback(async () => {
        if (!supabase) {
            setTickets([]);
            setLoadError('Supabase is not configured. Kitchen orders are unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('id, customer_name, status, payment_method, created_at, note, rider_name, order_items(product_id, quantity, size, products(name))')
                .order('created_at', { ascending: true });
            if (error) throw error;

            const now = Date.now();
            const dbTickets: KdsTicket[] = (data || [])
                .filter(ord => !['delivered', 'cancelled'].includes(String(ord.status || '').toLowerCase()))
                .map(ord => {
                    const rawItems = ord.order_items || [];
                    const parsedItems: KdsItem[] = rawItems.map(item => {
                        const product = Array.isArray(item.products) ? item.products[0] : item.products;
                        return {
                            name: product?.name || (item.product_id ? `Product #${item.product_id}` : 'Product details unavailable'),
                            quantity: Number(item.quantity || 0),
                            spec: item.size || undefined
                        };
                    });
                    const normalizedStatus = String(ord.status || '').toUpperCase();
                    const stage: KdsTicket['stage'] = normalizedStatus === 'PREPARING' ? 'PREPARING'
                        : normalizedStatus === 'PACKED' ? 'PACKED'
                        : normalizedStatus === 'DISPATCHED' || normalizedStatus === 'OUT FOR DELIVERY' ? 'DISPATCHED'
                        : 'QUEUED';
                    const createdAt = ord.created_at ? new Date(ord.created_at) : null;

                    return {
                        id: String(ord.id),
                        order_id: `#${ord.id}`,
                        customer_name: ord.customer_name || 'Customer name unavailable',
                        stage,
                        items: parsedItems,
                        customer_notes: ord.note || undefined,
                        payment_method: ord.payment_method || 'Payment method unavailable',
                        order_age_sec: createdAt && Number.isFinite(createdAt.getTime())
                            ? Math.max(0, Math.floor((now - createdAt.getTime()) / 1000))
                            : 0,
                        created_time: createdAt && Number.isFinite(createdAt.getTime())
                            ? createdAt.toLocaleString()
                            : 'Order time unavailable',
                        assigned_rider: ord.rider_name || undefined
                    };
                });
            setTickets(dbTickets);
            setLoadError(null);
        } catch (err) {
            console.error("Kitchen fetch error:", err);
            setTickets([]);
            setLoadError(err instanceof Error ? err.message : 'Kitchen orders could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchKitchenTickets();

        if (supabase) {
            const channel = supabase.channel('realtime_kds_tickets')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchKitchenTickets)
                .subscribe();
            return () => { if (supabase) supabase.removeChannel(channel); };
        }
    }, [fetchKitchenTickets]);

    // Animated Prep Countdown Timer (1s Interval)
    React.useEffect(() => {
        const timer = setInterval(() => {
            setTickets(prev => prev.map(t => ({
                ...t,
                order_age_sec: t.order_age_sec + 1
            })));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleAdvanceStage = async (ticketId: string, currentStage: KdsTicket['stage']) => {
        const nextStage: KdsTicket['stage'] = currentStage === 'QUEUED' ? 'PREPARING' : currentStage === 'PREPARING' ? 'PACKED' : 'DISPATCHED';

        if (!supabase) return;
        const { error } = await supabase.from('orders').update({ status: nextStage }).eq('id', ticketId);
        if (error) {
            setLoadError(`Order ${ticketId} was not updated: ${error.message}`);
            return;
        }
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, stage: nextStage } : t));
    };

    const formatTimer = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const riderAssignments = Array.from(tickets.reduce((assignments, ticket) => {
        if (ticket.assigned_rider) {
            assignments.set(ticket.assigned_rider, (assignments.get(ticket.assigned_rider) || 0) + 1);
        }
        return assignments;
    }, new Map<string, number>()));

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* HERO KITCHEN COMMAND HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-8 border-b border-slate-200/80 pb-8">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Flame className="h-5 w-5 text-rose-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 italic">LIVE KITCHEN COMMAND &bull; KDS TERMINAL</span>
                        <span className={cn(
                            "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                            loadError ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        )}>
                            {loadError ? 'Orders Unavailable' : loading ? 'Syncing' : 'Live Orders'}
                        </span>
                    </div>
                    <h1 className="text-4xl lg:text-6xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Bite <span className="text-rose-500 italic">Logistics.</span>
                    </h1>
                    <p className="text-slate-500 text-sm font-medium italic">
                        Kitchen order queue from recorded customer orders.
                    </p>
                </div>

                <div className="flex gap-4 items-center">
                    <Button onClick={fetchKitchenTickets} variant="outline" className="h-14 px-4 rounded-2xl bg-white border-slate-200 font-black uppercase text-[9px] tracking-widest">
                        <RefreshCcw size={16} className={cn("mr-2", loading && "animate-spin")} /> Re-Sync KDS
                    </Button>
                </div>
            </header>

            {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{loadError}</p>}

            {/* LIVE KITCHEN COUNTS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Active Tickets</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{loading ? '…' : loadError ? 'Unavailable' : tickets.length}</p>
                </Card>
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-amber-600 tracking-widest">Preparing</p>
                    <p className="text-3xl font-black text-amber-600 tabular-nums">{loading ? '…' : loadError ? 'Unavailable' : tickets.filter(t => t.stage === 'PREPARING').length}</p>
                </Card>
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">Dispatch Ready</p>
                    <p className="text-3xl font-black text-indigo-600 tabular-nums">{loading ? '…' : loadError ? 'Unavailable' : tickets.filter(t => t.stage === 'PACKED').length}</p>
                </Card>
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Prep SLA</p>
                    <p className="text-xl font-black text-slate-500 uppercase italic mt-1">Not tracked</p>
                </Card>
            </div>

            {/* LIVE KITCHEN TICKETS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {loading && tickets.length === 0 ? (
                    <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-rose-500" size={56} /></div>
                ) : tickets.length === 0 ? (
                    <p className="col-span-full py-16 text-center text-sm font-bold text-slate-500">
                        {loadError ? 'Kitchen orders could not be loaded.' : 'No active kitchen orders.'}
                    </p>
                ) : tickets.map((t) => {

                    return (
                        <Card key={t.id} className="rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md flex flex-col justify-between overflow-hidden relative group text-left">

                            {/* Ticket Header */}
                            <div className="p-8 pb-5 border-b border-slate-100 bg-slate-50/50 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className={cn(
                                            "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                            t.stage === 'PREPARING' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                            t.stage === 'PACKED' ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                                            "bg-slate-100 text-slate-700 border-slate-200"
                                        )}>
                                            {t.stage}
                                        </span>
                                        <h3 className="text-3xl font-black text-foreground uppercase tracking-tight mt-3">{t.order_id}</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.customer_name}</p>
                                    </div>

                                    {/* Elapsed order age from the recorded order timestamp */}
                                    <div className="text-right">
                                        <p className="text-[8px] font-black uppercase text-slate-400">Order Age</p>
                                        <p className="text-2xl font-black font-mono tracking-wider tabular-nums text-slate-600">{formatTimer(t.order_age_sec)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Ticket Items & Customer Notes */}
                            <div className="p-8 space-y-6 flex-1">
                                <div className="space-y-3">
                                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Order Manifest</p>
                                    {t.items.length === 0 && <p className="text-xs font-bold text-slate-400">No order line items recorded.</p>}
                                    {t.items.map((item, i) => (
                                        <div key={i} className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-black uppercase text-foreground">{item.name}</span>
                                                <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-xs font-black text-primary">
                                                    x{item.quantity}
                                                </span>
                                            </div>
                                            {item.spec && (
                                                <p className="text-[9px] font-bold text-slate-400 uppercase italic flex items-center gap-1">
                                                    <Wine size={10} className="text-amber-500" /> {item.spec}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Customer Special Request Notes */}
                                {t.customer_notes && (
                                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-1">
                                        <p className="text-[8px] font-black uppercase text-amber-800 tracking-widest">Special Request Note</p>
                                        <p className="text-xs font-bold text-amber-950 uppercase italic">&quot;{t.customer_notes}&quot;</p>
                                    </div>
                                )}

                                {t.assigned_rider && (
                                    <p className="text-[10px] font-bold text-indigo-700">Assigned rider: {t.assigned_rider}</p>
                                )}

                                <div className="pt-2 flex justify-between items-center text-[9px] font-black uppercase text-slate-400">
                                    <span>{t.payment_method}</span>
                                    <span>{t.created_time}</span>
                                </div>
                            </div>

                            {/* Stage Advance Button */}
                            <div className="p-8 pt-0">
                                <Button
                                    onClick={() => handleAdvanceStage(t.id, t.stage)}
                                    disabled={t.stage === 'DISPATCHED'}
                                    className={cn(
                                        "w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all",
                                        t.stage === 'QUEUED' ? "bg-amber-500 text-white hover:bg-amber-600" :
                                        t.stage === 'PREPARING' ? "bg-indigo-600 text-white hover:bg-indigo-700" :
                                        "bg-emerald-500 text-white hover:bg-emerald-600"
                                    )}
                                >
                                    {t.stage === 'DISPATCHED' ? 'Dispatched' :
                                     t.stage === 'QUEUED' ? <><Play size={16} className="mr-2 fill-current" /> Start Preparation</> :
                                     t.stage === 'PREPARING' ? <><PackageCheck size={16} className="mr-2" /> Mark Packed & Ready</> :
                                     <><Truck size={16} className="mr-2" /> Dispatch to Rider</>}
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* ASSIGNMENTS AND TRACKING AVAILABILITY */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Truck className="h-6 w-6 text-primary" />
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Recorded Rider Assignments</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">From active order records</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {loadError
                            ? <p className="text-sm font-bold text-slate-500">Rider assignments are unavailable because orders could not be loaded.</p>
                            : riderAssignments.length === 0
                            ? <p className="text-sm font-bold text-slate-500">No rider assignments are recorded on active orders.</p>
                            : riderAssignments.map(([name, count]) => (
                                <div key={name} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                                    <p className="text-xs font-black uppercase text-foreground">{name}</p>
                                    <span className="text-[10px] font-bold text-slate-500">{count} active {count === 1 ? 'order' : 'orders'}</span>
                                </div>
                            ))}
                    </div>
                </Card>

                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Flame className="h-6 w-6 text-slate-400" />
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Ingredient Inventory</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Not connected</p>
                        </div>
                    </div>
                    <p className="text-sm font-medium text-slate-500">Ingredient quantities are unavailable: the database has no kitchen ingredient inventory table.</p>
                </Card>
            </div>

            {/* CURRENT STATUS ONLY; ORDER STATUS HISTORY IS NOT STORED */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <RefreshCcw className="h-6 w-6 text-primary" />
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Current Order Status</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Status history is not stored in the orders table</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {loadError
                        ? <p className="col-span-full text-sm font-bold text-slate-500">Order statuses are unavailable because orders could not be loaded.</p>
                        : tickets.length === 0
                        ? <p className="col-span-full text-sm font-bold text-slate-500">No active order statuses to display.</p>
                        : tickets.slice(0, 6).map(ticket => (
                            <div key={ticket.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <span className="text-[9px] font-mono font-black text-primary bg-white px-2 py-0.5 rounded border border-slate-200">{ticket.created_time}</span>
                                <p className="text-xs font-black uppercase text-foreground pt-1">{ticket.order_id} · {ticket.stage}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{ticket.customer_name}</p>
                            </div>
                        ))}
                </div>
            </Card>

        </div>
    );
}
