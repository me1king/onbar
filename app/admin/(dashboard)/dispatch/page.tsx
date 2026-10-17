'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Truck,
  RefreshCcw,
  XCircle,
  Loader2,
  Zap,
  Activity,
  Users,
  ShieldCheck,
  BatteryMedium,
  Trophy,
  Search,
  Star,
  Package,
  PackageCheck,
  CreditCard,
  Phone,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { formatPrice, cn, getPublicBaseUrl } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { useSettings } from '@/lib/useSettings';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const LiveDispatchMap = dynamic(() => import('@/components/admin/dispatch/LiveDispatchMap'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-secondary flex items-center justify-center rounded-[3rem] border border-border">
            <div className="text-center space-y-4">
                <div className="h-10 w-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Warming Satellite Uplink...</p>
            </div>
        </div>
    )
});

interface Rider {
    id: number;
    rider_name: string;
    rider_phone: string;
    lat?: number | null;
    lng?: number | null;
    vehicle_type: 'Motorbike' | 'Bike' | 'Car' | 'Van';
    vehicle_reg?: string;
    id_number?: string;
    license_number?: string;
    plate_number?: string;
    rider_photo_url?: string;
    vehicle_photo_url?: string;
    verification_status?: 'Pending' | 'Verified' | 'Rejected';
    current_location: string;
    status: 'Idle' | 'Delivering' | 'Offline' | 'Delayed' | 'Break';
    battery_level: number;
    total_deliveries: number;
    rating: number;
    area_zone: string;
    max_deliveries: number;
    weekly_salary: number;
    health_score: number;
    runner_xp: number;
    runner_level: number;
    acceptance_rate?: number;
    wallet?: { balance: number; total_earned: number };
    can_accept_orders: boolean;
    can_reject_orders: boolean;
    can_view_earnings: boolean;
}

interface DispatchRiderCandidate {
    riderPhone: string;
    riderName: string;
    status: string | null;
    activeLoad: number;
    maxDeliveries: number;
    distanceKm: number | null;
    locationAvailable: boolean;
    healthScore: number;
}

interface DispatchJob {
    id: number;
    status: string;
    customer_name: string;
    customer_email?: string | null;
    payment_method: string;
    payment_verified_at: string;
    total_price: number | string;
    fulfillment: {
        ready: boolean;
        reasons: string[];
        selectedVendorIds: string[];
        selectedVendorNames: string[];
        selectedVendorLocations: Array<{
            vendorId: string;
            vendorName: string;
            latitude: number;
            longitude: number;
        }>;
        priceBasis: string;
        productChecks: Array<{
            productId: number | null;
            productName: string;
            quantity: number;
            reservedQuantity: number;
            orderUnitPrice: number | null;
            cataloguePrice: number | null;
            priceMatchesCatalogue: boolean;
            reserved: boolean;
        }>;
    };
    riderCandidates: DispatchRiderCandidate[];
    recommendedRider: DispatchRiderCandidate | null;
    riderAvailabilityReason: string | null;
}

const WAREHOUSES = [
    { id: 'all', name: 'Global Network', city: 'All' },
    { id: 'nairobi', name: 'Nairobi Central Hub', city: 'Nairobi' },
    { id: 'mombasa', name: 'Mombasa Port Node', city: 'Mombasa'    },
    { id: 'kisumu', name: 'Kisumu Bar Base', city: 'Kisumu' }
];

