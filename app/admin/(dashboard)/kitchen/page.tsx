'use client';

import * as React from 'react';
import {
    Loader2,
    Play,
    RefreshCcw,
    Flame,
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
    addons: Array<{ name: string; price: number }>;
}

interface KdsTicket {
    id: string;
    order_id: string;
    stage: 'QUEUED' | 'PREPARING' | 'PACKED';
    items: KdsItem[];
    kitchen_notes?: string;
    order_age_sec: number;
}

function getKitchenNotes(note: string | null) {
    if (!note) return undefined;
    const details = note.split('|')
        .map(part => part.trim())
        .filter(part => part && !/^(region|free delivery area|coupon|used \d+ points|referred by|paystack ref|payment verified|payment failed)\s*:/i.test(part)
            && !/^🎁?\s*GIFT\s*:/i.test(part));
    return details.length ? details.join(' | ') : undefined;
}

export default function KitchenCommandHUD() {
    const [tickets, setTickets] = React.useState<KdsTicket[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);

    // Admin order access goes through the server so database RLS stays enabled.
    const fetchKitchenTickets = React.useCallback(async () => {
        try {
            const response = await fetch('/api/admin/kitchen/orders?department=food', { cache: 'no-store' });
            const result = await response.json() as {
                orders?: Array<{
                    id: number;
                    status: string | null;
                    created_at: string | null;
                    note: string | null;
                    order_items: Array<{
                        id: number;
                        product_id: number | null;
                        quantity: number | null;
                        size: string | null;
                        addons: unknown;
                        status: string | null;
                        products: {
                            name: string | null;
                            category: string | null;
                            sub_category: string | null;
                            is_bite: boolean | null;
                            is_snack: boolean | null;
                        } | Array<{
                            name: string | null;
                            category: string | null;
                            sub_category: string | null;
                            is_bite: boolean | null;
                            is_snack: boolean | null;
                        }> | null;
                    }> | null;
                }>;
                error?: string;
            };
            if (!response.ok) throw new Error(result.error || 'Kitchen orders could not be loaded.');

            const now = Date.now();
            const dbTickets: KdsTicket[] = (result.orders || [])
                .filter(ord => ['pending', 'paid', 'created', 'preparing', 'packed'].includes(String(ord.status || '').toLowerCase()))
                .map(ord => {
                    const rawItems = ord.order_items || [];
                    const parsedItems: KdsItem[] = rawItems.map(item => {
                        const product = Array.isArray(item.products) ? item.products[0] : item.products;
                        return {
                            name: product?.name || (item.product_id ? `Product #${item.product_id}` : 'Product details unavailable'),
                            quantity: Number(item.quantity || 0),
                            spec: item.size || undefined,
                            addons: Array.isArray(item.addons)
                                ? item.addons.filter((addon): addon is { name: string; price: number } =>
                                    typeof addon === 'object' && addon !== null
                                    && 'name' in addon && typeof addon.name === 'string'
                                    && 'price' in addon && typeof addon.price === 'number'
                                )
                                : []
                        };
                    });
                    const itemStatuses = rawItems.map(item => String(item.status || '').toUpperCase());
                    const stage: KdsTicket['stage'] = itemStatuses.length > 0 && itemStatuses.every(status => status === 'PACKED') ? 'PACKED'
                        : itemStatuses.some(status => status === 'PREPARING') ? 'PREPARING'
                        : 'QUEUED';
                    const createdAt = ord.created_at ? new Date(ord.created_at) : null;

                    return {
                        id: String(ord.id),
                        order_id: `#${ord.id}`,
                        stage,
                        items: parsedItems,
                        kitchen_notes: getKitchenNotes(ord.note),
                        order_age_sec: createdAt && Number.isFinite(createdAt.getTime())
                            ? Math.max(0, Math.floor((now - createdAt.getTime()) / 1000))
                            : 0
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
        const refresh = window.setInterval(fetchKitchenTickets, 15000);
        return () => window.clearInterval(refresh);
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
        if (currentStage === 'PACKED') return;
        const nextStage: KdsTicket['stage'] = currentStage === 'QUEUED' ? 'PREPARING' : 'PACKED';

        try {
            const response = await fetch('/api/admin/kitchen/orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: ticketId, status: nextStage })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Order status could not be updated.');
            setLoadError(null);
            setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, stage: nextStage } : t));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Order status could not be updated.';
            setLoadError(message);
            return;
        }
    };

    const formatTimer = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600);
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        const mins = Math.floor((totalSeconds % 3600) / 60);
        if (days > 0) return `${days}d ${remainingHours}h`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

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
                        Kitchen <span className="text-rose-500 italic">Queue.</span>
                    </h1>
                    <p className="text-slate-500 text-sm font-medium italic">
                        Preparation tickets from active customer orders.
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
                                            {item.addons.length > 0 && (
                                                <p className="text-[10px] font-bold text-amber-800">
                                                    Extras: {item.addons.map(addon => addon.name).join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {t.kitchen_notes && (
                                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-1">
                                        <p className="text-[8px] font-black uppercase text-amber-800 tracking-widest">Preparation Note</p>
                                        <p className="text-xs font-bold text-amber-950 italic">&quot;{t.kitchen_notes}&quot;</p>
                                    </div>
                                )}

                            </div>

                            {/* Stage Advance Button */}
                            <div className="p-8 pt-0">
                                <Button
                                    onClick={() => handleAdvanceStage(t.id, t.stage)}
                                    disabled={t.stage === 'PACKED'}
                                    className={cn(
                                        "w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all",
                                        t.stage === 'QUEUED' ? "bg-amber-500 text-white hover:bg-amber-600" :
                                        t.stage === 'PREPARING' ? "bg-indigo-600 text-white hover:bg-indigo-700" :
                                        "bg-emerald-500 text-white"
                                    )}
                                >
                                    {t.stage === 'PACKED' ? 'Ready for Dispatch' :
                                     t.stage === 'QUEUED' ? <><Play size={16} className="mr-2 fill-current" /> Start Preparation</> :
                                     <><PackageCheck size={16} className="mr-2" /> Mark Packed & Ready</>}
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>

        </div>
    );
}
