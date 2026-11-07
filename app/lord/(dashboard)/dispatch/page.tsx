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
import { copyTextToClipboard, getKenyanWhatsAppNumber } from '@/lib/riderContact';
import { formatBatteryTelemetry } from '@/lib/riderTelemetry';
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
    battery_level: number | null;
    battery_updated_at?: string | null;
    total_deliveries: number;
    rating: number;
    area_zone: string;
    max_deliveries: number;
    weekly_salary: number;
    health_score: number | null;
    runner_xp: number;
    runner_level: number;
    acceptance_rate?: number;
    activeOrders: Array<{
        id: number;
        status: string;
        customer_name: string;
        latitude: number | null;
        longitude: number | null;
        created_at: string;
    }>;
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
    etaMinutes?: number | null;
    locationAvailable: boolean;
    healthScore: number;
    priorityMerchantConnection?: boolean;
}

interface DispatchJob {
    id: number;
    status: string;
    customer_name: string;
    customer_email?: string | null;
    payment_method: string;
    payment_verified_at: string | null;
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
    priorityRiderAvailable?: boolean;
    merchantRiderPriorityReady?: boolean;
}

const WAREHOUSES = [
    { id: 'all', name: 'Global Network', city: 'All' },
    { id: 'nairobi', name: 'Nairobi Central Hub', city: 'Nairobi' },
    { id: 'mombasa', name: 'Mombasa Port Node', city: 'Mombasa'    },
    { id: 'kisumu', name: 'Kisumu Bar Base', city: 'Kisumu' }
];

