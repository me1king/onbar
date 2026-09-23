'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';
import {
    Utensils,
    Flame,
    Clock,
    Zap,
    Plus,
    Loader2,
    Trash2,
    Power
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Image from 'next/image';

interface BiteProduct {
    id: number;
    name: string;
    price: number;
    stock: number;
    prep_time: number;
    is_available_now: boolean;
    image_url: string;
    category: string;
}

export default function BiteCommandCenter() {
    const [bites, setBites] = React.useState<BiteProduct[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isGlobalActive, setIsGlobalActive] = React.useState(true);
    const [stats, setStats] = React.useState({
        activeOrders: 0,
        avgPrep: 12,
        kitchenLoad: 'Stable'
    });

    const fetchBites = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data } = await supabase
                .from('products')
                .select('*')
                .eq('is_bite', true)
                .order('name');

            if (data) setBites(data as BiteProduct[]);

            // Fetch Kitchen Load
            const { data: metrics } = await supabase.from('kitchen_load_metrics').select('*').single();
            if (metrics) {
                setStats({
                    activeOrders: metrics.active_orders,
                    avgPrep: Math.round(metrics.avg_prep_min),
                    kitchenLoad: metrics.load_status
                });
            }
        } catch (err) {
            console.error("Bite Link Failure:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchBites();
    }, [fetchBites]);

    const toggleAvailability = async (id: number, current: boolean) => {
        const { error } = await supabase!.from('products').update({ is_available_now: !current }).eq('id', id);
        if (!error) setBites(bites.map(b => b.id === id ? { ...b, is_available_now: !current } : b));
    };

    return (
        <div className="p-8 space-y-12 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* BITE HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200 pb-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Utensils className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary italic">Night Bites Tactical Hub</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Bite <span className="text-primary">Command.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium">Manage late-night menus, kitchen velocity, and real-time food availability.</p>
                </div>
                <div className="flex gap-4">
                    <Button
                        variant={isGlobalActive ? 'outline' : 'default'}
                        onClick={() => setIsGlobalActive(!isGlobalActive)}
                        className={cn(
                            "rounded-2xl h-14 px-8 font-black uppercase text-[10px] tracking-widest transition-all",
                            isGlobalActive ? "border-emerald-100 text-emerald-600 bg-emerald-50" : "bg-rose-500 text-white shadow-xl shadow-rose-200"
                        )}
                    >
                        <Power size={16} className="mr-3" /> {isGlobalActive ? 'Kitchen Live' : 'Kitchen Offline'}
                    </Button>
                    <Button className="rounded-2xl h-14 px-10 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                        <Plus size={16} className="mr-3" /> Add New Bite
                    </Button>
                </div>
            </header>

            {/* KITCHEN ANALYTICS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                {[
                    { label: 'Active Food Orders', val: stats.activeOrders, icon: Flame, color: 'rose' },
                    { label: 'Avg Prep Time', val: `${stats.avgPrep} min`, icon: Clock, color: 'indigo' },
                    { label: 'Kitchen Load', val: stats.kitchenLoad, icon: Zap, color: stats.kitchenLoad === 'STABLE' ? 'emerald' : 'rose' },
                ].map(stat => (
                    <Card key={stat.label} className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm group hover:shadow-2xl transition-all">
                        <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center mb-8 shadow-inner transition-transform group-hover:scale-110",
                            stat.color === 'rose' ? "bg-rose-50 text-rose-500" :
                            stat.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                            "bg-emerald-50 text-emerald-500"
                        )}>
                            <stat.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h3 className={cn(
                            "text-3xl font-black uppercase tracking-tight tabular-nums",
                            stat.color === 'rose' && stats.kitchenLoad !== 'STABLE' ? "text-rose-500" : "text-foreground"
                        )}>{stat.val}</h3>
                    </Card>
                ))}
            </div>

            {/* LIVE MENU GRID */}
            <section className="space-y-8">
                <div className="flex justify-between items-center px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Live Menu Grid</h2>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocol: Night Bites Only</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {loading ? (
                        <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-primary" size={48} /></div>
                    ) : bites.map(bite => (
                        <Card key={bite.id} className="p-8 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm flex flex-col group hover:border-primary/20 transition-all">
                            <div className="relative aspect-square rounded-[2.5rem] bg-slate-50 border border-slate-50 overflow-hidden mb-6 shadow-inner">
                                <Image src={normalizeImage(bite.image_url)} alt={bite.name} fill className="object-contain p-4 group-hover:scale-110 transition-transform duration-700" />
                                <div className={cn(
                                    "absolute top-4 right-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg",
                                    bite.is_available_now ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                )}>
                                    {bite.is_available_now ? 'Live' : 'Hidden'}
                                </div>
                            </div>

                            <div className="space-y-4 flex-1">
                                <div>
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">{bite.category}</p>
                                    <h3 className="text-xl font-black text-foreground uppercase tracking-tight italic leading-none">{bite.name}</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                                    <div>
                                        <p className="text-[8px] font-black text-slate-300 uppercase">Price</p>
                                        <p className="text-sm font-black text-foreground">{formatPrice(bite.price)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-300 uppercase">Prep</p>
                                        <p className="text-sm font-black text-foreground">{bite.prep_time}m</p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => toggleAvailability(bite.id, bite.is_available_now)}
                                        className={cn(
                                            "flex-1 h-12 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all active:scale-95",
                                            bite.is_available_now ? "bg-slate-900 text-white" : "bg-emerald-500 text-white shadow-emerald-200 shadow-lg"
                                        )}
                                    >
                                        {bite.is_available_now ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-slate-200 hover:text-rose-500"><Trash2 size={20} /></Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            <div className="pt-6">
                <TacticalEventFeed
                    title="Bite Command Kitchen Telemetry"
                    subtitle="Live Food & Munchie Station Order Stream"
                />
            </div>

        </div>
    );
}
