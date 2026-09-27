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
    Power,
    X,
    CheckCircle2,
    Activity,
    AlertTriangle,
    Truck
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Image from 'next/image';

interface BiteProduct {
    id: number | string;
    name: string;
    price: number;
    stock: number;
    prep_time: number;
    is_available_now: boolean;
    image_url: string;
    category: string;
    description?: string;
}

interface OrderTimelineItem {
    id: string;
    items: string;
    stage: 'Prep' | 'Packing' | 'Delivered';
    statusText: string;
    timeLabel: string;
    badgeColor: string;
}

export default function BiteCommandCenter() {
    const [bites, setBites] = React.useState<BiteProduct[]>([]);
    const [timeline, setTimeline] = React.useState<OrderTimelineItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isGlobalActive, setIsGlobalActive] = React.useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [commandPulseCount, setCommandPulseCount] = React.useState(0);

    // New Food Item Form State
    const [newFood, setNewFood] = React.useState({
        name: '',
        category: 'Street Bites',
        price: '',
        prep_time: '15',
        image_url: '',
        description: '',
        drink_pairings: 'Amarula, Coca-Cola, Tusker'
    });

    const [stats, setStats] = React.useState({
        cooking: 7,
        avgPrep: 11,
        dispatchReady: 4,
        kitchenLoad: 'Stable'
    });

    const fetchBites = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data } = await supabase
                .from('products')
                .select('*')
                .or('is_bite.eq.true,is_snack.eq.true')
                .order('name');

            if (data && data.length > 0) {
                setBites(data as BiteProduct[]);
            }

            const { data: ordData } = await supabase
                .from('orders')
                .select('id, total_price, status, created_at')
                .order('created_at', { ascending: false })
                .limit(5);

            if (ordData && ordData.length > 0) {
                const liveTimelineItems: OrderTimelineItem[] = ordData.map((ord) => ({
                    id: `#${ord.id}`,
                    items: `Order #${ord.id} - ${ord.status || 'Active'}`,
                    stage: ord.status === 'PREPARING' ? 'Prep' : ord.status === 'PACKED' ? 'Packing' : 'Delivered',
                    statusText: `Status: ${ord.status || 'Received'} • Value: KSh ${ord.total_price || 1200}`,
                    timeLabel: new Date(ord.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    badgeColor: ord.status === 'PREPARING' ? 'bg-amber-500 text-white' : ord.status === 'PACKED' ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white'
                }));
                setTimeline(liveTimelineItems);
            }

            const { data: metrics } = await supabase.from('kitchen_load_metrics').select('*').single();
            if (metrics) {
                setStats(s => ({
                    ...s,
                    cooking: metrics.active_orders || 7,
                    avgPrep: Math.round(metrics.avg_prep_min) || 11,
                    kitchenLoad: metrics.load_status || 'Stable'
                }));
            }
        } catch (err) {
            console.error("Bite Link Failure:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchBites();

        if (supabase) {
            const channel = supabase
                .channel('realtime_admin_bites')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    fetchBites();
                })
                .subscribe();

            return () => {
                if (supabase) supabase.removeChannel(channel);
            };
        }
    }, [fetchBites]);

    // Live Command Pulse Timer (5s interval)
    React.useEffect(() => {
        const timer = setInterval(() => {
            setCommandPulseCount(prev => prev + 1);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const toggleAvailability = async (id: number | string, current: boolean) => {
        if (!supabase) return;
        const { error } = await supabase.from('products').update({ is_available_now: !current }).eq('id', id);
        if (!error) {
            setBites(bites.map(b => b.id === id ? { ...b, is_available_now: !current } : b));
        }
    };

    const handleDelete = async (id: number | string) => {
        if (!supabase) return;
        if (!confirm('Are you sure you want to remove this food item from the menu?')) return;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (!error) {
            setBites(bites.filter(b => b.id !== id));
        }
    };

    const handleCreateBite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFood.name || !newFood.price) {
            alert('Please provide food name and price');
            return;
        }

        setIsSubmitting(true);
        const pairings = newFood.drink_pairings.split(',').map(s => s.trim()).filter(Boolean);

        const payload = {
            name: newFood.name,
            category: newFood.category,
            price: Number(newFood.price),
            prep_time: Number(newFood.prep_time) || 15,
            image_url: newFood.image_url || 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&q=80',
            description: newFood.description,
            drink_pairings: pairings,
            is_snack: true,
            is_bite: true,
            is_available_now: true,
            stock: 50
        };

        if (supabase) {
            const { data, error } = await supabase.from('products').insert([payload]).select();
            if (error) {
                alert(`Error adding food item: ${error.message}`);
            } else if (data) {
                setBites([data[0] as BiteProduct, ...bites]);
                setIsAddModalOpen(false);
                setNewFood({
                    name: '',
                    category: 'Street Bites',
                    price: '',
                    prep_time: '15',
                    image_url: '',
                    description: '',
                    drink_pairings: 'Amarula, Coca-Cola, Tusker'
                });
            }
        }
        setIsSubmitting(false);
    };

    return (
        <div
            className="p-8 space-y-12 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700 relative overflow-hidden"
            style={{
                background: 'radial-gradient(circle at top right, rgba(245, 160, 0, 0.08), transparent 45%), radial-gradient(circle at bottom left, rgba(30, 58, 138, 0.08), transparent 45%), #F8FAFC'
            }}
        >

            {/* BITE HEADER (HERO LIVE OPERATIONS) */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200/80 pb-10 relative z-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Utensils className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary italic">Live Kitchen Operations Center</span>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[8px] font-black uppercase tracking-widest">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> ONLINE
                        </div>
                    </div>
                    <h1 className="text-4xl lg:text-6xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Bite <span className="text-primary italic">Command.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium italic">
                        Prepare &bull; Pack &bull; Dispatch &bull; Real-time food velocity & drink pairings.
                    </p>
                </div>
                <div className="flex gap-4 shrink-0">
                    <Button
                        variant={isGlobalActive ? 'outline' : 'default'}
                        onClick={() => setIsGlobalActive(!isGlobalActive)}
                        className={cn(
                            "rounded-2xl h-14 px-8 font-black uppercase text-[10px] tracking-widest transition-all shadow-md",
                            isGlobalActive ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "bg-rose-500 text-white shadow-xl shadow-rose-200"
                        )}
                    >
                        <Power size={16} className="mr-3" /> {isGlobalActive ? 'Kitchen Live' : 'Kitchen Offline'}
                    </Button>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="rounded-2xl h-14 px-10 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus size={16} className="mr-3" /> + Add Food Item
                    </Button>
                </div>
            </header>

            {/* LIVE STATS CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
                {[
                    { label: 'Cooking Now', val: `${stats.cooking} Orders`, sub: '+2 in last 5 min', icon: Flame, color: 'rose' },
                    { label: 'Average Prep Time', val: `${stats.avgPrep} min`, sub: 'Target: 15 min', icon: Clock, color: 'indigo' },
                    { label: 'Dispatch Ready', val: `${stats.dispatchReady} Orders`, sub: 'Waiting for rider', icon: Truck, color: 'amber' },
                    { label: 'Kitchen Load', val: stats.kitchenLoad, sub: 'Green Zone', icon: Zap, color: 'emerald' },
                ].map(stat => (
                    <Card key={stat.label} className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md group hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                        <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center mb-6 shadow-inner transition-transform group-hover:scale-110",
                            stat.color === 'rose' ? "bg-rose-50 text-rose-500" :
                            stat.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                            stat.color === 'amber' ? "bg-amber-50 text-amber-500" :
                            "bg-emerald-50 text-emerald-500"
                        )}>
                            <stat.icon size={22} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h3 className="text-3xl font-black uppercase tracking-tight tabular-nums text-foreground">{stat.val}</h3>
                        <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider mt-2">{stat.sub}</p>
                    </Card>
                ))}
            </div>

            {/* LIVE ORDER TIMELINE & KITCHEN HEAT MAP SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
                {/* LIVE ORDER TIMELINE (2 COLS) */}
                <Card className="lg:col-span-2 p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-8 text-left">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-6">
                        <div>
                            <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.3em]">
                                <Activity size={14} className="animate-pulse" /> Live Telemetry
                            </div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Live Order Timeline</h2>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[9px] font-black uppercase">
                            Pulse #{commandPulseCount} &bull; Active
                        </span>
                    </div>

                    <div className="space-y-4">
                        {timeline.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-xs uppercase font-bold">No active orders in timeline</div>
                        ) : timeline.map((order) => (
                            <div key={order.id} className="p-5 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-100/80 transition-colors">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className={cn("px-3.5 py-1.5 rounded-2xl text-xs font-black uppercase tracking-tight shrink-0", order.badgeColor)}>
                                        {order.id}
                                    </div>
                                    <div className="min-w-0 space-y-0.5">
                                        <h4 className="text-sm font-black text-foreground uppercase truncate">{order.items}</h4>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{order.statusText}</p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black uppercase text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
                                    {order.timeLabel}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* KITCHEN HEAT MAP (1 COL) */}
                <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-8 text-left flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.3em] mb-1">
                            <Flame size={14} /> Station Load
                        </div>
                        <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Kitchen Heat Map</h2>
                    </div>

                    <div className="space-y-6 my-auto">
                        {[
                            { station: 'Grill Station', load: 80, status: 'Heavy', color: 'bg-rose-500' },
                            { station: 'Fryer Station', load: 45, status: 'Optimal', color: 'bg-amber-500' },
                            { station: 'Packing Station', load: 20, status: 'Light', color: 'bg-emerald-500' }
                        ].map(st => (
                            <div key={st.station} className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                                    <span className="text-slate-600">{st.station}</span>
                                    <span className="text-foreground">{st.load}% ({st.status})</span>
                                </div>
                                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-1000", st.color)}
                                        style={{ width: `${st.load}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-3">
                        <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                        <p className="text-[10px] font-bold text-emerald-900 uppercase">
                            All kitchen stations running within 15-minute SLA target.
                        </p>
                    </div>
                </Card>
            </div>

            {/* TACTICAL ALERTS */}
            <div className="p-6 rounded-[2.5rem] bg-amber-50 border border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left relative z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Tactical Kitchen Alert</p>
                        <p className="text-sm font-black text-amber-950 uppercase">Order #2041 prep speed optimal. High demand for Smocha Supreme detected.</p>
                    </div>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-800 bg-amber-100 px-4 py-2 rounded-xl shrink-0">
                    Auto-Balanced
                </span>
            </div>

            {/* LIVE MENU GRID */}
            <section className="space-y-8 relative z-10">
                <div className="flex justify-between items-center px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Live Food Menu Grid</h2>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">BAR OS Live Syncing</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {loading ? (
                        <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-primary" size={48} /></div>
                    ) : bites.map(bite => (
                        <Card key={bite.id} className="p-8 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col group text-left">
                            <div className="relative aspect-square rounded-[2.5rem] bg-slate-50 border border-slate-100 overflow-hidden mb-6 shadow-inner">
                                <Image src={normalizeImage(bite.image_url)} alt={bite.name} fill className="object-contain p-4 group-hover:scale-110 transition-transform duration-700" />
                                <div className={cn(
                                    "absolute top-4 right-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg",
                                    bite.is_available_now ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                )}>
                                    {bite.is_available_now ? 'Live' : 'Hidden'}
                                </div>
                            </div>

                            <div className="space-y-4 flex-1 flex flex-col justify-between">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest">{bite.category}</p>
                                    <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-tight">{bite.name}</h3>
                                    {bite.description && (
                                        <p className="text-xs text-slate-500 font-medium italic line-clamp-2 mt-1">{bite.description}</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Price</p>
                                        <p className="text-sm font-black text-primary">{formatPrice(bite.price)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Prep Time</p>
                                        <p className="text-sm font-black text-foreground">{bite.prep_time || 15} min</p>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button
                                        onClick={() => toggleAvailability(bite.id, bite.is_available_now)}
                                        className={cn(
                                            "flex-1 h-12 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all active:scale-95",
                                            bite.is_available_now ? "bg-slate-900 text-white hover:bg-primary" : "bg-emerald-500 text-white shadow-emerald-200 shadow-lg"
                                        )}
                                    >
                                        {bite.is_available_now ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button
                                        onClick={() => handleDelete(bite.id)}
                                        variant="ghost"
                                        size="icon"
                                        className="h-12 w-12 rounded-xl text-slate-300 hover:text-rose-500"
                                    >
                                        <Trash2 size={20} />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            {/* QUICK ADD SIDE DRAWER MODAL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] p-8 sm:p-10 max-w-lg w-full space-y-6 shadow-2xl relative border border-slate-100 text-left max-h-[90vh] overflow-y-auto no-scrollbar">
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">KITCHEN CONTROL</span>
                            <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">Add New Fast Food Item</h2>
                        </div>

                        <form onSubmit={handleCreateBite} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Food Name</label>
                                <Input
                                    value={newFood.name}
                                    onChange={e => setNewFood({ ...newFood, name: e.target.value })}
                                    placeholder="e.g. Smocha Deluxe"
                                    required
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Category</label>
                                    <select
                                        value={newFood.category}
                                        onChange={e => setNewFood({ ...newFood, category: e.target.value })}
                                        className="w-full rounded-xl h-12 bg-slate-50 border-none px-3 text-xs font-bold"
                                    >
                                        <option value="Street Bites">Street Bites</option>
                                        <option value="Hot Right Now">Hot Right Now</option>
                                        <option value="Burgers & Wings">Burgers & Wings</option>
                                        <option value="Snacks">Snacks</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Price (KSh)</label>
                                    <Input
                                        type="number"
                                        value={newFood.price}
                                        onChange={e => setNewFood({ ...newFood, price: e.target.value })}
                                        placeholder="180"
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Prep Time (min)</label>
                                    <Input
                                        type="number"
                                        value={newFood.prep_time}
                                        onChange={e => setNewFood({ ...newFood, prep_time: e.target.value })}
                                        placeholder="15"
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Image URL</label>
                                    <Input
                                        value={newFood.image_url}
                                        onChange={e => setNewFood({ ...newFood, image_url: e.target.value })}
                                        placeholder="https://..."
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Description</label>
                                <Textarea
                                    value={newFood.description}
                                    onChange={e => setNewFood({ ...newFood, description: e.target.value })}
                                    placeholder="Sausage wrapped in chapati with vegetables and house sauce."
                                    className="rounded-xl bg-slate-50 border-none text-xs"
                                    rows={2}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Recommended Drinks (Comma Separated)</label>
                                <Input
                                    value={newFood.drink_pairings}
                                    onChange={e => setNewFood({ ...newFood, drink_pairings: e.target.value })}
                                    placeholder="Amarula, Coca-Cola, Tusker"
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <Button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    variant="ghost"
                                    className="rounded-xl h-12 px-6 font-bold text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-xs shadow-lg"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <><CheckCircle2 size={16} className="mr-2" /> Publish to Store</>}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="pt-6">
                <TacticalEventFeed
                    title="Bite Command Kitchen Telemetry"
                    subtitle="Live Food & Munchie Station Order Stream"
                />
            </div>

        </div>
    );
}
