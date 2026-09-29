'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Truck,
    MapPin,
    Calendar,
    DollarSign,
    RefreshCcw,
    Loader2,
    CheckCircle2,
    Clock,
    AlertCircle,
    Navigation,
    Route,
    Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';

interface DeliveryRecord {
    id: string;
    customer_name: string;
    area: string;
    distance_km: number;
    order_id: string;
    method: 'Delivery' | 'Collection';
    status: 'Ready' | 'Assigned' | 'Pending' | 'Delivered';
    zone: 'ZONE A' | 'ZONE B' | 'ZONE C' | 'ZONE D';
    estimated_cost: number;
    delivery_fee: number;
    margin: number;
}

const SAMPLE_DELIVERIES: DeliveryRecord[] = [
    {
        id: 'del-101',
        customer_name: 'David Maganga',
        area: 'Westlands Sector',
        distance_km: 4.2,
        order_id: '#B-1042',
        method: 'Delivery',
        status: 'Ready',
        zone: 'ZONE A',
        estimated_cost: 150,
        delivery_fee: 250,
        margin: 100
    },
    {
        id: 'del-102',
        customer_name: 'Sarah K.',
        area: 'Kilimani Base',
        distance_km: 12.4,
        order_id: '#B-1043',
        method: 'Delivery',
        status: 'Assigned',
        zone: 'ZONE B',
        estimated_cost: 320,
        delivery_fee: 450,
        margin: 130
    },
    {
        id: 'del-103',
        customer_name: 'Kelvin M.',
        area: 'Karen Estate',
        distance_km: 26.1,
        order_id: '#B-1044',
        method: 'Delivery',
        status: 'Pending',
        zone: 'ZONE C',
        estimated_cost: 580,
        delivery_fee: 750,
        margin: 170
    }
];

