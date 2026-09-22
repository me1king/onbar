'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    CheckCircle2,
    Loader2,
    Zap,
    Play,
    Users,
    RefreshCcw
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface KitchenOrder {
    id: string;
    order_id: number;
    status: string;
    prep_start_at: string;
    created_at: string;
    estimated_ready_at: string;
    order_details: {
        customer_name: string;
        items: Array<{ name: string, quantity: number }>;
    }
}

interface DBKitchenOrder {
    id: string;
    order_id: number;
    status: string;
    prep_start_at: string;
    created_at: string;
    estimated_ready_at: string;
    order: {
        customer_name: string;
        order_items: Array<{
            product: { name: string } | null;
            quantity: number;
        }>;
    } | null;
}

export default function KitchenCommandHUD() {
    const [orders, setOrders] = React.useState<KitchenOrder[]>([]);
    const [loading, setLoading] = React.useState(true);

    const fetchKitchenOrders = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            // High-fidelity fetch for active kitchen missions
            const { data } = await supabase
                .from('kitchen_orders')
                .select('*, order:orders(customer_name, order_items(product:products(name), quantity))')
                .in('status', ['QUEUED', 'PREPARING'])
                .order('created_at', { ascending: true });

            if (data) {
                setOrders((data as unknown as DBKitchenOrder[]).map(o => ({
                    ...o,
                    order_details: {
                        customer_name: o.order?.customer_name || 'Anonymous Patron',
                        items: o.order?.order_items.map(i => ({
                            name: i.product?.name || 'Unknown Item',
                            quantity: i.quantity
                        })) || []
                    }
                })));
            }
        } catch (err) {
            console.error("Kitchen Node offline:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchKitchenOrders();

        // Real-time synchronization
        if (supabase) {
            const channel = supabase.channel('kitchen-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_orders' }, fetchKitchenOrders)
                .subscribe();
            return () => { if (supabase) supabase.removeChannel(channel); };
        }
    }, [fetchKitchenOrders]);

    const updateStatus = async (id: string, nextStatus: string) => {
        const { error } = await supabase!.from('kitchen_orders').update({
            status: nextStatus,
            prep_start_at: nextStatus === 'PREPARING' ? new Date().toISOString() : undefined,
            prep_ready_at: nextStatus === 'READY' ? new Date().toISOString() : undefined
        }).eq('id', id);

        if (!error && nextStatus === 'READY') {
            // Auto-trigger dispatch engine here if possible
            alert("Mission Status: READY. Notifying Dispatch Node.");
        }
    };

    return (
        <div className="p-8 space-y-12 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* KITCHEN HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200 pb-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 italic">Live Kitchen Command</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Bite <span className="text-rose-500">Logistics.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium italic">&quot;Maintaining 20-minute grid integrity. Prepare. Pack. Dispatch.&quot;</p>
                </div>
                <div className="flex gap-4">
                    <Card className="px-8 h-14 rounded-2xl bg-white border border-slate-100 flex items-center gap-6 shadow-sm">
                        <div className="text-left border-r border-slate-50 pr-6">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Active Orders</p>
                            <p className="text-xl font-black text-foreground tabular-nums">{orders.length}</p>
                        </div>
                        <div className="text-left">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">System Load</p>
                            <p className="text-xl font-black text-emerald-500 uppercase italic">Stable</p>
                        </div>
                    </Card>
                </div>
            </header>

            {/* ACTIVE ORDERS HUD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-10">
                {loading && orders.length === 0 ? (
                    <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-rose-500" size={64} /></div>
                ) : orders.map((mission) => (
                    <Card key={mission.id} className="rounded-[4rem] bg-white border border-slate-100 shadow-xl overflow-hidden relative group">

                        {/* MISSION HEADER */}
                        <div className="p-10 pb-6 border-b border-slate-50 relative overflow-hidden">
                            <div className="flex justify-between items-start relative z-10">
                                <div className="space-y-1">
                                    <span className={cn(
                                        "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                        mission.status === 'PREPARING' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-indigo-50 text-indigo-600 border-indigo-100"
                                    )}>
                                        {mission.status}
                                    </span>
                                    <h3 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none italic mt-4">#{mission.order_id}</h3>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Users size={12} className="text-primary" /> {mission.order_details.customer_name}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Queue Time</p>
                                    <p className="text-xl font-black text-foreground tabular-nums">{Math.floor((Date.now() - new Date(mission.created_at).getTime()) / 60000)}m</p>
                                </div>
                            </div>
                        </div>

                        {/* ITEMS LIST */}
                        <div className="p-10 space-y-8 min-h-[200px]">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Cargo Manifest</p>
                            <div className="space-y-4">
                                {mission.order_details.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 group-hover:bg-white transition-all">
                                        <span className="text-sm font-black text-foreground uppercase tracking-tight italic">{item.name}</span>
                                        <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center font-black text-primary shadow-inner">
                                            x{item.quantity}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* TACTICAL ACTIONS */}
                        <div className="p-10 bg-slate-50/50 border-t border-slate-50">
                            {mission.status === 'QUEUED' ? (
                                <Button
                                    onClick={() => updateStatus(mission.id, 'PREPARING')}
                                    className="w-full h-20 rounded-[2.5rem] bg-indigo-600 text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    <Play size={20} className="mr-3 fill-current" /> Start Preparation
                                </Button>
                            ) : (
                                <div className="grid gap-4">
                                    <div className="space-y-2 mb-4">
                                        <div className="flex justify-between text-[8px] font-black uppercase text-amber-600">
                                            <span>Preparation Progress</span>
                                            <span>75%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-amber-500 animate-pulse" style={{ width: '75%' }} />
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => updateStatus(mission.id, 'READY')}
                                        className="w-full h-20 rounded-[2.5rem] bg-emerald-500 text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-100 hover:scale-[1.02] active:scale-95 transition-all"
                                    >
                                        <CheckCircle2 size={20} className="mr-3" /> Mark Ready for Dispatch
                                    </Button>
                                </div>
                            )}
                        </div>

                        <Zap className="absolute -bottom-6 -right-6 h-32 w-32 text-rose-500/5 rotate-12" />
                    </Card>
                ))}
            </div>

            {/* KITCHEN LOG HUD */}
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
                <Card className="bg-slate-900/90 backdrop-blur-2xl px-10 py-6 rounded-[2.5rem] shadow-2xl flex items-center gap-10 border border-white/10 text-white">
                    <div className="flex items-center gap-4">
                        <div className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
                        <div>
                            <p className="text-[8px] font-black uppercase opacity-60 tracking-widest">Network Status</p>
                            <p className="text-[10px] font-black uppercase">Grid Node Connected</p>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="text-left">
                        <p className="text-[8px] font-black uppercase opacity-60 tracking-widest">Average Prep</p>
                        <p className="text-[10px] font-black uppercase text-primary">11.4 Minutes</p>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <Button onClick={fetchKitchenOrders} variant="ghost" className="h-12 rounded-xl text-[9px] font-black uppercase hover:bg-white/5">
                        <RefreshCcw size={14} className="mr-2" /> Re-Sync Grid
                    </Button>
                </Card>
            </div>

        </div>
    );
}
