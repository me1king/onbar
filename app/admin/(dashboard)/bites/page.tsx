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
    X,
    CheckCircle2,
    Truck,
    ImagePlus,
    Pencil,
    ToggleLeft,
    ToggleRight
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
    stock: number | null;
    status: string;
    image_url: string;
    category: string;
    description?: string;
    pairing_suggestions?: string[];
    is_available_now?: boolean;
}

interface FoodAddon {
    id: string;
    name: string;
    price: number;
    is_active: boolean;
}

interface OrderTimelineItem {
    id: string;
    items: string;
    statusText: string;
    timeLabel: string;
    badgeColor: string;
}

export default function BiteCommandCenter() {
    const [bites, setBites] = React.useState<BiteProduct[]>([]);
    const [timeline, setTimeline] = React.useState<OrderTimelineItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [addons, setAddons] = React.useState<FoodAddon[]>([]);
    const [isAddonManagerOpen, setIsAddonManagerOpen] = React.useState(false);
    const [addonDraft, setAddonDraft] = React.useState<{ id?: string; name: string; price: string }>({ name: '', price: '' });
    const [addonError, setAddonError] = React.useState<string | null>(null);
    const [addonSaving, setAddonSaving] = React.useState(false);

    // New Food Item Form State
    const [newFood, setNewFood] = React.useState({
        name: '',
        category: '',
        price: '',
        stock: '',
        image_url: '',
        description: '',
        pairing_suggestions: ''
    });

    const imagePreviewUrl = React.useMemo(
        () => imageFile ? URL.createObjectURL(imageFile) : null,
        [imageFile]
    );

    React.useEffect(() => {
        return () => {
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        };
    }, [imagePreviewUrl]);

    const [stats, setStats] = React.useState({
        cooking: 0,
        avgPrep: null as number | null,
        dispatchReady: 0,
        kitchenLoad: 'Unavailable'
    });

    const fetchBites = React.useCallback(async () => {
        if (!supabase) {
            setError('Supabase is not configured. Food and order data are unavailable.');
            setBites([]);
            setTimeline([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error: productsError } = await supabase
                .from('products')
                .select('*')
                .or('is_bite.eq.true,is_snack.eq.true')
                .order('name');

            if (productsError) throw productsError;
            setBites((data || []) as BiteProduct[]);

            const { data: ordData, error: ordersError } = await supabase
                .from('orders')
                .select('id, total_price, status, created_at')
                .order('created_at', { ascending: false })
                .limit(50);
            if (ordersError) throw ordersError;

            const orderRecords = ordData || [];
            setTimeline(orderRecords.slice(0, 5).map(ord => {
                const status = String(ord.status || 'Unknown');
                return {
                    id: `#${ord.id}`,
                    items: `Order #${ord.id}`,
                    statusText: `Status: ${status} • Value: ${ord.total_price == null ? 'Not recorded' : formatPrice(Number(ord.total_price))}`,
                    timeLabel: ord.created_at ? new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Time not recorded',
                    badgeColor: status.toUpperCase() === 'PREPARING' ? 'bg-amber-500 text-white' : status.toUpperCase() === 'PACKED' ? 'bg-indigo-500 text-white' : 'bg-slate-500 text-white'
                };
            }));
            setStats({
                cooking: orderRecords.filter(order => String(order.status).toUpperCase() === 'PREPARING').length,
                avgPrep: null,
                dispatchReady: orderRecords.filter(order => String(order.status).toUpperCase() === 'PACKED').length,
                kitchenLoad: 'Unavailable'
            });
        } catch (err) {
            console.error("Bite Link Failure:", err);
            setBites([]);
            setTimeline([]);
            setError(err instanceof Error ? err.message : 'Unable to load food and order data.');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchAddons = React.useCallback(async () => {
        try {
            const response = await fetch('/api/admin/food-addons', { cache: 'no-store' });
            const result = await response.json() as { addons?: FoodAddon[]; error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not load meal extras.');
            setAddons(result.addons || []);
            setAddonError(null);
        } catch (err) {
            console.error('[BiteCommand] Could not load meal extras:', err);
            setAddonError(err instanceof Error ? err.message : 'Could not load meal extras.');
        }
    }, []);

    React.useEffect(() => {
        fetchBites();
        fetchAddons();

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
    }, [fetchBites, fetchAddons]);

    const toggleAvailability = async (id: number | string, current: boolean) => {
        if (!supabase) return;
        const status = current ? 'Draft' : 'Live';
        const { error: updateError } = await supabase.from('products').update({
            status,
            is_available_now: !current
        }).eq('id', id);
        if (updateError) {
            alert(`Unable to update product status: ${updateError.message}`);
        } else {
            setBites(bites.map(b => b.id === id ? { ...b, status, is_available_now: !current } : b));
        }
    };

    const handleDelete = async (id: number | string) => {
        if (!supabase) return;
        if (!confirm('Are you sure you want to remove this food item from the menu?')) return;
        const { error: deleteError } = await supabase.from('products').delete().eq('id', id);
        if (deleteError) {
            alert(`Unable to remove food item: ${deleteError.message}`);
        } else {
            setBites(bites.filter(b => b.id !== id));
        }
    };

    const handleCreateBite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFood.name.trim() || !newFood.category || !newFood.price || !newFood.stock) {
            alert('Please provide a name, category, price, and stock quantity.');
            return;
        }
        if (!supabase) {
            alert('Supabase is not configured. The food item was not saved.');
            return;
        }

        setIsSubmitting(true);
        const pairings = newFood.pairing_suggestions.split(',').map(s => s.trim()).filter(Boolean);
        let uploadedPath: string | null = null;

        try {
            let imageUrl = newFood.image_url.trim();
            if (imageFile) {
                const form = new FormData();
                form.set('file', imageFile);
                const response = await fetch('/api/admin/food-image', { method: 'POST', body: form });
                const result = await response.json() as { path?: string; image_url?: string; error?: string };
                if (!response.ok || !result.path || !result.image_url) {
                    throw new Error(result.error || 'Food photo upload failed.');
                }
                uploadedPath = result.path;
                imageUrl = result.image_url;
            }

            const payload = {
                name: newFood.name.trim(),
                category: newFood.category,
                price: Number(newFood.price),
                stock: Number(newFood.stock),
                image_url: imageUrl || null,
                description: newFood.description.trim() || null,
                pairing_suggestions: pairings,
                is_snack: true,
                is_bite: true,
                status: 'Live',
                is_available_now: true
            };
            const { data, error: insertError } = await supabase.from('products').insert([payload]).select().single();
            if (insertError) throw new Error(`Error adding food item: ${insertError.message}`);
            if (!data) throw new Error('Food item was not returned after saving.');
            setBites([data as BiteProduct, ...bites]);
            setIsAddModalOpen(false);
            setNewFood({
                name: '',
                category: '',
                price: '',
                stock: '',
                image_url: '',
                description: '',
                pairing_suggestions: ''
            });
            setImageFile(null);
        } catch (insertError) {
            console.error('Unable to add food item:', insertError);
            if (uploadedPath) {
                const cleanupResponse = await fetch('/api/admin/food-image', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: uploadedPath })
                });
                if (!cleanupResponse.ok) {
                    const cleanupResult = await cleanupResponse.json() as { error?: string };
                    console.error('Unable to remove unlinked food image:', cleanupResult.error || cleanupResponse.statusText);
                }
            }
            alert(insertError instanceof Error ? insertError.message : 'Unable to add food item because the request failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const saveAddon = async (event: React.FormEvent) => {
        event.preventDefault();
        const price = Number(addonDraft.price);
        if (!addonDraft.name.trim() || !Number.isFinite(price) || price < 0) {
            setAddonError('Enter an add-on name and a valid non-negative price.');
            return;
        }
        setAddonSaving(true);
        setAddonError(null);
        try {
            const response = await fetch('/api/admin/food-addons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...addonDraft, name: addonDraft.name.trim(), price })
            });
            const result = await response.json() as { addon?: FoodAddon; error?: string };
            if (!response.ok || !result.addon) throw new Error(result.error || 'Could not save meal extra.');
            setAddonDraft({ name: '', price: '' });
            await fetchAddons();
        } catch (err) {
            console.error('[BiteCommand] Could not save meal extra:', err);
            setAddonError(err instanceof Error ? err.message : 'Could not save meal extra.');
        } finally {
            setAddonSaving(false);
        }
    };

    const toggleAddon = async (addon: FoodAddon) => {
        setAddonSaving(true);
        setAddonError(null);
        try {
            const response = await fetch('/api/admin/food-addons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...addon, is_active: !addon.is_active })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not update meal extra.');
            await fetchAddons();
        } catch (err) {
            console.error('[BiteCommand] Could not update meal extra:', err);
            setAddonError(err instanceof Error ? err.message : 'Could not update meal extra.');
        } finally {
            setAddonSaving(false);
        }
    };

    const deleteAddon = async (id: string) => {
        if (!confirm('Delete this meal extra from the menu?')) return;
        setAddonSaving(true);
        setAddonError(null);
        try {
            const response = await fetch(`/api/admin/food-addons?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not delete meal extra.');
            await fetchAddons();
        } catch (err) {
            console.error('[BiteCommand] Could not delete meal extra:', err);
            setAddonError(err instanceof Error ? err.message : 'Could not delete meal extra.');
        } finally {
            setAddonSaving(false);
        }
    };
    return (
        <div
            className="w-full min-w-0 overflow-x-hidden p-4 sm:p-6 lg:p-8 space-y-8 lg:space-y-12 min-h-screen text-left pb-32 selection:bg-primary/20 animate-in fade-in duration-700 relative"
            style={{
                background: 'radial-gradient(circle at top right, rgba(245, 160, 0, 0.08), transparent 45%), radial-gradient(circle at bottom left, rgba(30, 58, 138, 0.08), transparent 45%), #F8FAFC'
            }}
        >

            {/* BITE HEADER (HERO LIVE OPERATIONS) */}
            <header className="flex min-w-0 flex-col xl:flex-row justify-between items-start xl:items-end gap-6 lg:gap-10 border-b border-slate-200/80 pb-8 lg:pb-10 relative z-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Utensils className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary italic">Food Menu Management</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Bite <span className="text-primary italic">Command.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium italic">
                        Manage food products, availability, pricing, and stock.
                    </p>
                </div>
                <div className="flex w-full xl:w-auto flex-col sm:flex-row flex-wrap gap-3">
                    <Button
                        onClick={() => { setIsAddonManagerOpen(true); setAddonDraft({ name: '', price: '' }); }}
                        variant="outline"
                        className="w-full sm:w-auto rounded-2xl h-12 sm:h-14 px-4 sm:px-6 bg-white border-slate-200 font-black uppercase text-[10px] tracking-widest"
                    >
                        <Utensils size={16} className="mr-2" /> Manage Meal Extras
                    </Button>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="w-full sm:w-auto rounded-2xl h-12 sm:h-14 px-5 sm:px-10 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus size={16} className="mr-3" /> + Add Food Item
                    </Button>
                </div>
            </header>

            {/* LIVE STATS CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 sm:gap-6 relative z-10">
                {[
                    { label: 'Preparing (Latest 50)', val: `${stats.cooking} Orders`, sub: 'Based on recorded order statuses', icon: Flame, color: 'rose' },
                    { label: 'Average Prep Time', val: stats.avgPrep == null ? 'Unavailable' : `${stats.avgPrep} min`, sub: 'Preparation timing is not recorded', icon: Clock, color: 'indigo' },
                    { label: 'Packed (Latest 50)', val: `${stats.dispatchReady} Orders`, sub: 'Based on recorded order statuses', icon: Truck, color: 'amber' },
                    { label: 'Kitchen Load', val: stats.kitchenLoad, sub: 'No station capacity data recorded', icon: Zap, color: 'emerald' },
                ].map(stat => (
                    <Card key={stat.label} className="min-w-0 p-5 sm:p-8 rounded-3xl sm:rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md group hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
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

            {/* RECENT ORDERS */}
            <div className="grid grid-cols-1 gap-8 relative z-10">
                <Card className="min-w-0 p-5 sm:p-8 lg:p-10 rounded-3xl sm:rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 sm:space-y-8 text-left">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-6">
                        <div>
                            <p className="text-primary font-black uppercase text-[10px] tracking-[0.3em]">Order records</p>
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Recent Orders</h2>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {timeline.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-xs uppercase font-bold">No order records found</div>
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
            </div>

            {/* LIVE MENU GRID */}
            <section className="space-y-8 relative z-10">
                <div className="flex justify-between items-center px-1 sm:px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Food Menu</h2>
                </div>

                {error && <p role="alert" className="mx-6 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p>}
                <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 sm:gap-6">
                    {loading ? (
                        <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-primary" size={48} /></div>
                    ) : bites.length === 0 ? (
                        <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                            No food products found. Add a food product to get started.
                        </div>
                    ) : bites.map(bite => (
                        <Card key={bite.id} className="min-w-0 p-4 sm:p-6 lg:p-8 rounded-3xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md hover:shadow-2xl transition-all duration-300 flex flex-col group text-left">
                            <div className="relative aspect-[4/3] w-full rounded-2xl sm:rounded-[2rem] bg-slate-50 border border-slate-100 overflow-hidden mb-5 sm:mb-6 shadow-inner">
                                {bite.image_url ? (
                                    <Image src={normalizeImage(bite.image_url)} alt={bite.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1536px) 50vw, 25vw" className="object-contain p-3 sm:p-4" />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-sm text-slate-400">No product image</div>
                                )}
                                <div className={cn(
                                    "absolute top-4 right-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg",
                                    bite.status === 'Live' ? "bg-emerald-500 text-white" : "bg-slate-500 text-white"
                                )}>
                                    {bite.status || 'Status unavailable'}
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
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Stock</p>
                                        <p className="text-sm font-black text-foreground">{bite.stock ?? 'Not recorded'}</p>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button
                                        onClick={() => toggleAvailability(bite.id, bite.status === 'Live')}
                                        className={cn(
                                            "flex-1 h-12 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all active:scale-95",
                                            bite.status === 'Live' ? "bg-slate-900 text-white hover:bg-primary" : "bg-emerald-500 text-white shadow-emerald-200 shadow-lg"
                                        )}
                                    >
                                        {bite.status === 'Live' ? 'Deactivate' : 'Activate'}
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
                <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-t-3xl sm:rounded-[2.5rem] p-5 sm:p-8 lg:p-10 max-w-lg w-full space-y-5 shadow-2xl relative border border-slate-100 text-left max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] overflow-y-auto overscroll-contain">
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Category</label>
                                    <select
                                        value={newFood.category}
                                        onChange={e => setNewFood({ ...newFood, category: e.target.value })}
                                        className="w-full rounded-xl h-12 bg-slate-50 border-none px-3 text-xs font-bold"
                                    >
                                        <option value="">Select a category</option>
                                        <option value="Food">Food</option>
                                        <option value="Snacks">Snacks</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Price (KSh)</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={newFood.price}
                                        onChange={e => setNewFood({ ...newFood, price: e.target.value })}
                                        placeholder="180"
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Stock quantity</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={newFood.stock}
                                        onChange={e => setNewFood({ ...newFood, stock: e.target.value })}
                                        placeholder="Enter current stock"
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Upload food photo</label>
                                    <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary">
                                        <ImagePlus size={16} />
                                        {imageFile ? imageFile.name : 'Choose image file'}
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="sr-only"
                                            onChange={event => {
                                                const file = event.target.files?.[0];
                                                if (!file) return;
                                                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                                                    alert('Choose a JPG, PNG, or WebP image.');
                                                    event.target.value = '';
                                                    return;
                                                }
                                                if (file.size > 8 * 1024 * 1024) {
                                                    alert('Choose an image smaller than 8 MB.');
                                                    event.target.value = '';
                                                    return;
                                                }
                                                setImageFile(file);
                                            }}
                                        />
                                    </label>
                                    {imageFile && (
                                        <p className="text-[10px] font-medium text-emerald-700">
                                            {Math.ceil(imageFile.size / 1024)} KB · uploads when you publish
                                        </p>
                                    )}
                                    {imagePreviewUrl && (
                                        <div className="relative mt-2 aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                            <Image src={imagePreviewUrl} alt="Selected food photo preview" fill sizes="(max-width: 640px) 100vw, 480px" className="object-contain p-2" unoptimized />
                                        </div>
                                    )}
                                    <label className="block pt-2 text-[9px] font-black uppercase text-slate-400">Or use an image URL</label>
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
                                <label className="text-[10px] font-black uppercase text-slate-400">Pairing suggestions (comma separated)</label>
                                <Input
                                    value={newFood.pairing_suggestions}
                                    onChange={e => setNewFood({ ...newFood, pairing_suggestions: e.target.value })}
                                    placeholder="Optional product or food pairings"
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

            {isAddonManagerOpen && (
                <div className="fixed inset-0 z-[3100] flex items-end sm:items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-md">
                    <Card className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-[2rem] bg-white p-5 sm:p-8 text-left shadow-2xl">
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Customer meal options</p>
                                <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-foreground">Meal Extras & Prices</h2>
                                <p className="mt-2 text-sm text-slate-500">Active extras appear as selectable buttons on meal orders.</p>
                            </div>
                            <button onClick={() => setIsAddonManagerOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="Close meal extras">
                                <X size={18} />
                            </button>
                        </div>

                        {addonError && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{addonError}</p>}

                        <form onSubmit={saveAddon} className="mb-6 grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_130px_auto]">
                            <Input
                                value={addonDraft.name}
                                onChange={event => setAddonDraft(draft => ({ ...draft, name: event.target.value }))}
                                placeholder="e.g. Black pepper"
                                maxLength={80}
                                required
                                className="rounded-xl bg-white"
                            />
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={addonDraft.price}
                                onChange={event => setAddonDraft(draft => ({ ...draft, price: event.target.value }))}
                                placeholder="Price (KSh)"
                                required
                                className="rounded-xl bg-white"
                            />
                            <Button type="submit" disabled={addonSaving} className="rounded-xl bg-primary font-bold text-white">
                                {addonDraft.id ? 'Update' : 'Add'}
                            </Button>
                        </form>

                        {addons.length === 0 ? (
                            <p className="rounded-xl border border-slate-100 p-6 text-center text-sm text-slate-500">
                                {addonError ? 'Meal extras could not be loaded.' : 'No extras added yet. Add black pepper, paprika, chili sauce, or another option above.'}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {addons.map(addon => (
                                    <div key={addon.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-foreground">{addon.name}</p>
                                            <p className="text-xs text-slate-500">{formatPrice(addon.price)} · {addon.is_active ? 'Available to customers' : 'Hidden from customers'}</p>
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" disabled={addonSaving} onClick={() => setAddonDraft({ id: addon.id, name: addon.name, price: String(addon.price) })} aria-label={`Edit ${addon.name}`}>
                                            <Pencil size={16} />
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon" disabled={addonSaving} onClick={() => toggleAddon(addon)} aria-label={`${addon.is_active ? 'Hide' : 'Show'} ${addon.name}`}>
                                            {addon.is_active ? <ToggleRight size={18} className="text-emerald-600" /> : <ToggleLeft size={18} />}
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon" disabled={addonSaving} onClick={() => deleteAddon(addon.id)} aria-label={`Delete ${addon.name}`}>
                                            <Trash2 size={16} className="text-rose-500" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
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