export default function AdminDispatchPage() {
    const { role, permissions } = useAdmin();
    const { settings } = useSettings();
    const [riders, setRiders] = useState<Rider[]>([]);
    const [orders, setOrders] = useState<DispatchJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
    const [demandZones, setDemandZones] = useState<{ lat: number, lng: number, intensity: number }[]>([]);
    const [assigning, setAssigning] = useState<number | null>(null);
    const [retryingAllocation, setRetryingAllocation] = useState<number | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [overrideRiders, setOverrideRiders] = useState<Record<number, string>>({});
    const [overrideReasons, setOverrideReasons] = useState<Record<number, string>>({});
    const [recentDecisions, setRecentDecisions] = useState<Array<{
        id: number;
        order_id: number;
        selected_rider_name: string;
        decision_type: string;
        chosen_by: string;
        override_reason: string | null;
        created_at: string;
    }>>([]);
    const [unverifiedPaymentCount, setUnverifiedPaymentCount] = useState(0);

    const [showHeatmap, setShowHeatmap] = useState(false);
    const [selectedWarehouse, setSelectedWarehouse] = useState('all');

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const dispatchRes = await fetch('/api/admin/dispatch', { cache: 'no-store' });
            const dispatchData = await dispatchRes.json() as {
                error?: string;
                jobs?: DispatchJob[];
                decisions?: typeof recentDecisions;
                unverifiedPaymentCount?: number;
                riders?: Rider[];
                demandZones?: { lat: number; lng: number; intensity: number }[];
                demandZonesError?: string | null;
            };
            if (!dispatchRes.ok) throw new Error(dispatchData.error || 'Dispatch assignments are unavailable.');

            setRiders(dispatchData.riders || []);
            setOrders(dispatchData.jobs || []);
            setRecentDecisions(dispatchData.decisions || []);
            setUnverifiedPaymentCount(dispatchData.unverifiedPaymentCount || 0);
            setDemandZones(dispatchData.demandZones || []);
            if (dispatchData.demandZonesError) {
                setMessage({ type: 'error', text: dispatchData.demandZonesError });
            }
        } catch (err) {
            console.error("Pipeline link unstable.", err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Dispatch data could not be refreshed.' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const stats = React.useMemo(() => {
        const total = riders.length;
        const active = riders.filter(r => r.status !== 'Offline').length;
        const delivering = riders.filter(r => r.status === 'Delivering').length;
        const standby = riders.filter(r => r.status === 'Idle').length;

        const avgHealth = total > 0
            ? Math.round(riders.reduce((sum, r) => sum + (r.health_score || 100), 0) / total)
            : 100;

        return { total, active, delivering, standby, avgHealth };
    }, [riders]);

    const filteredRiders = riders.filter(r =>
        r.rider_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.area_zone.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAssignRider = React.useCallback(async (
        orderId: number,
        riderPhone: string,
        mode: 'automatic' | 'override'
    ) => {
        setAssigning(orderId);
        try {
            const response = await fetch('/api/admin/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    mode,
                    riderPhone: mode === 'override' ? riderPhone : undefined,
                    reason: mode === 'override' ? overrideReasons[orderId] : undefined
                })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Dispatch assignment failed.');

            const targetOrder = orders.find(o => o.id === orderId);
            let notificationFailed = false;
            if (targetOrder?.customer_email) {
                try {
                    const notificationResponse = await fetch('/api/admin/notify-customer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: targetOrder.customer_email,
                            orderId,
                            status: 'Dispatched',
                            name: targetOrder.customer_name
                        })
                    });
                    if (!notificationResponse.ok) {
                        notificationFailed = true;
                        console.error('Rider was assigned, but the customer notification failed.', await notificationResponse.text());
                    }
                } catch (notificationError) {
                    notificationFailed = true;
                    console.error('Rider was assigned, but the customer notification request failed.', notificationError);
                }
            }

            await fetchData();
            setMessage({
                type: notificationFailed ? 'error' : 'success',
                text: notificationFailed
                    ? 'Rider assignment was saved, but the customer notification failed.'
                    : 'Rider assignment saved and recorded.'
            });
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            console.error("Dispatch sequence failed.", err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Dispatch sequence failed.' });
            setTimeout(() => setMessage(null), 5000);
        } finally {
            setAssigning(null);
        }
    }, [orders, overrideReasons, fetchData]);

    const retryMerchantAllocation = React.useCallback(async (orderId: number) => {
        setRetryingAllocation(orderId);
        setMessage(null);
        try {
            const response = await fetch('/api/admin/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, operation: 'retry_merchant_allocation' })
            });
            const result = await response.json() as {
                error?: string;
                message?: string;
                allocation?: {
                    fully_allocated?: boolean;
                    unallocated_items?: Array<{ product_name: string; requested_quantity: number; allocated_quantity: number }>;
                };
            };
            if (!response.ok) throw new Error(result.error || 'Merchant stock could not be redistributed.');
            const remaining = result.allocation?.unallocated_items || [];
            const remainingText = remaining.length
                ? ` Still needed: ${remaining.map(item => `${item.product_name} ${item.allocated_quantity}/${item.requested_quantity}`).join(', ')}.`
                : '';
            setMessage({
                type: result.allocation?.fully_allocated ? 'success' : 'error',
                text: `${result.message || 'Merchant availability rechecked.'}${remainingText}`
            });
            await fetchData();
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Merchant stock could not be redistributed.' });
        } finally {
            setRetryingAllocation(null);
        }
    }, [fetchData]);

    const handleVerifyRider = React.useCallback(async (phone: string) => {
        try {
            const response = await fetch('/api/admin/dispatch/riders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const result = await response.json() as { pin?: string; error?: string };
            if (!response.ok) throw new Error(result.error || 'Rider authorization failed.');
            if (!result.pin) throw new Error('Rider authorization completed without issuing a PIN.');
            setRiders(prev => prev.map(r => r.rider_phone === phone ? { ...r, verification_status: 'Verified' } : r));
            setMessage({ type: 'success', text: `Unit Authorized. Issued PIN: ${result.pin}.` });
            setTimeout(() => setMessage(null), 10000);
        } catch (err) {
            console.error('Rider authorization failed:', err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Rider authorization failed.' });
        }
    }, []);

    return (
        <div className="p-8 space-y-8 bg-background min-h-screen text-left">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-border pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Bar Dispatch Active</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter">Runner Dispatch</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Real-time runner deployment and delivery coordination hub.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex overflow-x-auto no-scrollbar max-w-sm sm:max-w-none mr-2">
                        {WAREHOUSES.map(w => (
                            <button
                                key={w.id}
                                onClick={() => setSelectedWarehouse(w.id)}
                                className={cn(
                                    "px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0",
                                    selectedWarehouse === w.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:text-foreground"
                                )}
                            >
                                {w.name.split(' ')[0]}
                            </button>
                        ))}
                    </div>
                    <Button
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        variant="outline"
                        className={cn(
                            "rounded-xl h-12 px-6 border-border font-black uppercase text-[10px] tracking-widest transition-all active:scale-95",
                            showHeatmap ? "bg-amber-500 text-white border-amber-500" : "bg-card text-foreground"
                        )}
                    >
                        <Zap className="h-4 w-4 mr-2" /> Demand Heatmap {showHeatmap ? 'On' : 'Off'}
                    </Button>
                    <Link href="/rider/dashboard">
                        <Button variant="outline" className="rounded-xl h-12 px-6 border-primary/20 bg-primary text-white font-black uppercase text-[10px] tracking-widest hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20">
                            <Truck className="h-4 w-4 mr-2" /> Runner View
                        </Button>
                    </Link>
                    <Button onClick={fetchData} variant="outline" className="rounded-xl h-12 px-6 border-border bg-card text-foreground font-black uppercase text-[10px] tracking-widest transition-all hover:shadow-lg active:scale-95">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Sync System
                    </Button>
                </div>
            </header>

            {message && (
                <div className={cn(
                    "p-4 rounded-[1.5rem] border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
                    message.type === 'success' ? "bg-primary/10 border-primary/20 text-primary" : "bg-rose-50 border-rose-100 text-rose-600"
                )}>
                    <Zap className="h-5 w-5" />
                    <p className="text-xs font-black uppercase tracking-widest">{message.text}</p>
                </div>
            )}

            {/* Top Stats HUD */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
                {[
                    { label: 'Runner Team', val: stats.total, icon: Users },
                    { label: 'Active', val: stats.active, icon: Activity },
                    { label: 'Delivering', val: stats.delivering, icon: Truck },
                    { label: 'Standby', val: stats.standby, icon: Zap },
                    { label: 'Team Health', val: `${stats.avgHealth}%`, icon: ShieldCheck },
                ].map((item) => (
                    <Card key={item.label} className="p-6 rounded-3xl border border-border bg-card shadow-sm flex items-center gap-4 group hover:shadow-xl transition-all h-full">
                        <div className="h-12 w-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary transition-transform group-hover:scale-110">
                            <item.icon className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">{item.label}</p>
                            <h3 className="text-xl font-black text-foreground tracking-tighter uppercase">{item.val}</h3>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-10">
                    <p className="text-xs text-muted-foreground">
                        Demand is grouped from paid/delivered orders with saved delivery pins, not live visitor tracking. Each cluster is approximate.
                    </p>
                    <div className="h-[55vh] min-h-[320px] max-h-[650px] w-full relative">
                        <LiveDispatchMap
                            riders={riders}
                            demandZones={demandZones}
                            showDemand={showHeatmap}
                            onSelectRider={(r) => setSelectedRider(r as Rider)}
                        />
                    </div>

                    <section className="space-y-6">
                        <div className="flex items-center justify-between px-2 text-left">
                            <div className="flex items-center gap-3">
                                <Zap className="h-6 w-6 text-primary animate-pulse" />
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Payment-confirmed Dispatch Queue</h2>
                            </div>
                        </div>
                        <p className="px-2 text-xs text-muted-foreground">
                            Pickup distance uses fresh rider GPS and straight-line distances between selected merchant locations; it is not a road-route or ETA calculation.
                        </p>

                        {unverifiedPaymentCount > 0 && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                {unverifiedPaymentCount} paid order(s) do not have a matching server-verified Paystack record and remain unassigned.
                            </p>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            {orders.length === 0 ? (
                                <div className="p-16 text-center bg-card rounded-[3rem] border-2 border-dashed border-border flex flex-col items-center gap-4">
                                    <PackageCheck className="h-12 w-12 text-muted" />
                                    <p className="text-sm font-black text-muted-foreground uppercase italic">No eligible confirmed-payment orders.</p>
                                </div>
                            ) : orders.map(order => {
                                const recommendation = order.recommendedRider;
                                return (
                                    <Card key={order.id} className="p-7 rounded-[2rem] border border-border bg-card shadow-sm space-y-6">
                                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 text-left">
                                            <div>
                                                <h3 className="font-black text-foreground uppercase text-lg tracking-tighter">Order #{order.id}</h3>
                                                <p className="text-xs text-muted-foreground mt-1">{order.customer_name} · {formatPrice(Number(order.total_price))}</p>
                                                <p className="text-[10px] text-emerald-700 font-bold uppercase mt-2">Payment confirmed · {order.payment_method}</p>
                                            </div>
                                            {recommendation ? (
                                                <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-sm">
                                                    <p className="text-[9px] font-black uppercase text-primary">Approx. straight-line pickup path · {recommendation.distanceKm} km</p>
                                                    <p className="font-bold text-foreground">{recommendation.riderName} · {recommendation.activeLoad}/{recommendation.maxDeliveries} active</p>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-amber-700 font-semibold">{order.riderAvailabilityReason || 'No rider recommendation available.'}</p>
                                            )}
                                        </div>

                                        <div className={`rounded-xl border p-4 text-left ${order.fulfillment.ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                                            <p className="text-xs font-black uppercase">{order.fulfillment.ready ? 'Vendor fulfillment verified' : 'Vendor fulfillment has gaps'}</p>
                                            <ul className="mt-2 space-y-1 text-xs">
                                                {order.fulfillment.reasons.length > 0
                                                    ? order.fulfillment.reasons.map((reason, index) => <li key={index}>• {reason}</li>)
                                                    : <li>Product, reserved quantity, availability, price and delivery radius verified.</li>}
                                            </ul>
                                            {order.fulfillment.selectedVendorNames.length > 0 && (
                                                <p className="mt-2 text-xs">Existing merchant allocations: {order.fulfillment.selectedVendorNames.join(', ')}</p>
                                            )}
                                            {order.fulfillment.selectedVendorLocations.map(vendor => (
                                                <p key={vendor.vendorId} className="mt-1 text-xs">
                                                    Pickup: {vendor.vendorName} · {vendor.latitude.toFixed(5)}, {vendor.longitude.toFixed(5)}
                                                </p>
                                            ))}
                                            <div className="mt-3 space-y-1 text-xs">
                                                {order.fulfillment.productChecks.map((check, index) => (
                                                    <p key={`${check.productId}-${index}`}>
                                                        {check.productName}: qty {check.quantity}, reserved {check.reservedQuantity}, order/catalogue price {check.orderUnitPrice === null ? 'unavailable' : formatPrice(check.orderUnitPrice)}/{check.cataloguePrice === null ? 'unavailable' : formatPrice(check.cataloguePrice)}
                                                    </p>
                                                ))}
                                            </div>
                                            <p className="mt-2 text-[11px] opacity-80">{order.fulfillment.priceBasis}</p>
                                        </div>

                                        <div className="flex flex-col md:flex-row gap-3">
                                            {!order.fulfillment.ready && order.fulfillment.productChecks.some(check => check.reservedQuantity < check.quantity) && (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => void retryMerchantAllocation(order.id)}
                                                    disabled={retryingAllocation === order.id || assigning === order.id}
                                                    className="h-12 rounded-xl border-amber-300 px-5 text-[10px] font-black uppercase tracking-widest text-amber-800"
                                                >
                                                    {retryingAllocation === order.id
                                                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking shops</>
                                                        : 'Retry available shops'}
                                                </Button>
                                            )}
                                            <Button
                                                onClick={() => handleAssignRider(order.id, recommendation?.riderPhone || '', 'automatic')}
                                                disabled={!order.fulfillment.ready || !recommendation || assigning === order.id}
                                                className="h-12 px-6 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
                                            >
                                                {assigning === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign recommended rider'}
                                            </Button>
                                            <div className="flex-1 grid sm:grid-cols-2 gap-2">
                                                <p className="text-xs text-muted-foreground sm:col-span-2">
                                                    Rider override changes only the rider. It cannot bypass confirmed payment or unverified merchant fulfillment.
                                                </p>
                                                <select
                                                    value={overrideRiders[order.id] || ''}
                                                    onChange={event => setOverrideRiders(prev => ({ ...prev, [order.id]: event.target.value }))}
                                                    className="h-12 rounded-xl border border-border bg-background px-3 text-sm"
                                                >
                                                    <option value="">Choose rider for override</option>
                                                    {order.riderCandidates.map(candidate => (
                                                        <option key={candidate.riderPhone} value={candidate.riderPhone}>
                                                            {candidate.riderName} · {candidate.activeLoad}/{candidate.maxDeliveries} active
                                                            {candidate.locationAvailable ? ` · ${candidate.distanceKm} km straight-line` : ' · location unknown'}
                                                        </option>
                                                    ))}
                                                </select>
                                                <Input
                                                    value={overrideReasons[order.id] || ''}
                                                    onChange={event => setOverrideReasons(prev => ({ ...prev, [order.id]: event.target.value }))}
                                                    placeholder="Override reason (required)"
                                                    className="h-12 rounded-xl"
                                                />
                                            </div>
                                            <Button
                                                onClick={() => handleAssignRider(order.id, overrideRiders[order.id] || '', 'override')}
                                                disabled={!order.fulfillment.ready || !overrideRiders[order.id] || (overrideReasons[order.id] || '').trim().length < 8 || assigning === order.id}
                                                variant="outline"
                                                className="h-12 px-6 rounded-xl border-amber-300 text-amber-800 font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
                                            >
                                                Override & assign
                                            </Button>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </section>

                    <section className="space-y-4 text-left">
                        <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Recent assignment decisions</h2>
                        {recentDecisions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No dispatch decisions recorded yet.</p>
                        ) : recentDecisions.slice(0, 8).map(decision => (
                            <div key={decision.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-bold">Order #{decision.order_id} → {decision.selected_rider_name}</span>
                                    <span className="text-xs text-muted-foreground">{new Date(decision.created_at).toLocaleString()}</span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {decision.decision_type === 'admin_override' ? `Override by ${decision.chosen_by}: ${decision.override_reason}` : `Recommended assignment by ${decision.chosen_by}`}
                                </p>
                            </div>
                        ))}
                    </section>

                    <div className="space-y-6 text-left">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Unit Inventory</h2>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search Rider..."
                                    className="h-12 rounded-2xl bg-card border-border pl-12 text-[10px] font-black uppercase tracking-widest w-72 shadow-sm focus:ring-4 focus:ring-primary/5"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {filteredRiders.map(rider => (
                                <Card
                                    key={rider.id}
                                    onClick={() => setSelectedRider(rider)}
                                    className={cn(
                                        "p-8 rounded-[2.5rem] bg-card border border-border shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all cursor-pointer",
                                        rider.status === 'Offline' && "opacity-60"
                                    )}
                                >
                                    {rider.verification_status === 'Pending' && (
                                        <div className="absolute top-0 right-0 left-0 bg-primary/10 py-2 text-center border-b border-primary/20 animate-pulse">
                                            <span className="text-[7px] font-black uppercase text-primary tracking-widest">Awaiting Verification</span>
                                        </div>
                                    )}
                                    <div className="relative z-10 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-4">
                                                <div className="h-14 w-14 rounded-2xl bg-secondary border border-border flex items-center justify-center text-foreground text-xl font-black shadow-sm group-hover:scale-105 transition-transform">
                                                    {rider.rider_name.substring(0, 2)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-black text-foreground uppercase text-base tracking-tight truncate">{rider.rider_name}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{rider.status}</p>
                                                        <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                        <span className="text-[9px] font-black text-primary uppercase tracking-tighter">Lvl {rider.runner_level || 1}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border bg-primary/5 text-primary border-primary/10">
                                                {rider.health_score}% Health
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 py-6 border-y border-border">
                                            <div className="space-y-1">
                                                <p className="text-[8px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><BatteryMedium className="h-2.5 w-2.5 text-primary" /> Battery</p>
                                                <p className="text-xl font-black text-foreground">{rider.battery_level}%</p>
                                            </div>
                                            <div className="space-y-1 text-right">
                                                <p className="text-[8px] font-black uppercase text-muted-foreground flex items-center justify-end gap-1.5"><Star className="h-2.5 w-2.5 text-primary fill-current" /> Rating</p>
                                                <p className="text-xl font-black text-foreground">{rider.rating}</p>
                                            </div>
                                        </div>

                                        {rider.verification_status === 'Pending' && (
                                            <Button
                                                onClick={(e) => { e.stopPropagation(); handleVerifyRider(rider.rider_phone); }}
                                                className="w-full h-10 rounded-xl bg-primary text-white font-black uppercase text-[8px] tracking-widest shadow-lg shadow-primary/20"
                                            >
                                                Approve Unit
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4">
                    <Card className="p-8 rounded-[3.5rem] border border-border bg-card shadow-sm space-y-8">
                        <div className="flex items-center gap-3">
                            <Trophy className="h-6 w-6 text-amber-500" />
                            <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Delivery Legends</h3>
                        </div>
                        <div className="space-y-6">
                            {riders.sort((a, b) => b.total_deliveries - a.total_deliveries).slice(0, 3).map((rider, i) => (
                                <div key={rider.id} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border group hover:bg-white hover:shadow-xl transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white font-black text-xs">
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black uppercase text-foreground">{rider.rider_name}</p>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase">{rider.area_zone}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-primary">{rider.total_deliveries}</p>
                                        <p className="text-[7px] font-black uppercase text-slate-300">Deliveries</p>
                                    </div>
                                </div>
                            ))}
                            {riders.length === 0 && (
                                <p className="text-[10px] font-black text-slate-400 uppercase italic text-center">Awaiting competition data...</p>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Mission Intel Sidebar */}
            {selectedRider && (
                <div
                    className="fixed inset-0 z-[200] flex justify-end bg-background/20 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setSelectedRider(null)}
                >
                    <aside
                        className="w-[450px] h-full bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto no-scrollbar"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-10 space-y-10 text-left">
                            <header className="flex justify-between items-start">
                                <div className="flex items-center gap-6">
                                    <div className="h-20 w-20 rounded-[2rem] bg-secondary border border-border flex items-center justify-center text-foreground text-2xl font-black relative">
                                        {selectedRider.rider_name.substring(0, 2).toUpperCase()}
                                        <div className={cn(
                                            "absolute -top-1 -right-1 h-6 w-6 rounded-full border-4 border-card",
                                            selectedRider.status === 'Offline' ? "bg-slate-300" : "bg-emerald-500 animate-pulse"
                                        )} />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none">{selectedRider.rider_name}</h2>
                                        <div className="flex items-center gap-3 mt-2">
                                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Status: {selectedRider.status}</p>
                                            <div className="h-1 w-1 rounded-full bg-slate-200" />
                                            <span className="px-2 py-0.5 rounded-md bg-primary text-white text-[8px] font-black uppercase">Level {selectedRider.runner_level || 1}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedRider(null)} className="h-10 w-10 rounded-xl hover:bg-secondary flex items-center justify-center text-muted transition-colors border border-border"><XCircle className="h-6 w-6" /></button>
                            </header>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-6 rounded-3xl bg-secondary border border-border space-y-2">
                                    <p className="text-[8px] font-black text-muted-foreground uppercase flex items-center gap-2"><CreditCard className="h-3 w-3" /> Balance</p>
                                    <p className="text-xl font-black text-foreground">{formatPrice(selectedRider.wallet?.balance || 0)}</p>
                                </div>
                                <div className="p-6 rounded-3xl bg-secondary border border-border space-y-2">
                                    <p className="text-[8px] font-black text-muted-foreground uppercase flex items-center gap-2"><Trophy className="h-3 w-3" /> Lifetime</p>
                                    <p className="text-xl font-black text-foreground">{formatPrice(selectedRider.wallet?.total_earned || 0)}</p>
                                </div>
                            </div>

                            {/* Verification Data (Owner/Sensitive Only) */}
                            {(role === 'owner' || permissions.can_view_sensitive_rider_data) && (
                                <div className="space-y-6">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground ml-2">Verification Intel</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-5 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-1">
                                            <p className="text-[8px] font-black text-slate-400 uppercase">ID Number</p>
                                            <p className="text-sm font-black text-foreground">{selectedRider.id_number || 'NOT LOGGED'}</p>
                                        </div>
                                        <div className="p-5 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-1">
                                            <p className="text-[8px] font-black text-slate-400 uppercase">License No.</p>
                                            <p className="text-sm font-black text-foreground">{selectedRider.license_number || 'NOT LOGGED'}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <p className="text-[8px] font-black text-slate-400 uppercase ml-2">Rider Selfie</p>
                                            <div className="h-40 rounded-[2rem] bg-slate-100 border border-slate-200 overflow-hidden relative group/img">
                                                {selectedRider.rider_photo_url ? (
                                                    <Image src={selectedRider.rider_photo_url} fill className="w-full h-full object-cover transition-transform group-hover/img:scale-110" alt="" />
                                                ) : <div className="w-full h-full flex items-center justify-center text-slate-300"><User size={24} /></div>}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[8px] font-black text-slate-400 uppercase ml-2">Vehicle Log</p>
                                            <div className="h-40 rounded-[2rem] bg-slate-100 border border-slate-200 overflow-hidden relative group/img">
                                                {selectedRider.vehicle_photo_url ? (
                                                    <Image src={selectedRider.vehicle_photo_url} fill className="w-full h-full object-cover transition-transform group-hover/img:scale-110" alt="" />
                                                ) : <div className="w-full h-full flex items-center justify-center text-slate-300"><Truck size={24} /></div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedRider.status === 'Delivering' && (
                                <div className="p-8 rounded-[2.5rem] bg-primary/5 border-2 border-primary/20 space-y-8 relative overflow-hidden">
                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white"><Package className="h-5 w-5" /></div>
                                            <h3 className="text-lg font-black uppercase text-foreground">Mission Live</h3>
                                        </div>
                                        <span className="px-3 py-1 bg-primary text-white text-[8px] font-black rounded-full animate-pulse uppercase">Tactical Pursuit</span>
                                    </div>

                                    <div className="space-y-6 relative z-10">
                                        <div className="flex justify-between items-center pb-4 border-b border-primary/10">
                                            <span className="text-[10px] font-black uppercase text-muted-foreground">Active Order</span>
                                            <span className="text-xs font-black text-foreground">#10492</span>
                                        </div>
                                        <div className="flex justify-between items-center pb-4 border-b border-primary/10">
                                            <span className="text-[10px] font-black uppercase text-muted-foreground">Payload</span>
                                            <span className="text-xs font-bold text-foreground truncate max-w-[150px]">AMAYA AM-05 + 1 Other</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black uppercase text-muted-foreground">ETA to Delivery</span>
                                            <span className="text-sm font-black text-primary uppercase">12 Minutes</span>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={() => {
                                            // Real-time redirection to maps if coordinates exist
                                            window.open(`https://www.google.com/maps/search/?api=1&query=${selectedRider.current_location || 'Nairobi'}`, '_blank');
                                        }}
                                        className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest relative z-10 shadow-xl shadow-primary/20"
                                    >
                                        View Delivery Path
                                    </Button>

                                    <Zap className="absolute -bottom-10 -right-10 h-48 w-48 text-primary/5 rotate-12" />
                                </div>
                            )}

                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground ml-2">Communications</h3>
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        onClick={() => window.open(`tel:${selectedRider.rider_phone}`, '_self')}
                                        variant="outline"
                                        className="flex-1 h-14 rounded-2xl border-border text-foreground font-black uppercase text-[10px] hover:bg-secondary transition-all"
                                    >
                                        <Phone className="h-4 w-4 mr-2" /> Call Unit
                                    </Button>
                                    <Button
                                        onClick={() => window.open(`https://wa.me/${selectedRider.rider_phone}`, '_blank')}
                                        className="flex-1 h-14 rounded-2xl bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-100 active:scale-95 transition-all"
                                    >
                                        WhatsApp
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-8 border-t border-border flex flex-col gap-4">
                                <Button
                                    onClick={() => {
                                        const baseUrl = getPublicBaseUrl();
                                        const link = `${baseUrl}/rider/dashboard?phone=${selectedRider.rider_phone}`;
                                        navigator.clipboard.writeText(link);
                                        setMessage({ type: 'success', text: "Magic Link Copied!" });
                                        setTimeout(() => setMessage(null), 3000);
                                    }}
                                    variant="outline"
                                    className="w-full h-14 rounded-2xl border-indigo-200 text-indigo-600 font-black uppercase text-[10px] tracking-widest hover:bg-indigo-50 transition-all"
                                >
                                    Copy Runner Access Link
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => window.open(`https://wa.me/${settings.contact.whatsapp}?text=Retire runner: ${selectedRider.rider_name}`, '_blank')}
                                    className="w-full h-14 rounded-2xl border-rose-100 text-rose-400 font-black uppercase text-[10px] hover:bg-rose-50 transition-all"
                                >
                                    Retire Runner
                                </Button>
                            </div>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}
