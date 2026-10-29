'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Store,
    Users,
    ShieldCheck,
    TrendingUp,
    Plus,
    RefreshCcw,
    Box,
    Truck,
    Loader2,
    CheckCircle2,
    ShieldAlert,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn, formatPrice } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';

interface Vendor {
    id: string;
    name: string;
    email: string;
    status: 'Pending' | 'Active' | 'Suspended';
    sales_total: number;
    items_count: number;
    commission_rate: number;
    merchant_level?: number;
    merchant_xp?: number;
    joined_at: string;
}

export default function MultiVendorHub() {
    const { email: adminEmail } = useAdmin();
    const [vendors, setVendors] = React.useState<Vendor[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [pricingSummary, setPricingSummary] = React.useState<{
        customerPrice: number;
        vendorProfit: number;
        marginPercent: number;
        visibility: { nearCustomer: boolean; maxDistanceKm: number; reason: string };
        riders: Array<{ id: string; name: string; dispatchScore: number; payoutEstimate: number }>;
    } | null>(null);
    const [isOnboarding, setIsOnboarding] = React.useState(false);
    const [message, setMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [routingMode, setRoutingMode] = React.useState<'nearest' | 'smart' | 'broadcast' | 'round_robin' | 'exclusive'>('smart');
    const [zoneCoverage] = React.useState([
        { name: 'Westlands', vendors: 4, status: 'Open', demand: 'High' },
        { name: 'Kilimani', vendors: 3, status: 'Balanced', demand: 'Medium' },
        { name: 'Roysambu', vendors: 2, status: 'Busy', demand: 'High' },
        { name: 'CBD', vendors: 5, status: 'Open', demand: 'Very high' }
    ]);
    const [markupProfile, setMarkupProfile] = React.useState({
        type: 'percent',
        value: 12,
        minMargin: 40,
        roundTo: 10,
        maxPrice: 850,
        zone: 'Westlands'
    });
    const [assumedSalesPerDay, setAssumedSalesPerDay] = React.useState(18);
    const [zonePrices] = React.useState([
        { zone: 'Westlands', beer: 340, spirit: 620, mixer: 230 },
        { zone: 'Kilimani', beer: 360, spirit: 640, mixer: 250 },
        { zone: 'Roysambu', beer: 330, spirit: 600, mixer: 220 },
        { zone: 'CBD', beer: 350, spirit: 630, mixer: 240 }
    ]);

    // Form State
    const [newVendor, setNewVendor] = React.useState({ name: '', email: '' });

    const fetchVendors = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            // Real Database Node Link
            const { data, error } = await supabase
                .from('marketplace_vendors')
                .select('*')
                .order('joined_at', { ascending: false });

            if (!error) setVendors(data || []);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchVendors();
    }, [fetchVendors]);

    React.useEffect(() => {
        let active = true;
        void fetch('/api/admin/vendor-pricing')
            .then(async (response) => {
                if (!response.ok) return;
                const payload = await response.json();
                if (active) setPricingSummary(payload);
            })
            .catch(() => {
                // Pricing API is optional for the local prototype build.
            });

        return () => {
            active = false;
        };
    }, []);

    const handleDeleteVendor = async (id: string, name: string) => {
        if (!supabase || !adminEmail) return;
        if (!window.confirm(`Expunge ${name} from the partner grid? This cannot be undone.`)) return;

        try {
            const { error } = await supabase.from('marketplace_vendors').delete().eq('id', id);
            if (error) throw error;

            setVendors(prev => prev.filter(v => v.id !== id));
            await logAuditAction(adminEmail, 'DELETE_VENDOR', { id, name });
            setMessage({ type: 'success', text: "Partner Node Expunged." });
        } catch (err: unknown) {
            setMessage({ type: 'error', text: (err as Error).message });
        } finally {
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleApproveVendor = async (id: string) => {
        if (!supabase) return;
        try {
            const { error } = await supabase
                .from('marketplace_vendors')
                .update({ status: 'Active' })
                .eq('id', id);

            if (error) throw error;

            setVendors(prev => prev.map(v => v.id === id ? { ...v, status: 'Active' } : v));
            await logAuditAction(adminEmail, 'APPROVE_VENDOR', { id });
            setMessage({ type: 'success', text: "Partner Node Activated. Commission logic synchronized." });
        } catch (err: unknown) {
            setMessage({ type: 'error', text: (err as Error).message });
        } finally {
            setTimeout(() => setMessage(null), 3000);
        }
    };

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Store className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Nexus Partner Grid</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Multi-Vendor Hub</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-2">Manage 3rd party partners and autonomous commission settlements.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={fetchVendors} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Sync Grid
                    </Button>
                    <Button onClick={() => setIsOnboarding(true)} className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all active:scale-95">
                        <Plus size={16} className="mr-2" /> Onboard Partner
                    </Button>
                </div>
            </header>

            <Card className="p-6 sm:p-8 rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Zone routing control room</p>
                        <h2 className="mt-3 text-2xl font-black uppercase tracking-tighter">Vendor area allocation</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {['nearest', 'smart', 'broadcast', 'round_robin', 'exclusive'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => setRoutingMode(mode as typeof routingMode)}
                                className={cn(
                                    'rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] transition',
                                    routingMode === mode ? 'border-amber-300 bg-amber-300 text-slate-900' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                                )}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Live mode</p>
                        <p className="mt-3 text-2xl font-black capitalize">{routingMode}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Delivery fee</p>
                        <p className="mt-3 text-2xl font-black">KSh 250</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Min order</p>
                        <p className="mt-3 text-2xl font-black">KSh 1,500</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Fallback</p>
                        <p className="mt-3 text-2xl font-black">Ops queue</p>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Coverage map</p>
                        <div className="mt-4 space-y-3">
                            {zoneCoverage.map(zone => (
                                <div key={zone.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                                    <div>
                                        <p className="font-black">{zone.name}</p>
                                        <p className="text-[10px] text-slate-300">{zone.vendors} vendors · {zone.demand} demand</p>
                                    </div>
                                    <span className={cn(
                                        'rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]',
                                        zone.status === 'Open' ? 'bg-emerald-500/15 text-emerald-200' :
                                        zone.status === 'Balanced' ? 'bg-amber-500/15 text-amber-200' : 'bg-rose-500/15 text-rose-200'
                                    )}>{zone.status}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Routing safeguards</p>
                        <ul className="mt-4 space-y-3 text-sm text-slate-200">
                            <li>• 90 second timeout before reroute</li>
                            <li>• Alcohol licence check before order acceptance</li>
                            <li>• Live stock validation before assignment</li>
                            <li>• Manual admin reassignment with audit trail</li>
                            <li>• Zone pause and whole-platform override</li>
                        </ul>
                    </div>
                </div>
            </Card>

            <Card className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Markup manager</p>
                        <h3 className="mt-2 text-2xl font-black uppercase tracking-tighter text-slate-900">Catalog pricing and reach logic</h3>
                    </div>
                    <div className="rounded-full bg-amber-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">Margin floor active</div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-5">
                    <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Rule type
                        <select
                            value={markupProfile.type}
                            onChange={(event) => setMarkupProfile((current) => ({ ...current, type: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                        >
                            <option value="percent">Percent</option>
                            <option value="fixed">Fixed</option>
                            <option value="tiered">Tiered</option>
                        </select>
                    </label>
                    <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Markup value
                        <input
                            type="number"
                            value={markupProfile.value}
                            onChange={(event) => setMarkupProfile((current) => ({ ...current, value: Number(event.target.value) || 0 }))}
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                        />
                    </label>
                    <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Min margin
                        <input
                            type="number"
                            value={markupProfile.minMargin}
                            onChange={(event) => setMarkupProfile((current) => ({ ...current, minMargin: Number(event.target.value) || 0 }))}
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                        />
                    </label>
                    <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Round to
                        <input
                            type="number"
                            value={markupProfile.roundTo}
                            onChange={(event) => setMarkupProfile((current) => ({ ...current, roundTo: Number(event.target.value) || 10 }))}
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                        />
                    </label>
                    <label className="space-y-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Zone
                        <select
                            value={markupProfile.zone}
                            onChange={(event) => setMarkupProfile((current) => ({ ...current, zone: event.target.value }))}
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                        >
                            {zoneCoverage.map(zone => (
                                <option key={zone.name} value={zone.name}>{zone.name}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50">
                            <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                                <th className="px-4 py-3">Zone</th>
                                <th className="px-4 py-3">Beer</th>
                                <th className="px-4 py-3">Spirits</th>
                                <th className="px-4 py-3">Mixer</th>
                                <th className="px-4 py-3">Reach</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {zonePrices.map(zone => (
                                <tr key={zone.zone} className="text-sm font-semibold text-slate-800">
                                    <td className="px-4 py-3">{zone.zone}</td>
                                    <td className="px-4 py-3">KSh {zone.beer}</td>
                                    <td className="px-4 py-3">KSh {zone.spirit}</td>
                                    <td className="px-4 py-3">KSh {zone.mixer}</td>
                                    <td className="px-4 py-3">{zone.zone === markupProfile.zone ? 'Within reach' : 'Nearby fallback'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Profit dashboard</p>
                        <h3 className="mt-2 text-2xl font-black uppercase tracking-tighter text-slate-900">Projected daily sales and profit</h3>
                    </div>
                    <label className="flex items-center gap-3 rounded-full bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                        Assumed sales / item / day
                        <input
                            type="number"
                            min={1}
                            max={200}
                            value={assumedSalesPerDay}
                            onChange={(event) => setAssumedSalesPerDay(Number(event.target.value) || 1)}
                            className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-primary"
                        />
                    </label>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Customer price</p>
                        <p className="mt-3 text-3xl font-black text-slate-900">KSh {Math.ceil((zonePrices[0].spirit * (1 + markupProfile.value / 100)) / markupProfile.roundTo) * markupProfile.roundTo}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Your profit / item</p>
                        <p className="mt-3 text-3xl font-black text-emerald-700">KSh {Math.max(markupProfile.minMargin, Math.round((zonePrices[0].spirit * markupProfile.value / 100) - 20))}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Projected daily profit</p>
                        <p className="mt-3 text-3xl font-black text-slate-900">KSh {(Math.max(markupProfile.minMargin, Math.round((zonePrices[0].spirit * markupProfile.value / 100) - 20)) * assumedSalesPerDay).toLocaleString('en-KE')}</p>
                    </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                    <div className="grid gap-4 bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 md:grid-cols-5">
                        <span>Item</span>
                        <span>Vendor</span>
                        <span>Customer</span>
                        <span>Margin</span>
                        <span>Floor</span>
                    </div>
                    {[
                        { name: 'Tusker Lager', vendor: 300, customer: 340, margin: 40, floor: 'OK' },
                        { name: 'Smirnoff Vodka', vendor: 560, customer: 620, margin: 60, floor: 'OK' },
                        { name: 'Coke 500ml', vendor: 120, customer: 150, margin: 30, floor: 'Low' }
                    ].map((item) => (
                        <div key={item.name} className="grid gap-4 border-t border-slate-200 px-4 py-3 text-sm text-slate-800 md:grid-cols-5">
                            <span>{item.name}</span>
                            <span>KSh {item.vendor}</span>
                            <span>KSh {item.customer}</span>
                            <span className={item.margin >= markupProfile.minMargin ? 'text-emerald-700' : 'text-red-600'}>KSh {item.margin}</span>
                            <span className={item.margin >= markupProfile.minMargin ? 'text-emerald-700' : 'text-red-600'}>{item.margin >= markupProfile.minMargin ? 'Pass' : 'Below floor'}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Backend pricing + rider rules</p>
                        <h3 className="mt-2 text-2xl font-black uppercase tracking-tighter text-slate-900">Live fare simulator</h3>
                    </div>
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Ready for DB wiring</div>
                </div>

                {pricingSummary ? (
                    <div className="mt-6 grid gap-4 lg:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Customer price</p>
                            <p className="mt-3 text-3xl font-black text-slate-900">KSh {pricingSummary.customerPrice}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Vendor profit</p>
                            <p className="mt-3 text-3xl font-black text-emerald-700">KSh {pricingSummary.vendorProfit}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Visibility</p>
                            <p className="mt-3 text-xl font-black text-slate-900">{pricingSummary.visibility.nearCustomer ? 'Visible' : 'Hidden'}</p>
                            <p className="mt-1 text-xs text-slate-500">{pricingSummary.visibility.reason}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Top rider</p>
                            <p className="mt-3 text-xl font-black text-slate-900">{pricingSummary.riders[0]?.name ?? 'N/A'}</p>
                            <p className="mt-1 text-xs text-slate-500">Score {pricingSummary.riders[0]?.dispatchScore ?? 0}</p>
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                        Loading backend fare simulator…
                    </div>
                )}
            </Card>

            {isOnboarding && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/10 backdrop-blur-md p-4">
                    <Card className="max-w-md w-full p-10 rounded-[3rem] bg-white border border-slate-100 shadow-2xl space-y-8 animate-in zoom-in-95 duration-500">
                        <h3 className="text-xl font-black uppercase tracking-tighter">Partner Onboarding</h3>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400">Business Name</label>
                                <Input value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} placeholder="e.g. Online Bar Wholesalers" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400">Contact Email</label>
                                <Input value={newVendor.email} onChange={e => setNewVendor({...newVendor, email: e.target.value})} placeholder="partner@domain.com" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={async () => {
                                    if (!newVendor.name || !newVendor.email || !supabase) return;
                                    setLoading(true);
                                    try {
                                        const { data, error } = await supabase
                                            .from('marketplace_vendors')
                                            .insert([{
                                                name: newVendor.name,
                                                email: newVendor.email,
                                                status: 'Pending',
                                                sales_total: 0,
                                                items_count: 0,
                                                commission_rate: 10,
                                                merchant_level: 1,
                                                merchant_xp: 0
                                            }])
                                            .select()
                                            .single();

                                        if (error) throw error;

                                        setVendors(prev => [data, ...prev]);
                                        setIsOnboarding(false);
                                        setNewVendor({ name: '', email: '' });
                                        setMessage({ type: 'success', text: "Onboarding Payload Sent. Verification Pending." });
                                        setTimeout(() => setMessage(null), 3000);
                                    } catch (err: unknown) {
                                        setMessage({ type: 'error', text: (err as Error).message });
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                                className="flex-1 h-14 rounded-2xl bg-primary text-white font-black uppercase text-[10px] shadow-lg shadow-primary/20"
                            >
                                {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                                Initiate Protocol
                            </Button>
                            <Button onClick={() => setIsOnboarding(false)} variant="outline" className="flex-1 h-14 rounded-2xl border-slate-100 font-black uppercase text-[10px]">Cancel</Button>
                        </div>
                    </Card>
                </div>
            )}

            {message && (
                <div className={cn(
                    "p-6 rounded-[2rem] border-2 flex items-center gap-4 animate-in slide-in-from-top-4",
                    message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
                )}>
                    {message.type === 'success' ? <CheckCircle2 size={24} /> : <ShieldAlert size={24} />}
                    <p className="text-sm font-black uppercase tracking-widest">{message.text}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
                <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm relative overflow-hidden group h-full flex flex-col justify-between">
                    <div className="relative z-10 space-y-8">
                        <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shadow-sm"><Users size={24} /></div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Active Marketplace Partners</p>
                            <h3 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">{vendors.filter(v => v.status === 'Active').length} Nodes</h3>
                        </div>
                    </div>
                </Card>

                <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm relative overflow-hidden group h-full flex flex-col justify-between">
                    <div className="relative z-10 space-y-8">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm"><TrendingUp size={24} /></div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Commission Yield (MTD)</p>
                            <h3 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">{formatPrice(vendors.reduce((s, v) => s + (v.sales_total * (v.commission_rate/100)), 0))}</h3>
                        </div>
                    </div>
                </Card>

                <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm relative overflow-hidden group h-full flex flex-col justify-between">
                    <div className="relative z-10 space-y-8">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 shadow-sm"><Box size={24} /></div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Managed Marketplace SKUs</p>
                            <h3 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">{vendors.reduce((s, v) => s + v.items_count, 0)} Units</h3>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden text-left">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em]">
                            <th className="px-10 py-6">Partner Identity</th>
                            <th className="px-10 py-6">Grid Status</th>
                            <th className="px-10 py-6">Sales / Commission</th>
                            <th className="px-10 py-6">Items</th>
                            <th className="px-10 py-6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr><td colSpan={5} className="p-20 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>
                        ) : vendors.map(v => (
                            <tr key={v.id} className="hover:bg-primary/5 transition-colors group">
                                <td className="px-10 py-8 text-left">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-foreground font-black text-xs">
                                            {v.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-foreground uppercase tracking-tight">{v.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[8px] font-bold text-slate-400 uppercase">{v.email}</p>
                                                <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                <span className="text-[8px] font-black text-primary uppercase">Level {v.merchant_level || 1}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-10 py-8">
                                    <span className={cn(
                                        "px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border",
                                        v.status === 'Active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                        v.status === 'Pending' ? "bg-amber-50 text-amber-600 border-amber-100 animate-pulse" :
                                        "bg-rose-50 text-rose-600 border-rose-100"
                                    )}>{v.status}</span>
                                </td>
                                <td className="px-10 py-8">
                                    <p className="text-xs font-black text-foreground">{formatPrice(v.sales_total)}</p>
                                    <p className="text-[9px] font-bold text-primary uppercase mt-1">{v.commission_rate}% OB Fee</p>
                                </td>
                                <td className="px-10 py-8 text-left">
                                    <div className="flex items-center gap-2">
                                        <Box size={14} className="text-slate-300" />
                                        <span className="text-xs font-black text-foreground">{v.items_count} Units</span>
                                    </div>
                                </td>
                                <td className="px-10 py-8 text-right">
                                    <div className="flex justify-end gap-2">
                                        {v.status === 'Pending' && (
                                            <Button onClick={() => handleApproveVendor(v.id)} size="sm" className="h-10 px-4 rounded-xl bg-primary text-white font-black uppercase text-[9px] shadow-lg shadow-primary/20">Approve</Button>
                                        )}
                                        <Button onClick={() => handleDeleteVendor(v.id, v.name)} variant="outline" size="icon" className="h-10 w-10 rounded-xl border-rose-100 text-rose-400 hover:bg-rose-50"><Trash2 size={16} /></Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid md:grid-cols-2 gap-8 text-left">
                <Card className="p-10 rounded-[3rem] bg-indigo-600 text-white border-none shadow-2xl relative overflow-hidden group">
                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/20"><ShieldCheck size={24} /></div>
                            <h3 className="text-xl font-black uppercase tracking-tighter">Settlement Protocol</h3>
                        </div>
                        <p className="text-xs font-medium leading-relaxed opacity-70 italic">
                            &quot;All partner payouts are autonomously calculated every Monday. Commission is deducted at the source of successful delivery missions.&quot;
                        </p>
                        <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60">Status</span>
                            <span className="text-xs font-black uppercase tracking-widest">Active System</span>
                        </div>
                    </div>
                </Card>

                <div className="p-10 rounded-[3rem] bg-white border border-slate-100 space-y-8 shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><Truck size={24} /></div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Fulfillment Choice</h3>
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">Managed Partner Logistics</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex-1 space-y-2">
                            <p className="text-[10px] font-black uppercase text-foreground">Fulfilled by Online Bar</p>
                            <p className="text-[8px] font-medium text-slate-500 italic">Partners store stock in your warehouse nodes.</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex-1 space-y-2 opacity-50">
                            <p className="text-[10px] font-black uppercase text-foreground">Merchant Dispatch</p>
                            <p className="text-[8px] font-medium text-slate-500 italic">Partners handle their own logistics node.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
