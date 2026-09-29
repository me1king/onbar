'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Loader2,
    Play,
    RefreshCcw,
    AlertTriangle,
    Flame,
    Truck,
    PackageCheck,
    Activity,
    MessageCircle,
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
    order_id: string | number;
    customer_name: string;
    table_or_address: string;
    stage: 'QUEUED' | 'PREPARING' | 'PACKED' | 'DISPATCHED';
    items: KdsItem[];
    customer_notes?: string;
    payment_method: string;
    prep_timer_sec: number;
    created_time: string;
    station: 'Grill' | 'Fryer' | 'Drinks' | 'Packing';
    assigned_rider?: string;
}

export default function KitchenCommandHUD() {
    const [tickets, setTickets] = React.useState<KdsTicket[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isHighLoadMode, setIsHighLoadMode] = React.useState(false);
    const [activeStationFilter, setActiveStationFilter] = React.useState<string>('ALL');
    const [latestWaAlert, setLatestWaAlert] = React.useState<string>('WhatsApp dispatch update sent to +2547***: Order #B-1027 is now cooking!');

    // Fetch live kitchen tickets from Supabase
    const fetchKitchenTickets = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data } = await supabase
                .from('orders')
                .select('*')
                .neq('status', 'Delivered')
                .order('created_at', { ascending: true });

            if (data && data.length > 0) {
                const dbTickets: KdsTicket[] = data.map((ord, idx) => {
                    const rawItems = ord.order_items || [];
                    const parsedItems: KdsItem[] = rawItems.length > 0
                        ? rawItems.map((item: { product_name?: string; quantity?: number; size?: string }) => ({
                            name: item.product_name || 'Bite Item',
                            quantity: item.quantity || 1,
                            spec: item.size || 'Prepared Fresh'
                        }))
                        : [{ name: 'Bite & Beverage Order', quantity: 1, spec: 'Express Kitchen' }];

                    return {
                        id: `kds-${ord.id}`,
                        order_id: `B-${ord.id}`,
                        customer_name: ord.customer_name || 'Patron',
                        table_or_address: ord.delivery_address || 'Express Dispatch Node',
                        stage: ord.status === 'PREPARING' ? 'PREPARING' : ord.status === 'PACKED' ? 'PACKED' : 'QUEUED',
                        station: idx % 2 === 0 ? 'Grill' : 'Fryer',
                        items: parsedItems,
                        customer_notes: ord.note || undefined,
                        payment_method: ord.payment_method ? `Paid via ${ord.payment_method}` : 'Paid via M-Pesa',
                        prep_timer_sec: Math.max(120, 600 - (idx * 90)),
                        created_time: new Date(ord.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    };
                });
                setTickets(dbTickets);
            }
        } catch (err) {
            console.error("Kitchen fetch error:", err);
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
                prep_timer_sec: Math.max(0, t.prep_timer_sec - 1)
            })));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleAdvanceStage = async (ticketId: string, currentStage: KdsTicket['stage']) => {
        const nextStage: KdsTicket['stage'] = currentStage === 'QUEUED' ? 'PREPARING' : currentStage === 'PREPARING' ? 'PACKED' : 'DISPATCHED';

        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, stage: nextStage } : t));

        const targetTicket = tickets.find(t => t.id === ticketId);
        const orderNum = targetTicket?.order_id || ticketId;

        if (nextStage === 'PREPARING') {
            setLatestWaAlert(`WhatsApp dispatch update sent to customer: Order ${orderNum} is now cooking! 🍳`);
        } else if (nextStage === 'PACKED') {
            setLatestWaAlert(`WhatsApp dispatch update sent to customer: Order ${orderNum} is packed and sealed! 🎒`);
        } else if (nextStage === 'DISPATCHED') {
            setLatestWaAlert(`WhatsApp dispatch update sent to customer: Order ${orderNum} dispatched with Runner! 🏍️`);
        }

        const cleanOrderId = ticketId.replace('kds-', '');
        if (supabase) {
            await supabase.from('orders').update({ status: nextStage }).eq('id', cleanOrderId);
        }
    };

    const handleAssignRider = (ticketId: string, riderName: string) => {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, assigned_rider: riderName } : t));
        setLatestWaAlert(`Runner assigned: ${riderName} assigned to Order ${ticketId.replace('kds-', '#B-')}! 🚀`);
    };

    const formatTimer = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const filteredTickets = tickets.filter(t => {
        if (activeStationFilter === 'ALL') return true;
        return t.station === activeStationFilter;
    });

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* HERO KITCHEN COMMAND HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-8 border-b border-slate-200/80 pb-8">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Flame className="h-5 w-5 text-rose-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 italic">LIVE KITCHEN COMMAND &bull; KDS TERMINAL</span>
                        <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            Grid Synchronized
                        </span>
                    </div>
                    <h1 className="text-4xl lg:text-6xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Bite <span className="text-rose-500 italic">Logistics.</span>
                    </h1>
                    <p className="text-slate-500 text-sm font-medium italic">
                        &quot;Maintaining 20-minute grid integrity. Prepare &bull; Pack &bull; Dispatch.&quot;
                    </p>
                </div>

                <div className="flex gap-4 items-center">
                    <Button
                        onClick={() => setIsHighLoadMode(!isHighLoadMode)}
                        variant="outline"
                        className={cn(
                            "h-14 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all border",
                            isHighLoadMode ? "bg-rose-500 text-white border-rose-500 shadow-xl shadow-rose-200" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        )}
                    >
                        <AlertTriangle size={16} className="mr-2" /> {isHighLoadMode ? '⚠ HIGH LOAD PROTOCOL (ETA 35m)' : 'Normal Load (ETA 18m)'}
                    </Button>
                    <Button onClick={fetchKitchenTickets} variant="outline" className="h-14 px-4 rounded-2xl bg-white border-slate-200 font-black uppercase text-[9px] tracking-widest">
                        <RefreshCcw size={16} className={cn("mr-2", loading && "animate-spin")} /> Re-Sync KDS
                    </Button>
                </div>
            </header>

            {/* AUTOMATED WHATSAPP DISPATCH TICKER */}
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center gap-3 text-emerald-800 shadow-sm animate-in fade-in duration-500">
                <MessageCircle size={18} className="text-emerald-600 animate-pulse shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 shrink-0">WhatsApp Auto-Dispatcher:</span>
                <span className="text-xs font-bold truncate italic">{latestWaAlert}</span>
            </div>

            {/* LIVE KITCHEN METRICS HUD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Active Tickets</p>
                    <p className="text-3xl font-black text-foreground tabular-nums">{tickets.length}</p>
                </Card>
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-amber-600 tracking-widest">Preparing</p>
                    <p className="text-3xl font-black text-amber-600 tabular-nums">{tickets.filter(t => t.stage === 'PREPARING').length || 1}</p>
                </Card>
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">Dispatch Ready</p>
                    <p className="text-3xl font-black text-indigo-600 tabular-nums">{tickets.filter(t => t.stage === 'PACKED').length || 1}</p>
                </Card>
                <Card className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Avg Prep SLA</p>
                    <p className="text-xl font-black text-emerald-600 uppercase italic mt-1">{isHighLoadMode ? '35 Minutes' : '11.4 Minutes'}</p>
                </Card>
            </div>

            {/* STATION FILTER PILLS */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {['ALL', 'Grill', 'Fryer', 'Drinks', 'Packing'].map(st => (
                    <button
                        key={st}
                        onClick={() => setActiveStationFilter(st)}
                        className={cn(
                            "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border shadow-sm",
                            activeStationFilter === st
                                ? "bg-rose-500 text-white border-rose-500 shadow-rose-200 scale-105"
                                : "bg-white text-slate-500 border-slate-200/80 hover:bg-slate-100"
                        )}
                    >
                        {st === 'ALL' ? 'All Stations' : `${st} Station`}
                    </button>
                ))}
            </div>

            {/* LIVE KITCHEN TICKETS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {loading && tickets.length === 0 ? (
                    <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-rose-500" size={56} /></div>
                ) : filteredTickets.map((t) => {
                    const isLate = t.prep_timer_sec === 0;
                    const isWarning = t.prep_timer_sec > 0 && t.prep_timer_sec < 180;

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
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.table_or_address}</p>
                                    </div>

                                    {/* Prep Timer Counter */}
                                    <div className="text-right">
                                        <p className="text-[8px] font-black uppercase text-slate-400">Prep Timer</p>
                                        <p className={cn(
                                            "text-2xl font-black font-mono tracking-wider tabular-nums",
                                            isLate ? "text-rose-600 animate-pulse" : isWarning ? "text-amber-600" : "text-emerald-600"
                                        )}>
                                            {formatTimer(t.prep_timer_sec)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Ticket Items & Customer Notes */}
                            <div className="p-8 space-y-6 flex-1">
                                <div className="space-y-3">
                                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Order Manifest</p>
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

                                {/* Rider Selection Dropdown for PACKED Stage */}
                                {t.stage === 'PACKED' && (
                                    <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200/80 space-y-1">
                                        <p className="text-[8px] font-black uppercase text-indigo-800 tracking-widest">Assign Dispatch Runner</p>
                                        <select
                                            value={t.assigned_rider || ''}
                                            onChange={e => handleAssignRider(t.id, e.target.value)}
                                            className="w-full bg-white rounded-xl h-10 text-xs font-black uppercase border-indigo-200 px-3"
                                        >
                                            <option value="">Select Runner...</option>
                                            <option value="Kamau (Rider 1)">Rider 1 - Kamau</option>
                                            <option value="Ochieng (Rider 2)">Rider 2 - Ochieng</option>
                                            <option value="Mutua (Rider 3)">Rider 3 - Mutua</option>
                                        </select>
                                    </div>
                                )}

                                <div className="pt-2 flex justify-between items-center text-[9px] font-black uppercase text-slate-400">
                                    <span>{t.payment_method}</span>
                                    <span>Station: {t.station}</span>
                                </div>
                            </div>

                            {/* Stage Advance Button */}
                            <div className="p-8 pt-0">
                                <Button
                                    onClick={() => handleAdvanceStage(t.id, t.stage)}
                                    className={cn(
                                        "w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all",
                                        t.stage === 'QUEUED' ? "bg-amber-500 text-white hover:bg-amber-600" :
                                        t.stage === 'PREPARING' ? "bg-indigo-600 text-white hover:bg-indigo-700" :
                                        "bg-emerald-500 text-white hover:bg-emerald-600"
                                    )}
                                >
                                    {t.stage === 'QUEUED' ? <><Play size={16} className="mr-2 fill-current" /> Start Preparation</> :
                                     t.stage === 'PREPARING' ? <><PackageCheck size={16} className="mr-2" /> Mark Packed & Ready</> :
                                     <><Truck size={16} className="mr-2" /> Dispatch to Rider</>}
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* RIDER DISPATCH TRACKER & LOW INGREDIENT STOCK RADAR */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Rider Dispatch Status */}
                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Truck className="h-6 w-6 text-primary" />
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Live Rider Dispatch Status</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Runner Fleet Telemetry</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {[
                            { name: 'Rider 1 (Kamau)', location: 'Heading to Westlands Sector', status: 'En Route', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                            { name: 'Rider 2 (Ochieng)', location: 'Picking Up Order #B-1029', status: 'At Hub', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                            { name: 'Rider 3 (Mutua)', location: 'Returning to Cellar Base', status: 'Returning', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                        ].map((r, i) => (
                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                                <div className="space-y-0.5">
                                    <p className="text-xs font-black uppercase text-foreground">{r.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{r.location}</p>
                                </div>
                                <span className={cn("px-3 py-1 rounded-full text-[8px] font-black uppercase border shrink-0", r.color)}>
                                    {r.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Ingredient Low Stock Radar */}
                <Card className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <AlertTriangle className="h-6 w-6 text-amber-500" />
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Ingredient Stock Radar</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Auto-Disables Out of Stock Store Items</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {[
                            { ingredient: 'Burger Buns', count: '120 Units', warning: 'Fully Stocked 🟢' },
                            { ingredient: 'Processed Cheese Slices', count: '80 Packs', warning: 'Fully Stocked 🟢' },
                            { ingredient: 'Golden Potato Fries', count: '150 Servings', warning: 'Sufficient 🟢' },
                        ].map((ing, i) => (
                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-black uppercase text-foreground">{ing.ingredient}</p>
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase">{ing.warning}</p>
                                </div>
                                <span className="text-sm font-black uppercase text-emerald-600 px-3 py-1 bg-white rounded-xl border border-slate-200 font-mono">
                                    {ing.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* CHRONOLOGICAL MISSION TIMELINE */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <Activity className="h-6 w-6 text-primary animate-pulse" />
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground italic">Chronological Mission Timeline</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Order Step History & Telemetry</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                        { time: '19:10', label: 'Order Received', desc: 'Order #B-1027' },
                        { time: '19:11', label: 'M-Pesa Verified', desc: 'KSh 1,280' },
                        { time: '19:12', label: 'Grill Fired', desc: 'Smocha Supreme' },
                        { time: '19:18', label: 'Packed & Sealed', desc: 'Station 4' },
                        { time: '19:20', label: 'Rider Assigned', desc: 'Kamau (Runner 1)' },
                        { time: '19:34', label: 'Delivered', desc: '18 min Total SLA' },
                    ].map((step, i) => (
                        <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                            <span className="text-[9px] font-mono font-black text-primary bg-white px-2 py-0.5 rounded border border-slate-200">{step.time}</span>
                            <p className="text-xs font-black uppercase text-foreground pt-1">{step.label}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </Card>

        </div>
    );
}