export default function AdminDispatchPage() {
    const { role, permissions } = useAdmin();
    const [riders, setRiders] = useState<Rider[]>([]);
    const [orders, setOrders] = useState<DispatchJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
    const [demandZones, setDemandZones] = useState<{ lat: number, lng: number, intensity: number }[]>([]);
    const [assigning, setAssigning] = useState<number | null>(null);
    const [retryingAllocation, setRetryingAllocation] = useState<number | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [retiringRiderPhone, setRetiringRiderPhone] = useState<string | null>(null);
    const [resettingRiderPhone, setResettingRiderPhone] = useState<string | null>(null);
    const [copyingRiderPhone, setCopyingRiderPhone] = useState<string | null>(null);
    const [overrideRiders, setOverrideRiders] = useState<Record<number, string>>({});
    const [overrideReasons, setOverrideReasons] = useState<Record<number, string>>({});
    const [assignmentModes, setAssignmentModes] = useState<Record<number, 'automatic' | 'manual'>>({});
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
    const [requestedOrderId, setRequestedOrderId] = useState<number | null>(null);
    const requestedOrderScrollHandled = React.useRef(false);

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
            return true;
        } catch (err) {
            console.error("Pipeline link unstable.", err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Dispatch data could not be refreshed.' });
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        const orderId = Number(new URLSearchParams(window.location.search).get('orderId'));
        if (Number.isSafeInteger(orderId) && orderId > 0) {
            setRequestedOrderId(orderId);
            requestedOrderScrollHandled.current = false;
        }
    }, []);

    useEffect(() => {
        if (requestedOrderId === null
            || requestedOrderScrollHandled.current
            || !orders.some(order => order.id === requestedOrderId)) return;
        document.getElementById(`dispatch-order-${requestedOrderId}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        requestedOrderScrollHandled.current = true;
    }, [orders, requestedOrderId]);

    const stats = React.useMemo(() => {
        const total = riders.length;
        const active = riders.filter(r => r.status !== 'Offline').length;
        const delivering = riders.filter(r => r.status === 'Delivering').length;
        const standby = riders.filter(r => r.status === 'Idle').length;

        const healthScores = riders.flatMap(r =>
            typeof r.health_score === 'number' && Number.isFinite(r.health_score) ? [r.health_score] : []
        );
        const avgHealth = healthScores.length
            ? Math.round(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length)
            : null;

        return { total, active, delivering, standby, avgHealth };
    }, [riders]);

    const filteredRiders = riders.filter(r =>
        [r.rider_name, r.area_zone, r.rider_phone, r.plate_number, r.vehicle_reg, r.id_number]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(searchQuery.toLowerCase()))
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
            if (targetOrder) {
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
            const refreshed = await fetchData();
            if (refreshed) {
                setMessage({
                    type: result.allocation?.fully_allocated ? 'success' : 'error',
                    text: `${result.message || 'Merchant availability rechecked.'}${remainingText}`
                });
            }
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
            const result = await response.json() as { success?: boolean; pin?: string; emailSent?: boolean; emailWarning?: string; error?: string };
            if (!response.ok) throw new Error(result.error || 'Rider authorization failed.');
            if (!result.success) throw new Error('Rider authorization could not be confirmed.');
            setRiders(prev => prev.map(r => r.rider_phone === phone ? { ...r, verification_status: 'Verified' } : r));
            setMessage({
                type: 'success',
                text: result.emailSent
                    ? 'Rider approved. Sign-in instructions were sent to their email.'
                    : `${result.emailWarning || 'Rider approved, but email delivery failed.'}${result.pin ? ` Sign-in PIN: ${result.pin}.` : ''}`
            });
            setTimeout(() => setMessage(null), 10000);
        } catch (err) {
            console.error('Rider authorization failed:', err);
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Rider authorization failed.' });
        }
    }, []);

    const handleCopyRiderLink = async (phone: string) => {
        const link = `${getPublicBaseUrl()}/rider/dashboard?phone=${encodeURIComponent(phone)}`;
        setCopyingRiderPhone(phone);
        try {
            await copyTextToClipboard(link);
            setMessage({ type: 'success', text: 'Rider sign-in link copied. The rider will still need their approval PIN.' });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Rider sign-in link could not be copied.' });
        } finally {
            setCopyingRiderPhone(null);
        }
    };

    const handleResetRiderPin = async (phone: string) => {
        if (!window.confirm('Reset this approved rider’s sign-in PIN to the temporary PIN 0000? The rider can sign in and change it from the Security section of the rider terminal.')) return;
        setResettingRiderPhone(phone);
        try {
            const response = await fetch('/api/admin/dispatch/riders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const result = await response.json() as { success?: boolean; emailSent?: boolean; emailWarning?: string; error?: string };
            if (!response.ok || !result.success) throw new Error(result.error || 'Rider PIN could not be reset.');
            setMessage({
                type: 'success',
                text: result.emailSent
                    ? 'Rider PIN reset to 0000. Reset instructions were emailed to the rider.'
                    : result.emailWarning || 'Rider PIN reset to 0000. Share it directly with the rider.'
            });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Rider PIN could not be reset.' });
        } finally {
            setResettingRiderPhone(null);
        }
    };

    const handleRetireRider = async (phone: string) => {
        if (!window.confirm('Deactivate this rider now? This removes terminal access. Reassign or complete any active delivery first.')) return;
        setRetiringRiderPhone(phone);
        try {
            const response = await fetch('/api/admin/dispatch/riders', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const result = await response.json() as { success?: boolean; error?: string };
            if (!response.ok || !result.success) throw new Error(result.error || 'Rider could not be deactivated.');
            setRiders(current => current.map(rider => rider.rider_phone === phone
                ? { ...rider, verification_status: 'Rejected', status: 'Offline' }
                : rider));
            setSelectedRider(null);
            setMessage({ type: 'success', text: 'Rider deactivated. They can apply again if they return to the fleet.' });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Rider could not be deactivated.' });
        } finally {
            setRetiringRiderPhone(null);
        }
    };

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
                    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
                        <Link href="/lord/operations">
                            <Button variant="outline" className="h-10 rounded-xl border-primary/20 bg-primary px-4 text-[9px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-primary/90">
                                <Activity className="mr-2 h-4 w-4" /> Operations Command
                            </Button>
                        </Link>
                        <Link href="/lord/riders">
                            <Button variant="outline" className="h-10 rounded-xl border-transparent px-4 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-200 hover:bg-slate-50">
                                <Users className="mr-2 h-4 w-4" /> Rider Fleet
                            </Button>
                        </Link>
                        <Link href="/lord/delivery">
                            <Button variant="outline" className="h-10 rounded-xl border-transparent px-4 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-200 hover:bg-slate-50">
                                <PackageCheck className="mr-2 h-4 w-4" /> Delivery Ledger
                            </Button>
                        </Link>
                    </div>
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
                    { label: 'Average health score', val: stats.avgHealth === null ? 'Not tracked' : `${stats.avgHealth}%`, icon: ShieldCheck },
                    { label: 'Cash held', val: formatPrice(riders.reduce((sum, rider) => sum + Number(rider.wallet?.balance || 0), 0)), icon: CreditCard },
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

                    <section id="assignment-queue" className="scroll-mt-8 space-y-6">
                        <div className="flex items-center justify-between px-2 text-left">
                            <div className="flex items-center gap-3">
                                <Zap className="h-6 w-6 text-primary animate-pulse" />
                                <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Assign orders to riders</h2>
                            </div>
                        </div>
                        <p className="px-2 text-xs text-muted-foreground">
                            Pickup ranking uses fresh rider GPS and OSRM road distance/time to the nearest selected merchant pickup. Road estimates do not include live traffic.
                        </p>

                        {unverifiedPaymentCount > 0 && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                {unverifiedPaymentCount} online-paid order(s) do not have a matching server-verified payment record and remain unassigned.
                            </p>
                        )}
                        {orders.some(order => order.merchantRiderPriorityReady === false) && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                Merchant-connected rider priority is not configured yet. Apply supabase/MERCHANT_RIDER_CONNECTIONS_MIGRATION.sql; orders remain available to the regular verified-rider dispatch flow until then.
                            </p>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            {orders.length === 0 ? (
                                <div className="p-16 text-center bg-card rounded-[3rem] border-2 border-dashed border-border flex flex-col items-center gap-4">
                                    <PackageCheck className="h-12 w-12 text-muted" />
                                    <p className="text-sm font-black text-muted-foreground uppercase italic">No orders are ready for rider assignment.</p>
                                    <p className="max-w-2xl text-sm text-muted-foreground">
                                        Online orders need verified payment. Cash-on-delivery orders need confirmed merchant fulfillment; the rider collects payment at handover.
                                    </p>
                                </div>
                            ) : orders.map(order => {
                                const recommendation = order.recommendedRider;
                                const assignmentMode = assignmentModes[order.id] || 'automatic';
                                const isCashOnDelivery = ['cod', 'cash on delivery'].includes(order.payment_method.trim().toLowerCase());
                                return (
                                    <Card
                                        key={order.id}
                                        id={`dispatch-order-${order.id}`}
                                        className={cn(
                                            'min-w-0 rounded-3xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:p-7 space-y-5',
                                            requestedOrderId === order.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                                        )}
                                    >
                                        <div className="grid min-w-0 gap-4 text-left sm:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)] sm:items-start">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Order #{order.id}</h3>
                                                    <span className={cn(
                                                        'inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide',
                                                        isCashOnDelivery ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                                                    )}>
                                                        {isCashOnDelivery ? 'Cash due at delivery' : 'Paid online'}
                                                    </span>
                                                </div>
                                                <p className="mt-1 break-words text-sm text-muted-foreground">
                                                    {order.customer_name} <span aria-hidden="true">·</span> {formatPrice(Number(order.total_price))}
                                                </p>
                                                <p className={cn(
                                                    'mt-2 text-xs font-medium',
                                                    isCashOnDelivery ? 'text-amber-800' : 'text-emerald-700'
                                                )}>
                                                    {isCashOnDelivery
                                                        ? 'The rider collects payment from the customer at handover.'
                                                        : `Payment confirmed with ${order.payment_method}.`}
                                                </p>
                                            </div>
                                            {recommendation ? (
                                                <div className="min-w-0 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                                                    <p className={cn(
                                                        'text-[10px] font-black uppercase tracking-wide',
                                                        recommendation.priorityMerchantConnection ? 'text-emerald-700' : 'text-primary'
                                                    )}>
                                                        {recommendation.priorityMerchantConnection ? 'Priority connected rider' : 'Recommended rider'}
                                                    </p>
                                                    <p className="mt-1 break-words font-bold text-foreground">{recommendation.riderName}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {recommendation.distanceKm === null
                                                            ? 'Pickup route unavailable'
                                                            : `${recommendation.distanceKm} road km${recommendation.etaMinutes == null ? '' : ` · ${recommendation.etaMinutes} min`}`}
                                                        {' · '}{recommendation.activeLoad}/{recommendation.maxDeliveries} active
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                                    <p className="font-bold">Rider recommendation unavailable</p>
                                                    <p className="mt-1 break-words text-xs leading-relaxed">
                                                        {order.riderAvailabilityReason || 'No eligible rider can be recommended right now.'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className={cn(
                                            'min-w-0 rounded-2xl border p-4 text-left sm:p-5',
                                            order.fulfillment.ready ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'
                                        )}>
                                            <p className="text-xs font-black uppercase tracking-wide">
                                                {order.fulfillment.ready ? 'Merchant fulfillment ready' : 'Merchant fulfillment needs attention'}
                                            </p>
                                            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                                                {order.fulfillment.reasons.length > 0
                                                    ? order.fulfillment.reasons.map((reason, index) => <li key={index} className="break-words">{reason}</li>)
                                                    : <li>Products, stock, price and delivery area have been checked.</li>}
                                            </ul>
                                            {order.fulfillment.selectedVendorNames.length > 0 && (
                                                <p className="mt-3 break-words text-xs text-muted-foreground">
                                                    Pickup from {order.fulfillment.selectedVendorNames.join(', ')}
                                                </p>
                                            )}
                                            {order.fulfillment.selectedVendorLocations.map(vendor => (
                                                <p key={vendor.vendorId} className="mt-2 break-words text-xs text-muted-foreground">
                                                    {vendor.vendorName} <span aria-hidden="true">·</span> pickup location verified
                                                </p>
                                            ))}
                                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                                {order.fulfillment.productChecks.map((check, index) => (
                                                    <p key={`${check.productId}-${index}`} className="min-w-0 break-words rounded-xl border border-border/70 bg-background/70 p-3 text-xs">
                                                        <span className="font-semibold">{check.productName}</span>
                                                        <span className="mt-1 block text-muted-foreground">
                                                            Qty {check.quantity} <span aria-hidden="true">·</span> Reserved {check.reservedQuantity}
                                                        </span>
                                                    </p>
                                                ))}
                                            </div>
                                            <p className="mt-3 break-words text-[11px] leading-relaxed text-muted-foreground">{order.fulfillment.priceBasis}</p>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="mr-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assign with</span>
                                                <Button
                                                    type="button"
                                                    variant={assignmentMode === 'automatic' ? 'default' : 'outline'}
                                                    onClick={() => setAssignmentModes(prev => ({ ...prev, [order.id]: 'automatic' }))}
                                                    className="h-10 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest"
                                                >
                                                    Recommended rider
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant={assignmentMode === 'manual' ? 'default' : 'outline'}
                                                    onClick={() => setAssignmentModes(prev => ({ ...prev, [order.id]: 'manual' }))}
                                                    className="h-10 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest"
                                                >
                                                    Choose rider
                                                </Button>
                                            </div>
                                            {!order.fulfillment.ready && order.fulfillment.productChecks.some(check => check.reservedQuantity < check.quantity) && (
                                                <div className="flex flex-col items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <p className="text-xs leading-relaxed text-amber-950">
                                                        Stock is not reserved yet. Retry checks approved shops with available stock.
                                                    </p>
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => void retryMerchantAllocation(order.id)}
                                                        disabled={retryingAllocation === order.id || assigning === order.id}
                                                        className="h-11 max-w-full shrink-0 rounded-xl border-amber-300 px-4 text-xs font-bold text-amber-900"
                                                    >
                                                        {retryingAllocation === order.id
                                                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking shops</>
                                                            : 'Retry available shops'}
                                                    </Button>
                                                </div>
                                            )}
                                            {assignmentMode === 'automatic' ? (
                                                <div className="grid min-w-0 gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-foreground">
                                                            {!order.fulfillment.ready
                                                                ? 'Complete merchant fulfillment before assigning'
                                                                : recommendation
                                                                    ? `Recommended: ${recommendation.riderName}`
                                                                    : 'No rider recommendation available'}
                                                        </p>
                                                        <p className="mt-1 break-words text-xs text-muted-foreground">
                                                            {!order.fulfillment.ready
                                                                ? 'All products need a valid item and approved merchant stock reserved.'
                                                                : `Pickup: ${order.fulfillment.selectedVendorNames.length
                                                                    ? order.fulfillment.selectedVendorNames.join(', ')
                                                                    : 'merchant pickup not confirmed'}`}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        onClick={() => handleAssignRider(order.id, recommendation?.riderPhone || '', 'automatic')}
                                                        disabled={!order.fulfillment.ready || !recommendation || assigning === order.id}
                                                        className="h-12 w-full rounded-xl px-5 text-xs font-bold sm:w-auto"
                                                        title={!order.fulfillment.ready
                                                            ? 'Resolve the merchant fulfillment issues shown above before assigning a rider.'
                                                            : !recommendation
                                                                ? order.riderAvailabilityReason || 'No rider is currently eligible for automatic assignment.'
                                                                : undefined}
                                                    >
                                                        {assigning === order.id
                                                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning</>
                                                            : !order.fulfillment.ready
                                                                ? 'Merchant fulfillment required'
                                                                : 'Assign recommended rider'}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="grid min-w-0 gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                                        Choose an eligible, verified rider. Manual selection cannot bypass missing product details, merchant stock, or payment checks.
                                                    </p>
                                                    {!order.fulfillment.ready && (
                                                        <p className="text-xs font-medium text-amber-900" role="status">
                                                            Assignment is locked until the product, stock, and merchant pickup issues above are resolved.
                                                        </p>
                                                    )}
                                                    {order.fulfillment.ready && (
                                                        <>
                                                            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                                                                <select
                                                                    value={overrideRiders[order.id] || ''}
                                                                    onChange={event => setOverrideRiders(prev => ({ ...prev, [order.id]: event.target.value }))}
                                                                    className="h-12 min-w-0 rounded-xl border border-border bg-background px-3 text-sm"
                                                                    disabled={order.riderCandidates.length === 0 || assigning === order.id}
                                                                >
                                                                    <option value="">Select an available rider</option>
                                                                    {order.riderCandidates.map(candidate => (
                                                                        <option key={candidate.riderPhone} value={candidate.riderPhone}>
                                                                            {candidate.priorityMerchantConnection ? 'Connected · ' : ''}{candidate.riderName} · {candidate.activeLoad}/{candidate.maxDeliveries} active
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <Input
                                                                    value={overrideReasons[order.id] || ''}
                                                                    onChange={event => setOverrideReasons(prev => ({ ...prev, [order.id]: event.target.value }))}
                                                                    placeholder="Why choose a different rider? (8+ characters)"
                                                                    aria-label="Reason for manual rider assignment"
                                                                    className="h-12 min-w-0 rounded-xl"
                                                                />
                                                            </div>
                                                            <Button
                                                                onClick={() => handleAssignRider(order.id, overrideRiders[order.id] || '', 'override')}
                                                                disabled={!overrideRiders[order.id] || (overrideReasons[order.id] || '').trim().length < 8 || assigning === order.id}
                                                                variant="outline"
                                                                className="h-12 w-full rounded-xl border-amber-300 font-bold text-amber-900 sm:w-auto"
                                                                title={!overrideRiders[order.id]
                                                                    ? 'Select an available rider.'
                                                                    : (overrideReasons[order.id] || '').trim().length < 8
                                                                        ? 'Enter a reason with at least 8 characters.'
                                                                        : undefined}
                                                            >
                                                                {assigning === order.id
                                                                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning</>
                                                                    : 'Assign selected rider'}
                                                            </Button>
                                                        </>
                                                    )}
                                                    {order.fulfillment.ready && order.riderCandidates.length === 0 && (
                                                        <p className="text-xs text-amber-900" role="status">
                                                            No verified rider is online with delivery capacity. Ask a rider to sign in and go online, then refresh dispatch.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
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
                                                <p className="text-sm font-black text-foreground">{formatBatteryTelemetry(rider.battery_level, rider.battery_updated_at)}</p>
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

                            {selectedRider.activeOrders.length > 0 && (
                                <div className="p-8 rounded-[2.5rem] bg-primary/5 border-2 border-primary/20 space-y-8 relative overflow-hidden">
                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white"><Package className="h-5 w-5" /></div>
                                            <h3 className="text-lg font-black uppercase text-foreground">Active deliveries</h3>
                                        </div>
                                        <span className="px-3 py-1 bg-primary text-white text-[8px] font-black rounded-full uppercase">{selectedRider.activeOrders.length} assigned</span>
                                    </div>

                                    <div className="space-y-4 relative z-10">
                                        {selectedRider.activeOrders.map(order => {
                                            const hasDestination = order.latitude !== null && order.longitude !== null;
                                            const hasOrigin = selectedRider.lat !== null && selectedRider.lat !== undefined
                                                && selectedRider.lng !== null && selectedRider.lng !== undefined
                                                && selectedRider.lat >= -90 && selectedRider.lat <= 90
                                                && selectedRider.lng >= -180 && selectedRider.lng <= 180;
                                            const mapUrl = hasDestination
                                                ? `https://www.google.com/maps/dir/?api=1${hasOrigin ? `&origin=${selectedRider.lat},${selectedRider.lng}` : ''}&destination=${order.latitude},${order.longitude}&travelmode=driving`
                                                : null;
                                            return (
                                                <div key={order.id} className="rounded-xl border border-primary/10 bg-background/70 p-4">
                                                    <div className="flex justify-between gap-3 text-sm">
                                                        <span className="font-black">Order #{order.id}</span>
                                                        <span className="text-right font-semibold text-primary">{order.status}</span>
                                                    </div>
                                                    <p className="mt-1 text-xs text-muted-foreground">Customer: {order.customer_name}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Delivery ETA is not available from the current live data.
                                                    </p>
                                                    {mapUrl && (
                                                        <Button asChild variant="outline" className="mt-3 w-full">
                                                            <a href={mapUrl} target="_blank" rel="noreferrer">Open delivery destination</a>
                                                        </Button>
                                                    )}
                                                    {!hasDestination && <p className="mt-2 text-xs text-amber-700">Customer delivery pin is not recorded for this order.</p>}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <Zap className="absolute -bottom-10 -right-10 h-48 w-48 text-primary/5 rotate-12" />
                                </div>
                            )}
                            {selectedRider.status === 'Delivering' && selectedRider.activeOrders.length === 0 && (
                                <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                    Rider status says delivering, but no active assigned order is recorded.
                                </p>
                            )}

                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground ml-2">Communications</h3>
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        onClick={() => window.location.href = `tel:${selectedRider.rider_phone.replace(/[^\d+]/g, '')}`}
                                        variant="outline"
                                        className="flex-1 h-14 rounded-2xl border-border text-foreground font-black uppercase text-[10px] hover:bg-secondary transition-all"
                                    >
                                        <Phone className="h-4 w-4 mr-2" /> Call Unit
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            const number = getKenyanWhatsAppNumber(selectedRider.rider_phone);
                                            const text = `Hi ${selectedRider.rider_name}, this is Online Bar dispatch.`;
                                            window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
                                        }}
                                        className="flex-1 h-14 rounded-2xl bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-100 active:scale-95 transition-all"
                                    >
                                        WhatsApp
                                    </Button>
                                </div>
                            </div>

                            {selectedRider.activeOrders.length > 0 ? (
                                <Link
                                    href={`/lord/riders/${selectedRider.id}`}
                                    className="inline-flex h-14 w-full items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-center text-[10px] font-black uppercase tracking-widest text-emerald-800 hover:bg-emerald-100"
                                >
                                    View rider device screen
                                </Link>
                            ) : (
                                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                                    No active delivery is assigned, so there is no current mission screen to preview.
                                </p>
                            )}

                            <div className="pt-8 border-t border-border flex flex-col gap-4">
                                <Button
                                    variant="outline"
                                    onClick={() => void handleResetRiderPin(selectedRider.rider_phone)}
                                    disabled={resettingRiderPhone === selectedRider.rider_phone || selectedRider.verification_status !== 'Verified'}
                                    className="w-full h-14 rounded-2xl border-amber-200 text-amber-800 font-black uppercase text-[10px] tracking-widest hover:bg-amber-50 transition-all disabled:opacity-50"
                                >
                                    {resettingRiderPhone === selectedRider.rider_phone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Reset Rider PIN to 0000
                                </Button>
                                <Button
                                    onClick={() => void handleCopyRiderLink(selectedRider.rider_phone)}
                                    variant="outline"
                                    disabled={copyingRiderPhone === selectedRider.rider_phone}
                                    className="w-full h-14 rounded-2xl border-indigo-200 text-indigo-600 font-black uppercase text-[10px] tracking-widest hover:bg-indigo-50 transition-all"
                                >
                                    {copyingRiderPhone === selectedRider.rider_phone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {copyingRiderPhone === selectedRider.rider_phone ? 'Copying Rider Sign-in Link…' : 'Copy Rider Sign-in Link'}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => void handleRetireRider(selectedRider.rider_phone)}
                                    disabled={retiringRiderPhone === selectedRider.rider_phone || selectedRider.verification_status !== 'Verified'}
                                    className="w-full h-14 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[10px] hover:bg-rose-50 transition-all disabled:opacity-50"
                                >
                                    {retiringRiderPhone === selectedRider.rider_phone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Deactivate Rider
                                </Button>
                            </div>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}
