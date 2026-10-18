'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Truck,
    RefreshCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';

interface DeliveryOrder {
    id: number;
    created_at: string;
    customer_name: string;
    customer_phone: string;
    latitude: number | null;
    longitude: number | null;
    delivery_cost: number | null;
    status: string;
    rider_name: string | null;
    rider_phone: string | null;
}

export default function DeliveryOpsPage() {
    const [loading, setLoading] = React.useState(true);
    const [orders, setOrders] = React.useState<DeliveryOrder[]>([]);
    const [error, setError] = React.useState<string | null>(null);

    const fetchDeliveryData = React.useCallback(async () => {
        if (!supabase) {
            setError('Supabase is not configured. Delivery data is unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from('orders')
                .select('id, created_at, customer_name, customer_phone, latitude, longitude, delivery_cost, status, rider_name, rider_phone')
                .order('created_at', { ascending: false })
                .limit(50);

            if (fetchError) throw fetchError;
            setOrders((data || []) as DeliveryOrder[]);
        } catch (err) {
            console.error("Delivery fetch error:", err);
            setOrders([]);
            setError(err instanceof Error ? err.message : 'Unable to load delivery orders.');
        } finally {
            setLoading(false);
        }
    }, []);

    const awaitingRider = orders.filter(order =>
        !['Delivered', 'Cancelled'].includes(order.status) && !order.rider_name
    ).length;
    const assignedRider = orders.filter(order => Boolean(order.rider_name) && order.status !== 'Delivered').length;
    const recordedFees = orders.reduce((sum, order) => sum + Number(order.delivery_cost || 0), 0);

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
                    <p className="text-muted-foreground text-sm font-medium mt-1">Latest delivery orders and the dispatch details recorded for them.</p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={fetchDeliveryData} variant="outline" className="rounded-2xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-50">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Re-Sync Orders
                    </Button>
                </div>
            </header>

            {error && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Recent Orders</p>
                    <p className="mt-2 text-3xl font-black text-foreground">{orders.length}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Latest 50 orders</p>
                </Card>
                <Card className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Awaiting Rider</p>
                    <p className="mt-2 text-3xl font-black text-amber-600">{awaitingRider}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">No rider assigned</p>
                </Card>
                <Card className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Rider Assigned</p>
                    <p className="mt-2 text-3xl font-black text-indigo-600">{assignedRider}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Recent active orders</p>
                </Card>
                <Card className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Recorded Delivery Fees</p>
                    <p className="mt-2 text-3xl font-black text-foreground">{formatPrice(recordedFees)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Latest 50 orders</p>
                </Card>
            </div>

            <Card className="p-6 sm:p-10 rounded-[3rem] bg-white border border-slate-200/80 shadow-md space-y-6">
                <div className="border-b border-slate-100 pb-4">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Order Data</span>
                    <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-foreground">Delivery Dispatch Board</h2>
                </div>

                {loading ? (
                    <div className="py-20 text-center text-sm font-bold text-slate-400">Loading delivery orders...</div>
                ) : orders.length === 0 ? (
                    <div className="py-20 text-center text-sm font-bold text-slate-400">
                        {error ? 'Delivery orders could not be loaded.' : 'No delivery orders have been recorded yet.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    <th className="pb-4">Customer</th>
                                    <th className="pb-4">Order / Created</th>
                                    <th className="pb-4">Coordinates</th>
                                    <th className="pb-4">Rider</th>
                                    <th className="pb-4">Delivery Fee</th>
                                    <th className="pb-4 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orders.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-50/80">
                                        <td className="py-4">
                                            <p className="font-black uppercase text-foreground">{order.customer_name}</p>
                                            <p className="text-[10px] text-slate-500">{order.customer_phone}</p>
                                        </td>
                                        <td className="py-4">
                                            <p className="font-black text-primary">#{order.id}</p>
                                            <p className="text-[10px] text-slate-500">{new Date(order.created_at).toLocaleString()}</p>
                                        </td>
                                        <td className="py-4 text-slate-600">
                                            {order.latitude != null && order.longitude != null
                                                ? `${order.latitude}, ${order.longitude}`
                                                : 'Not recorded'}
                                        </td>
                                        <td className="py-4">
                                            <p className="font-bold text-foreground">{order.rider_name || 'Not assigned'}</p>
                                            {order.rider_phone && <p className="text-[10px] text-slate-500">{order.rider_phone}</p>}
                                        </td>
                                        <td className="py-4 font-bold text-foreground">
                                            {order.delivery_cost == null ? 'Not recorded' : formatPrice(Number(order.delivery_cost))}
                                        </td>
                                        <td className="py-4 text-right">
                                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[9px] font-black uppercase text-slate-700">
                                                {order.status || 'Unknown'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

        </div>
    );
}
