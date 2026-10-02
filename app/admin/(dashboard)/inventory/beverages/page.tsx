'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Coffee,
    Plus,
    RefreshCcw,
    Snowflake,
    Loader2,
    Layers,
    Trash2,
    Search,
    X,
    CheckCircle2
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import Image from 'next/image';

interface BeverageNode {
    id: string | number;
    name: string;
    brand?: string;
    category: string;
    sub_category?: string;
    price: number;
    stock: number;
    size_label?: string;
    is_ice_cold?: boolean;
    temperature_celsius?: number;
    is_available_now?: boolean;
    image_url?: string;
    image?: string;
}

export default function BeverageCommandAdmin() {
    const { email } = useAdmin();
    const [beverages, setBeverages] = React.useState<BeverageNode[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // Form state
    const [form, setForm] = React.useState({
        name: '',
        brand: 'BAR OS Originals',
        category: 'Soft Drinks',
        size_label: '500ml',
        price: '',
        stock: '0',
        temperature: '',
        image_url: '',
        pairings: 'Smocha Deluxe, Chips Masala, Chicken Wings'
    });

    const fetchBeverages = React.useCallback(async () => {
        if (!supabase) {
            setLoadError('Supabase is not configured. Inventory is unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            const alcoholicCategories = ['whiskey', 'whisky', 'wine', 'spirits', 'champagne', 'vodka', 'gin', 'rum', 'tequila', 'cognac', 'liquor', 'cellar', 'snacks'];
            const nonAlcoholicBevs = ((data || []) as BeverageNode[]).filter(b => {
                const cat = (b.category || '').toLowerCase();
                const subCat = (b.sub_category || '').toLowerCase();
                return !alcoholicCategories.some(a => cat.includes(a) || subCat.includes(a));
            });
            setBeverages(nonAlcoholicBevs);
        } catch (err) {
            console.error('Error loading beverages:', err);
            setBeverages([]);
            setLoadError(err instanceof Error ? err.message : 'Unable to load beverage inventory.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchBeverages();

        if (supabase) {
            const channel = supabase
                .channel('realtime_admin_beverages')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    fetchBeverages();
                })
                .subscribe();

            return () => {
                if (supabase) supabase.removeChannel(channel);
            };
        }
    }, [fetchBeverages]);

    const handleCreateBeverage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setSaving(true);
        try {
            const pairings = form.pairings.split(',').map(s => s.trim()).filter(Boolean);

            const payload = {
                name: form.name.trim(),
                brand: form.brand.trim() || 'BAR OS',
                category: form.category,
                sub_category: form.category,
                price: Number(form.price),
                stock: Number(form.stock),
                size_label: form.size_label,
                is_ice_cold: Boolean(form.temperature),
                temperature_celsius: form.temperature ? Number(form.temperature) : null,
                is_available_now: true,
                beverage_specs: {
                    pairings: pairings
                },
                image_url: form.image_url.trim() || null
            };

            const { data, error } = await supabase.from('products').insert([payload]).select();
            if (error) throw error;

            await logAuditAction(email, 'CREATE_BEVERAGE', { name: form.name });
            setIsAddModalOpen(false);
            setForm({
                name: '',
                brand: 'BAR OS Originals',
                category: 'Soft Drinks',
                size_label: '500ml',
                price: '',
                stock: '0',
                temperature: '',
                image_url: '',
                pairings: 'Smocha Deluxe, Chips Masala'
            });

            if (data) {
                setBeverages([data[0] as unknown as BeverageNode, ...beverages]);
            }
            alert("Beverage Node deployed live to Storefront! ❄️");
        } catch (err: unknown) {
            alert(`Deployment failed: ${(err as Error).message}`);
        } finally {
            setSaving(false);
        }
    };

    const toggleAvailability = async (id: string | number, current?: boolean) => {
        if (!supabase) return;
        const nextState = current === false;
        const { error } = await supabase.from('products').update({ is_available_now: nextState }).eq('id', id);
        if (!error) {
            setBeverages(prev => prev.map(b => b.id === id ? { ...b, is_available_now: nextState } : b));
        }
    };

    const handleDelete = async (id: string | number) => {
        if (!supabase || !confirm("Expel this beverage node from inventory?")) return;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (!error) {
            setBeverages(prev => prev.filter(b => b.id !== id));
            await logAuditAction(email, 'DELETE_BEVERAGE', { id });
        }
    };

    const filteredBeverages = beverages.filter(b => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (b.name || '').toLowerCase().includes(q) || (b.category || '').toLowerCase().includes(q) || (b.brand || '').toLowerCase().includes(q);
    });

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            {/* HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Snowflake className="h-4 w-4 text-cyan-500 animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-600">BEVERAGE VAULT — INVENTORY CONTROL</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Beverage Vault</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Manage cold drinks, juices, energy, coffee, wines, whiskies, and food pairings.</p>
                </div>
                <div className="flex gap-4">
                    <Button onClick={() => setIsAddModalOpen(true)} className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
                        <Plus size={16} className="mr-2" /> Upload Beverage
                    </Button>
                    <Button onClick={fetchBeverages} variant="outline" className="h-12 px-4 rounded-xl border-slate-200 bg-white font-black uppercase text-[8px] tracking-widest">
                        <RefreshCcw size={14} className={cn("mr-2", loading && "animate-spin")} /> Re-Sync
                    </Button>
                </div>
            </header>

            {/* METRICS HUD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Beverage Nodes</p>
                    <p className="text-3xl font-black text-foreground">{beverages.length}</p>
                </Card>
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-cyan-600 tracking-widest">Chilled Products</p>
                    <p className="text-3xl font-black text-cyan-600">{beverages.filter(beverage => beverage.is_ice_cold).length}</p>
                </Card>
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-amber-600 tracking-widest">In-stock Products</p>
                    <p className="text-3xl font-black text-amber-600">{beverages.filter(beverage => Number(beverage.stock) > 0).length}</p>
                </Card>
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Available Now</p>
                    <p className="text-xl font-black text-emerald-600 uppercase italic mt-1">{beverages.filter(beverage => beverage.is_available_now !== false).length}</p>
                </Card>
            </div>

            {/* SEARCH & INVENTORY TABLE */}
            <Card className="rounded-[3rem] bg-white border border-slate-100 shadow-sm overflow-hidden">
                {loadError && <p role="alert" className="m-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{loadError}</p>}
                <div className="p-8 border-b border-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Coffee className="h-6 w-6 text-primary" />
                        <h3 className="text-lg font-black uppercase text-foreground">Active Beverage Inventory</h3>
                    </div>
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search beverages..."
                            className="h-10 pl-10 rounded-xl bg-slate-50 border-none text-xs font-bold"
                        />
                    </div>
                </div>

                {loading && beverages.length === 0 ? (
                    <div className="py-24 text-center"><Loader2 className="animate-spin h-10 w-10 text-primary mx-auto" /></div>
                ) : filteredBeverages.length === 0 ? (
                    <div className="py-24 text-center text-slate-300">
                        <Layers size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-[10px] font-black uppercase tracking-widest italic">No beverage products match this search.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {filteredBeverages.map(bev => {
                            const img = bev.image_url || bev.image || '';
                            const isLive = bev.is_available_now !== false;

                            return (
                                <div key={bev.id} className="p-6 sm:p-8 flex items-center justify-between group hover:bg-slate-50 transition-all">
                                    <div className="flex items-center gap-6">
                                        <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden flex items-center justify-center shrink-0">
                                            {img ? (
                                                <Image src={normalizeImage(img)} alt={bev.name} fill className="object-contain p-2" />
                                            ) : (
                                                <Snowflake size={22} className="text-cyan-500" />
                                            )}
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <div className="flex items-center gap-3">
                                                <p className="text-sm font-black uppercase text-foreground tracking-tight">{bev.name}</p>
                                                <span className={cn(
                                                    "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border",
                                                    isLive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                                )}>
                                                    {isLive ? '🟢 Live Storefront' : '🔴 Deactivated'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                {bev.brand || 'BAR OS'} &bull; {bev.category} &bull; Size: <span className="text-foreground font-black">{bev.size_label || '500ml'}</span> &bull; Stock: <span className="text-foreground font-black">{bev.stock ?? 50} units</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-lg font-black text-primary">{formatPrice(bev.price)}</span>
                                        <Button
                                            onClick={() => toggleAvailability(bev.id, bev.is_available_now)}
                                            variant="outline"
                                            className={cn(
                                                "h-10 px-4 rounded-xl font-black uppercase text-[8px] tracking-widest",
                                                isLive ? "border-slate-200 text-slate-700" : "bg-emerald-500 text-white border-none"
                                            )}
                                        >
                                            {isLive ? 'Deactivate' : 'Activate'}
                                        </Button>
                                        <Button onClick={() => handleDelete(bev.id)} variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl">
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* UPLOAD BEVERAGE MODAL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <Card className="max-w-lg w-full bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl p-8 sm:p-10 space-y-6 relative text-left max-h-[90vh] overflow-y-auto no-scrollbar">
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">BEVERAGE VAULT INGESTION</span>
                            <h3 className="text-3xl font-black uppercase tracking-tighter text-foreground">Upload New Beverage</h3>
                        </div>

                        <form onSubmit={handleCreateBeverage} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Beverage Name</label>
                                <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Coca-Cola Original" className="h-12 rounded-xl bg-slate-50 border-none font-bold" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Brand</label>
                                    <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Coca-Cola Company" className="h-12 rounded-xl bg-slate-50 border-none font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Category</label>
                                    <select
                                        value={form.category}
                                        onChange={e => setForm({ ...form, category: e.target.value })}
                                        className="w-full h-12 rounded-xl bg-slate-50 border-none px-3 text-xs font-bold"
                                    >
                                        <option value="Soft Drinks">Soft Drinks</option>
                                        <option value="Energy">Energy Drinks</option>
                                        <option value="Water">Mineral Water</option>
                                        <option value="Juices">Fresh Juices</option>
                                        <option value="Coffee">Coffee & Tea</option>
                                        <option value="Mixers">Cocktail Mixers</option>
                                        <option value="Vintages & Spirits">Vintages & Spirits</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Price (Ksh)</label>
                                    <Input type="number" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="120" className="h-12 rounded-xl bg-slate-50 border-none font-black text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Size Label</label>
                                    <Input value={form.size_label} onChange={e => setForm({ ...form, size_label: e.target.value })} placeholder="500ml" className="h-12 rounded-xl bg-slate-50 border-none font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Stock Units</label>
                                    <Input type="number" required value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="100" className="h-12 rounded-xl bg-slate-50 border-none font-bold" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Image URL</label>
                                <Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." className="h-12 rounded-xl bg-slate-50 border-none text-xs" />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Food Pairings (CSV)</label>
                                <Textarea value={form.pairings} onChange={e => setForm({ ...form, pairings: e.target.value })} placeholder="Smocha Deluxe, Chips Masala, Burgers" className="rounded-xl bg-slate-50 border-none font-medium text-xs resize-none p-3" rows={2} />
                            </div>

                            <Button type="submit" disabled={saving} className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl">
                                {saving ? <Loader2 className="animate-spin h-5 w-5" /> : <><CheckCircle2 size={16} className="mr-2" /> Deploy Beverage to Store</>}
                            </Button>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
