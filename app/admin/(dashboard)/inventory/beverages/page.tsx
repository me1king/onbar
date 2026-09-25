'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Coffee,
    Plus,
    RefreshCcw,
    Sparkles,
    Snowflake,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Layers,
    Trash2
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';

interface BeverageNode {
    id: string;
    name: string;
    brand: string;
    category: string;
    price: number;
    stock: number;
    is_ice_cold: boolean;
    temperature_celsius: number;
}

export default function BeverageCommandAdmin() {
    const { email } = useAdmin();
    const [beverages, setBeverages] = React.useState<BeverageNode[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [form, setForm] = React.useState({
        name: '',
        brand: '',
        category: 'Soft Drink',
        price: '80',
        stock: '100',
        temperature: '4.0',
        pairings: 'Smokie Classic, Chips Masala'
    });

    const fetchBeverages = React.useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data } = await supabase.from('products').select('*').eq('category', 'beverage').order('created_at', { ascending: false });
            if (data) setBeverages(data as unknown as BeverageNode[]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchBeverages();
    }, [fetchBeverages]);

    const handleCreateBeverage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                brand: form.brand.trim() || 'BAR OS',
                category: 'beverage',
                sub_category: form.category,
                price: Number(form.price),
                stock: Number(form.stock),
                is_ice_cold: true,
                temperature_celsius: Number(form.temperature),
                beverage_specs: {
                    pairings: form.pairings.split(',').map(s => s.trim())
                },
                image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&q=80'
            };

            const { error } = await supabase.from('products').insert([payload]);
            if (error) throw error;

            await logAuditAction(email, 'CREATE_BEVERAGE', { name: form.name });
            setIsAddModalOpen(false);
            setForm({ name: '', brand: '', category: 'Soft Drink', price: '80', stock: '100', temperature: '4.0', pairings: 'Smokie Classic' });
            fetchBeverages();
            alert("Beverage Node successfully deployed to Chill Grid! ❄️");
        } catch (err: unknown) {
            alert(`Deployment failed: ${(err as Error).message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!supabase || !confirm("Expel this beverage node from the inventory?")) return;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (!error) {
            setBeverages(prev => prev.filter(b => b.id !== id));
            await logAuditAction(email, 'DELETE_BEVERAGE', { id });
        }
    };

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            {/* HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Snowflake className="h-4 w-4 text-cyan-500 animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-600">Chill Logistics Hub</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Beverage Command™</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Manage non-alcoholic cold drinks, Chill Meter™ temperature sensors, and food pairings.</p>
                </div>
                <div className="flex gap-4">
                    <Button onClick={() => setIsAddModalOpen(true)} className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
                        <Plus size={16} className="mr-2" /> Add Beverage Node
                    </Button>
                    <Button onClick={fetchBeverages} variant="outline" className="h-12 px-4 rounded-xl border-slate-200 bg-white font-black uppercase text-[8px] tracking-widest">
                        <RefreshCcw size={14} className={cn("mr-2", loading && "animate-spin")} /> Re-Sync
                    </Button>
                </div>
            </header>

            {/* METRICS HUD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Beverages</p>
                    <p className="text-3xl font-black text-foreground">248</p>
                </Card>
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-cyan-600 tracking-widest">Cold Stock (4°C)</p>
                    <p className="text-3xl font-black text-cyan-600">96</p>
                </Card>
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-amber-600 tracking-widest">Low Stock Alert</p>
                    <p className="text-3xl font-black text-amber-600">18</p>
                </Card>
                <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm space-y-2">
                    <p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">Chill Grid Status</p>
                    <p className="text-xl font-black text-emerald-600 uppercase italic mt-1">Stable & Chilled</p>
                </Card>
            </div>

            {/* INVENTORY TABLE */}
            <Card className="rounded-[3rem] bg-white border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Coffee className="h-6 w-6 text-primary" />
                        <h3 className="text-lg font-black uppercase text-foreground">Active Beverage Inventory</h3>
                    </div>
                    <span className="text-[10px] font-black uppercase text-slate-400">{beverages.length} Nodes Online</span>
                </div>
                {loading && beverages.length === 0 ? (
                    <div className="py-24 text-center"><Loader2 className="animate-spin h-10 w-10 text-primary mx-auto" /></div>
                ) : beverages.length === 0 ? (
                    <div className="py-24 text-center text-slate-300">
                        <Layers size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-[10px] font-black uppercase tracking-widest italic">&quot;No beverage nodes initialized yet. Click 'Add Beverage Node' to start.&quot;</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {beverages.map(bev => (
                            <div key={bev.id} className="p-6 sm:p-8 flex items-center justify-between group hover:bg-slate-50 transition-all">
                                <div className="flex items-center gap-6">
                                    <div className="h-14 w-14 rounded-2xl bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center font-black">
                                        <Snowflake size={22} />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-3">
                                            <p className="text-sm font-black uppercase text-foreground tracking-tight">{bev.name}</p>
                                            <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-cyan-50 text-cyan-700 border border-cyan-100">
                                                ❄ {bev.temperature_celsius || 4}°C ICE COLD
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                            {bev.brand} &bull; {bev.category} &bull; Stock: <span className="text-foreground font-black">{bev.stock} units</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-lg font-black text-primary">{formatPrice(bev.price)}</span>
                                    <Button onClick={() => handleDelete(bev.id)} variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl">
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ADD BEVERAGE MODAL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-background/20 backdrop-blur-md p-6">
                    <Card className="max-w-xl w-full bg-white rounded-[3.5rem] border border-border shadow-2xl p-10 space-y-8 animate-in zoom-in-95 duration-300 text-left">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-6">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><Sparkles size={24} /></div>
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground">Beverage Forge Modal</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsAddModalOpen(false)} className="rounded-full">✕</Button>
                        </div>

                        <form onSubmit={handleCreateBeverage} className="space-y-6">
                            <div className="grid sm:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Beverage Name</label>
                                    <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Coca-Cola" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Brand</label>
                                    <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Coca-Cola Company" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Category</label>
                                    <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Soft Drink" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Price (Ksh)</label>
                                    <Input type="number" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="80" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-black text-primary" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Stock Units</label>
                                    <Input type="number" required value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="100" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400">Food Pairings (CSV)</label>
                                <Textarea value={form.pairings} onChange={e => setForm({ ...form, pairings: e.target.value })} placeholder="Smokie Classic, Chips Masala, Burger" className="rounded-2xl bg-slate-50 border-slate-100 font-medium text-xs resize-none p-4" />
                            </div>

                            <Button type="submit" disabled={saving} className="w-full h-16 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-2xl shadow-primary/20">
                                {saving ? <Loader2 className="animate-spin h-5 w-5" /> : 'Deploy Beverage Node'}
                            </Button>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