export default function DeliveryOpsPage() {
    const [loading, setLoading] = React.useState(true);
    const [deliveries, setDeliveries] = React.useState<DeliveryRecord[]>(SAMPLE_DELIVERIES);
    const [hud, setHud] = React.useState({
        todayDeliveries: 12,
        collections: 4,
        pendingAssignment: 3,
        longDistance: 2,
        requiresAttention: 1
    });

    const fetchDeliveryData = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data: ordersData } = await supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (ordersData && ordersData.length > 0) {
                const mapped: DeliveryRecord[] = ordersData.map((ord, idx) => {
                    const dist = Number((3.5 + idx * 4.2).toFixed(1));
                    const zone = dist <= 10 ? 'ZONE A' : dist <= 20 ? 'ZONE B' : dist <= 30 ? 'ZONE C' : 'ZONE D';
                    const fee = Number(ord.delivery_cost) || (dist <= 10 ? 250 : dist <= 20 ? 450 : 750);
                    const cost = Math.round(fee * 0.65);

                    return {
                        id: `del-${ord.id}`,
                        customer_name: ord.customer_name || 'Patron',
                        area: ord.delivery_address || (dist <= 10 ? 'CBD / Westlands' : 'Outlying Sector'),
                        distance_km: dist,
                        order_id: `#B-${ord.id}`,
                        method: 'Delivery',
                        status: ord.status === 'Dispatched' ? 'Assigned' : ord.status === 'Delivered' ? 'Delivered' : 'Pending',
                        zone,
                        estimated_cost: cost,
                        delivery_fee: fee,
                        margin: fee - cost
                    };
                });

                setDeliveries(mapped);
                setHud({
                    todayDeliveries: mapped.length,
                    collections: 2,
                    pendingAssignment: mapped.filter(m => m.status === 'Pending').length,
                    longDistance: mapped.filter(m => m.distance_km > 20).length,
                    requiresAttention: mapped.filter(m => m.status === 'Pending').length > 0 ? 1 : 0
                });
            }
        } catch (err) {
            console.error("Delivery fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchDeliveryData();
    }, [fetchDeliveryData]);

    return (
        <div className="p-4 sm:p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">

            {/* HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Truck className="h-5 w-5 text-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">ONLINE BAR OPERATIONS OS 4.0</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Delivery <span className="text-primary">Ops Command.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Maintaining 20-minute grid integrity. Distance calculation, route planning, and transport economics.</p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={fetchDeliveryData} variant="outline" className="rounded-2xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-50">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Re-Sync Routes
                    </Button>
                </div>
            </header>

            {/* 1. TODAY'S DELIVERY HUD CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Today&apos;s Deliveries</p>
                    <p className="text-3xl font-black text-foreground">{hud.todayDeliveries}</p>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Grid Active</span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Collections</p>
                    <p className="text-3xl font-black text-foreground">{hud.collections}</p>
                    <span className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Hub Pickups</span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Pending Assignment</p>
                    <p className="text-3xl font-black text-amber-600">{hud.pendingAssignment}</p>
                    <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Rider Queue</span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Long Distance</p>
                    <p className="text-3xl font-black text-indigo-600">{hud.longDistance}</p>
                    <span className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">&gt; 20 km</span>
                </Card>

                <Card className="p-6 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-sm space-y-1 col-span-2 md:col-span-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Attention Required</p>
                    <p className="text-3xl font-black text-rose-500">{hud.requiresAttention}</p>
                    <span className="text-[8px] font-black uppercase text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">Needs Rider</span>
                </Card>
            </div>

            {/* 2. LIVE DELIVERY DISPATCH BOARD */}
            <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Real-Time Dispatch Matrix</span>
                        <h3 className="text-2xl font-black uppercase tracking-tight text-foreground mt-1">Live Delivery Board</h3>
                    </div>
                    <span className="text-xs font-black text-primary uppercase bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                        20-Min SLA Active
                    </span>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left font-mono text-xs">
                        <thead>
                            <tr className="border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                <th className="pb-4">Customer</th>
                                <th className="pb-4">Area Sector</th>
                                <th className="pb-4">Zone</th>
                                <th className="pb-4">Distance</th>
                                <th className="pb-4">Order ID</th>
                                <th className="pb-4">Transport Fee</th>
                                <th className="pb-4">Margin</th>
                                <th className="pb-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                            {deliveries.map(d => (
                                <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-4 font-black uppercase text-foreground">{d.customer_name}</td>
                                    <td className="py-4 text-slate-500 font-bold">{d.area}</td>
                                    <td className="py-4">
                                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            {d.zone}
                                        </span>
                                    </td>
                                    <td className="py-4 font-black text-foreground">{d.distance_km} km</td>
                                    <td className="py-4 font-black text-primary">{d.order_id}</td>
                                    <td className="py-4 font-bold text-foreground">{formatPrice(d.delivery_fee)}</td>
                                    <td className="py-4 font-black text-emerald-600">+{formatPrice(d.margin)}</td>
                                    <td className="py-4 text-right">
                                        <span className={cn(
                                            "px-3 py-1 rounded-full text-[9px] font-black uppercase border",
                                            d.status === 'Ready' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                            d.status === 'Assigned' ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                                            d.status === 'Delivered' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            "bg-rose-50 text-rose-600 border-rose-200"
                                        )}>
                                            {d.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* 3. WEEKLY ROUTE PLANNER & ZONES MATRIX */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
                {/* Weekly Operations Route Planner */}
                <Card className="lg:col-span-7 p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <Route className="h-6 w-6 text-primary" />
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Weekly Route Planner</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Automated Sector Groupings</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                            { day: 'MONDAY', area: 'Westlands & Parklands Sector', count: '5 Deliveries Scheduled' },
                            { day: 'TUESDAY', area: 'Kilimani & Lavington Hub', count: '7 Deliveries Scheduled' },
                            { day: 'WEDNESDAY', area: 'CBD & Upper Hill Zone', count: '3 Deliveries Scheduled' },
                            { day: 'THURSDAY', area: 'Karen & Langata Sector', count: '8 Deliveries Scheduled' },
                        ].map((r, i) => (
                            <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                <span className="text-[9px] font-black text-primary uppercase bg-white px-2 py-0.5 rounded border border-slate-200">{r.day}</span>
                                <p className="text-xs font-black uppercase text-foreground pt-1">{r.area}</p>
                                <p className="text-[10px] font-bold text-emerald-600 uppercase">{r.count}</p>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Delivery Zones Boundaries */}
                <Card className="lg:col-span-5 p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <MapPin className="h-6 w-6 text-indigo-600" />
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Delivery Zones</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Configurable Distance Boundaries</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {[
                            { zone: 'ZONE A (0 - 10 km)', fee: 'KSh 250', desc: 'Central Nairobi CBD & Environs' },
                            { zone: 'ZONE B (10 - 20 km)', fee: 'KSh 450', desc: 'Suburban Radial Ring' },
                            { zone: 'ZONE C (20 - 30 km)', fee: 'KSh 750', desc: 'Outlying Metro Ring' },
                            { zone: 'ZONE D (30+ km)', fee: 'Custom Rate', desc: 'Long Distance Dispatch Node' },
                        ].map((z, i) => (
                            <div key={i} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                                <div>
                                    <p className="font-black text-foreground uppercase">{z.zone}</p>
                                    <p className="text-[10px] text-slate-400 font-bold">{z.desc}</p>
                                </div>
                                <span className="text-xs font-black text-primary">{z.fee}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

        </div>
    );
}
