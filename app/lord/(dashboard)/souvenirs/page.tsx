'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Gift,
    Plus,
    Loader2,
    Trash2,
    X,
    CheckCircle2,
    ImagePlus,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Image from 'next/image';

interface SouvenirProduct {
    id: number | string;
    name: string;
    brand?: string;
    category: string;
    material?: string;
    finish?: string;
    capacity_oz?: number;
    weight_grams?: number;
    price: number;
    old_price?: number;
    stock: number;
    engraving_enabled?: boolean;
    engraving_fee?: number | string;
    gift_packaging_fee?: number | string;
    low_stock_alert?: number;
    is_available_now: boolean;
    image_url: string | null;
    description?: string;
    story?: string;
}

export default function SouvenirForgePage() {
    const [souvenirs, setSouvenirs] = React.useState<SouvenirProduct[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [giftOrdersCount, setGiftOrdersCount] = React.useState<number | null>(null);
    const [topSeller, setTopSeller] = React.useState<{ name: string; quantity: number } | null>(null);
    const [salesReportAvailable, setSalesReportAvailable] = React.useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [savingEngravingId, setSavingEngravingId] = React.useState<number | string | null>(null);
    const [engravingDrafts, setEngravingDrafts] = React.useState<Record<string, { enabled: boolean; engravingFee: string; packagingFee: string }>>({});
    const [engravingSavedId, setEngravingSavedId] = React.useState<number | string | null>(null);
    const [activeCategoryFilter, setActiveCategoryFilter] = React.useState('All');

    // Form values are entered by the admin; do not invent catalog details.
    const [formData, setFormData] = React.useState({
        name: '',
        category: '',
        brand: '',
        material: '',
        finish: '',
        capacity_oz: '',
        weight_grams: '',
        stock: '',
        price: '',
        old_price: '',
        description: '',
        story: '',
        drink_pairings: '',
        engraving_enabled: false,
        engraving_fee: '0',
        gift_packaging_fee: '150'
    });
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!imageFile) {
            setImagePreview(null);
            return;
        }
        const objectUrl = URL.createObjectURL(imageFile);
        setImagePreview(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [imageFile]);

    const fetchSouvenirs = React.useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const response = await fetch('/api/admin/products');
            const result = await response.json() as {
                error?: string;
                products?: SouvenirProduct[];
                giftOrdersCount?: number | null;
                topSeller?: { name: string; quantity: number } | null;
                salesReportAvailable?: boolean;
            };
            if (!response.ok) throw new Error(result.error || 'Unable to load souvenir inventory.');
            const products = result.products || [];
            setSouvenirs(products);
            setEngravingDrafts(Object.fromEntries(products.map(product => [String(product.id), {
                enabled: product.engraving_enabled === true,
                engravingFee: String(product.engraving_fee ?? 0),
                packagingFee: String(product.gift_packaging_fee ?? 150)
            }])));
            setGiftOrdersCount(result.giftOrdersCount ?? null);
            setTopSeller(result.topSeller || null);
            setSalesReportAvailable(result.salesReportAvailable === true);
        } catch (error) {
            console.error('Error fetching souvenirs:', error);
            setSouvenirs([]);
            setLoadError(error instanceof Error ? error.message : 'Unable to load souvenir inventory.');
            setGiftOrdersCount(null);
            setTopSeller(null);
            setSalesReportAvailable(false);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchSouvenirs();

        if (supabase) {
            const productChannel = supabase
                .channel('realtime_admin_souvenirs')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    fetchSouvenirs();
                })
                .subscribe();
            const orderChannel = supabase
                .channel('realtime_admin_souvenir_orders')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                    fetchSouvenirs();
                })
                .subscribe();
            const orderItemsChannel = supabase
                .channel('realtime_admin_souvenir_order_items')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
                    fetchSouvenirs();
                })
                .subscribe();

            return () => {
                if (supabase) {
                    supabase.removeChannel(productChannel);
                    supabase.removeChannel(orderChannel);
                    supabase.removeChannel(orderItemsChannel);
                }
            };
        }
    }, [fetchSouvenirs]);

    const toggleAvailability = async (id: number | string, current: boolean) => {
        try {
            const response = await fetch('/api/admin/products', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: Number(id), product: { is_available_now: !current } })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Availability was not changed.');
            setLoadError(null);
            setSouvenirs(currentItems => currentItems.map(s => s.id === id ? { ...s, is_available_now: !current } : s));
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Availability was not changed.');
        }
    };

    const updateEngravingDraft = (id: number | string, field: 'enabled' | 'engravingFee' | 'packagingFee', value: boolean | string) => {
        setEngravingDrafts(current => ({
            ...current,
            [String(id)]: {
                enabled: current[String(id)]?.enabled ?? false,
                engravingFee: current[String(id)]?.engravingFee ?? '0',
                packagingFee: current[String(id)]?.packagingFee ?? '150',
                [field]: value
            }
        }));
        setEngravingSavedId(null);
    };

    const saveEngravingSettings = async (item: SouvenirProduct) => {
        const draft = engravingDrafts[String(item.id)];
        const engravingFee = Number(draft?.engravingFee);
        const giftPackagingFee = Number(draft?.packagingFee);
        if (!draft || !Number.isFinite(engravingFee) || engravingFee < 0
            || !Number.isFinite(giftPackagingFee) || giftPackagingFee < 0) {
            setLoadError('Engraving and gift-packaging fees must be valid non-negative amounts.');
            return;
        }
        setSavingEngravingId(item.id);
        setLoadError(null);
        try {
            const response = await fetch('/api/admin/products', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: Number(item.id),
                    product: {
                        engraving_enabled: draft.enabled,
                        engraving_fee: engravingFee,
                        gift_packaging_fee: giftPackagingFee
                    }
                })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Engraving settings could not be saved.');
            setSouvenirs(current => current.map(product => product.id === item.id ? {
                ...product,
                engraving_enabled: draft.enabled,
                engraving_fee: engravingFee,
                gift_packaging_fee: giftPackagingFee
            } : product));
            setEngravingSavedId(item.id);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Engraving settings could not be saved.');
        } finally {
            setSavingEngravingId(null);
        }
    };

    const handleDelete = async (id: number | string) => {
        if (!confirm('Are you sure you want to remove this souvenir from the catalogue?')) return;
        try {
            const response = await fetch('/api/admin/products', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: Number(id) })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'The souvenir was not removed.');
            setLoadError(null);
            setSouvenirs(items => items.filter(s => s.id !== id));
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'The souvenir was not removed.');
        }
    };

    const handleCreateSouvenir = async (e: React.FormEvent) => {
        e.preventDefault();
        const price = Number(formData.price);
        const stock = Number(formData.stock);
        const oldPrice = formData.old_price ? Number(formData.old_price) : null;
        const capacity = formData.capacity_oz ? Number(formData.capacity_oz) : null;
        const weight = formData.weight_grams ? Number(formData.weight_grams) : null;
        const engravingFee = Number(formData.engraving_fee);
        const packagingFee = Number(formData.gift_packaging_fee);
        if (
            !formData.name.trim() || !formData.category ||
            !Number.isFinite(price) || price <= 0 ||
            !Number.isInteger(stock) || stock < 0 ||
            (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice <= price)) ||
            (capacity !== null && (!Number.isFinite(capacity) || capacity <= 0)) ||
            (weight !== null && (!Number.isFinite(weight) || weight <= 0)) ||
            !Number.isFinite(engravingFee) || engravingFee < 0 ||
            !Number.isFinite(packagingFee) || packagingFee < 0
        ) {
            setLoadError('Enter a name, category, positive price, non-negative stock and engraving fees, and valid optional dimensions and original price.');
            return;
        }

        setIsSubmitting(true);
        const pairings = formData.drink_pairings.split(',').map(s => s.trim()).filter(Boolean);

        let uploadedPath: string | null = null;
        try {
            let imageUrl: string | null = null;
            if (imageFile) {
                const imageForm = new FormData();
                imageForm.append('file', imageFile);
                const uploadResponse = await fetch('/api/admin/product-image', {
                    method: 'POST',
                    body: imageForm
                });
                const uploadResult = await uploadResponse.json() as { error?: string; path?: string; image_url?: string };
                if (!uploadResponse.ok) throw new Error(uploadResult.error || 'The product image could not be uploaded.');
                if (!uploadResult.path || !uploadResult.image_url) {
                    throw new Error('The image service did not return the uploaded image details.');
                }
                uploadedPath = uploadResult.path;
                imageUrl = uploadResult.image_url;
            }

            const payload = {
                name: formData.name.trim(),
                category: formData.category,
                brand: formData.brand.trim() || null,
                material: formData.material.trim() || null,
                finish: formData.finish.trim() || null,
                capacity_oz: capacity,
                weight_grams: weight,
                price,
                old_price: oldPrice,
                image_url: imageUrl,
                description: formData.description.trim() || null,
                story: formData.story.trim() || null,
                drink_pairings: pairings,
                is_souvenir: true,
                is_available_now: stock > 0,
                stock,
                ...(formData.engraving_enabled ? {
                    engraving_enabled: true,
                    engraving_fee: engravingFee,
                    gift_packaging_fee: packagingFee
                } : {})
            };
            const response = await fetch('/api/admin/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product: payload })
            });
            const result = await response.json() as { error?: string; id?: number };
            if (!response.ok) throw new Error(result.error || 'The souvenir could not be saved.');
            if (!Number.isSafeInteger(result.id)) throw new Error('The database did not return the saved product ID.');
            uploadedPath = null;
            setIsAddModalOpen(false);
            setImageFile(null);
            setFormData({
                name: '', category: '', brand: '', material: '', finish: '', capacity_oz: '',
                weight_grams: '', stock: '', price: '', old_price: '', description: '',
                story: '', drink_pairings: '', engraving_enabled: false, engraving_fee: '0',
                gift_packaging_fee: '150'
            });
            await fetchSouvenirs();
        } catch (err) {
            console.error('Souvenir save error:', err);
            setLoadError(err instanceof Error ? err.message : 'Unable to save the souvenir.');
            if (uploadedPath) {
                try {
                    const cleanupResponse = await fetch('/api/admin/product-image', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: uploadedPath })
                    });
                    if (!cleanupResponse.ok) {
                        const cleanupResult = await cleanupResponse.json() as { error?: string };
                        console.error('Unable to remove unlinked souvenir image:', cleanupResult.error || cleanupResponse.statusText);
                    }
                } catch (cleanupError) {
                    console.error('Unable to remove unlinked souvenir image:', cleanupError);
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredSouvenirs = souvenirs.filter(s => {
        if (activeCategoryFilter === 'All') return true;
        return (s.category || '').toLowerCase().includes(activeCategoryFilter.toLowerCase());
    });
    const collections = Array.from(new Set(souvenirs.map(item => item.category).filter(Boolean))).map(category => ({
        category,
        title: category,
        count: souvenirs.filter(item => item.category === category).length,
        image: souvenirs.find(item => item.category === category && item.image_url)?.image_url
    }));
    const lowStockCount = souvenirs.filter(item => Number(item.stock ?? 0) <= Number(item.low_stock_alert ?? 5)).length;

    return (
        <div
            className="p-4 sm:p-8 space-y-8 sm:space-y-12 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700 relative overflow-hidden"
            style={{
                background: 'radial-gradient(circle at top right, rgba(245, 160, 0, 0.08), transparent 45%), radial-gradient(circle at bottom left, rgba(30, 58, 138, 0.08), transparent 45%), #F8FAFC'
            }}
        >

            {/* SOUVENIR FORGE HERO HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200/80 pb-10 relative z-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Gift className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary italic">LIMITED MERCH PROTOCOL</span>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[8px] font-black uppercase tracking-widest">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Catalog: {loading ? 'Loading' : loadError ? 'Unavailable' : 'Loaded'}
                        </div>
                    </div>
                    <h1 className="text-4xl lg:text-6xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Souvenir <span className="text-primary italic">Forge.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Craft &bull; Personalize &bull; Dispatch &bull; Merch & Collectibles Command Center.</p>
                </div>
                <div className="flex w-full sm:w-auto shrink-0">
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="w-full sm:w-auto rounded-2xl h-12 sm:h-14 px-5 sm:px-10 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all"
                    >
                        <Plus size={16} className="mr-3" /> + Add New Souvenir
                    </Button>
                </div>
            </header>

            {loadError && <p role="alert" className="relative z-10 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{loadError}</p>}

            {/* LIVE MERCH STATS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-8 relative z-10">
                {[
                    { label: 'Merch Items', val: loading ? 'Loading' : loadError ? 'Unavailable' : souvenirs.length.toLocaleString(), sub: 'Loaded from product catalog', icon: Gift, color: 'indigo' },
                    { label: 'Low Stock', val: loading ? 'Loading' : loadError ? 'Unavailable' : lowStockCount.toLocaleString(), sub: 'Products at or below their stock alert', icon: Gift, color: 'rose' },
                    { label: 'Gift Orders', val: giftOrdersCount === null ? 'Unavailable' : giftOrdersCount.toLocaleString(), sub: giftOrdersCount === null ? 'Gift order count unavailable' : 'Recorded gift orders', icon: Gift, color: 'emerald' },
                    { label: 'Top Seller', val: !salesReportAvailable ? 'Unavailable' : topSeller?.name || 'No sales yet', sub: topSeller ? `${topSeller.quantity.toLocaleString()} units sold on delivered orders` : salesReportAvailable ? 'No delivered souvenir sales' : 'Delivered souvenir sales report unavailable', icon: Gift, color: 'amber' },
                ].map(stat => (
                    <Card key={stat.label} className="min-w-0 p-4 sm:p-8 rounded-2xl sm:rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md group">
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
                        <h3 className="text-xl sm:text-3xl font-black uppercase tracking-tight text-foreground tabular-nums break-words">{stat.val}</h3>
                        <p className="text-[9px] sm:text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-2">{stat.sub}</p>
                    </Card>
                ))}
            </div>

            {/* COLLECTIONS QUICK JUMP GRID */}
            <section className="space-y-6 relative z-10">
                <div className="flex justify-between items-center px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Collections Vault</h2>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Category Filter</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {collections.length === 0 && !loading && (
                        <p className="col-span-full rounded-2xl bg-white p-6 text-sm font-bold text-slate-500">
                            {loadError ? 'Collections could not be loaded.' : 'No souvenir collections are in the product catalog yet.'}
                        </p>
                    )}
                    {collections.map(col => (
                        <button
                            key={col.category}
                            onClick={() => setActiveCategoryFilter(activeCategoryFilter === col.category ? 'All' : col.category)}
                            className={cn(
                                "p-5 rounded-[2.5rem] bg-white border text-left transition-all duration-300 group flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 relative overflow-hidden",
                                activeCategoryFilter === col.category ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-slate-200/80"
                            )}
                        >
                            <div className="relative aspect-square w-full rounded-2xl bg-slate-50 overflow-hidden mb-3">
                                {col.image && <Image src={normalizeImage(col.image)} alt={col.title} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />}
                            </div>
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-black uppercase tracking-tight text-foreground line-clamp-1">{col.title}</h4>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{col.count} items</p>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            {/* LIVE MERCH GRID */}
            <section className="space-y-8 relative z-10">
                <div className="flex justify-between items-center px-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">
                        Live Collectibles Catalogue {activeCategoryFilter !== 'All' ? `(${activeCategoryFilter})` : ''}
                    </h2>
                    {activeCategoryFilter !== 'All' && (
                        <Button onClick={() => setActiveCategoryFilter('All')} variant="ghost" className="text-[10px] font-black uppercase text-primary">
                            Clear Filter
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {loading ? (
                        <div className="col-span-full py-40 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-primary" size={48} /></div>
                    ) : filteredSouvenirs.length === 0 ? (
                        <p className="col-span-full py-16 text-center text-sm font-bold text-slate-500">
                            {loadError ? 'Souvenirs could not be loaded.' : 'No souvenir products match this filter.'}
                        </p>
                    ) : filteredSouvenirs.map(item => (
                        <Card key={item.id} className="min-w-0 p-4 sm:p-8 rounded-2xl sm:rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md flex flex-col group text-left">
                            <div className="relative aspect-square rounded-[2.5rem] bg-slate-50 border border-slate-100 overflow-hidden mb-6 shadow-inner">
                                {item.image_url
                                    ? <Image src={normalizeImage(item.image_url)} alt={item.name} fill className="object-contain p-4" />
                                    : <div className="flex h-full items-center justify-center text-sm text-slate-400">No image uploaded</div>}
                                <div className={cn(
                                    "absolute top-4 right-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg",
                                    item.is_available_now ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                )}>
                                    {item.is_available_now ? 'Active' : 'Hidden'}
                                </div>
                            </div>

                            <div className="space-y-4 flex-1 flex flex-col justify-between">
                                <div>
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">{item.category}</p>
                                    <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-tight">{item.name}</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Price</p>
                                        <p className="text-sm font-black text-primary">{formatPrice(item.price)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Material</p>
                                        <p className="text-xs font-bold text-slate-600 truncate">{item.material || 'Not specified'}</p>
                                    </div>
                                </div>

                                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={engravingDrafts[String(item.id)]?.enabled ?? item.engraving_enabled === true}
                                            onChange={event => updateEngravingDraft(item.id, 'enabled', event.target.checked)}
                                            className="h-4 w-4 accent-amber-600"
                                        />
                                        Offer custom engraving
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="space-y-1 text-[9px] font-bold uppercase text-slate-500">
                                            Engraving fee (KSh)
                                            <Input type="number" min="0" step="any" value={engravingDrafts[String(item.id)]?.engravingFee ?? String(item.engraving_fee ?? 0)} onChange={event => updateEngravingDraft(item.id, 'engravingFee', event.target.value)} className="h-10 rounded-lg bg-white" />
                                        </label>
                                        <label className="space-y-1 text-[9px] font-bold uppercase text-slate-500">
                                            Gift pack (KSh)
                                            <Input type="number" min="0" step="any" value={engravingDrafts[String(item.id)]?.packagingFee ?? String(item.gift_packaging_fee ?? 150)} onChange={event => updateEngravingDraft(item.id, 'packagingFee', event.target.value)} className="h-10 rounded-lg bg-white" />
                                        </label>
                                    </div>
                                    <Button onClick={() => saveEngravingSettings(item)} disabled={savingEngravingId === item.id} className="h-10 w-full rounded-lg bg-slate-900 text-[9px] font-black uppercase tracking-widest text-white">
                                        {savingEngravingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : engravingSavedId === item.id ? 'Engraving settings saved' : 'Save engraving settings'}
                                    </Button>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => toggleAvailability(item.id, item.is_available_now)}
                                        className={cn(
                                            "flex-1 h-12 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all active:scale-95",
                                            item.is_available_now ? "bg-slate-900 text-white hover:bg-primary" : "bg-emerald-500 text-white shadow-emerald-200 shadow-lg"
                                        )}
                                    >
                                        {item.is_available_now ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button
                                        onClick={() => handleDelete(item.id)}
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

            {/* ADD SOUVENIR SIDE DRAWER MODAL WITH AI AUTOFILL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-2 sm:p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl sm:rounded-[3rem] p-5 sm:p-10 max-w-lg w-full space-y-5 shadow-2xl relative border border-slate-100 text-left max-h-[calc(100dvh-1rem)] overflow-y-auto no-scrollbar">
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-black uppercase text-primary tracking-widest">SOUVENIR FORGE</span>
                                <h2 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">Upload New Collectible</h2>
                            </div>
                        </div>

                        <form onSubmit={handleCreateSouvenir} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Product Name</label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. BAR OS Premium Hip Flask"
                                    required
                                    className="rounded-xl h-12 bg-slate-50 border-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                        required
                                        className="w-full rounded-xl h-12 bg-slate-50 border-none px-3 text-xs font-bold"
                                    >
                                        <option value="">Select category</option>
                                        <option value="Shot Glass Vault">Shot Glass Vault</option>
                                        <option value="Hip Flask Collection">Hip Flask Collection</option>
                                        <option value="Whiskey Glass Collection">Whiskey Glasses</option>
                                        <option value="Bottle Accessories">Bottle Accessories</option>
                                        <option value="BAR OS Wear">BAR OS Wear</option>
                                        <option value="Gift Boxes">Gift Boxes</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Price (KSh)</label>
                                    <Input
                                        type="number"
                                        min="0.01"
                                        step="any"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        placeholder="Enter price"
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Stock Units</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={formData.stock}
                                        onChange={e => setFormData({ ...formData, stock: e.target.value })}
                                        placeholder="Enter current stock"
                                        required
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Material</label>
                                    <Input
                                        value={formData.material}
                                        onChange={e => setFormData({ ...formData, material: e.target.value })}
                                        placeholder="Enter material (optional)"
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400">Capacity (oz)</label>
                                    <Input
                                        type="number"
                                        min="0.01"
                                        step="any"
                                        value={formData.capacity_oz}
                                        onChange={e => setFormData({ ...formData, capacity_oz: e.target.value })}
                                        placeholder="8"
                                        className="rounded-xl h-12 bg-slate-50 border-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                                <label className="flex items-center gap-2 text-xs font-bold text-amber-950">
                                    <input
                                        type="checkbox"
                                        checked={formData.engraving_enabled}
                                        onChange={event => setFormData({ ...formData, engraving_enabled: event.target.checked })}
                                        className="h-4 w-4 accent-amber-600"
                                    />
                                    Offer custom engraving
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="space-y-1 text-[9px] font-bold uppercase text-amber-900">
                                        Engraving fee (KSh)
                                        <Input type="number" min="0" step="any" value={formData.engraving_fee} onChange={event => setFormData({ ...formData, engraving_fee: event.target.value })} required className="h-10 rounded-lg bg-white" />
                                    </label>
                                    <label className="space-y-1 text-[9px] font-bold uppercase text-amber-900">
                                        Gift packaging (KSh)
                                        <Input type="number" min="0" step="any" value={formData.gift_packaging_fee} onChange={event => setFormData({ ...formData, gift_packaging_fee: event.target.value })} required className="h-10 rounded-lg bg-white" />
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="souvenir-image" className="text-[10px] font-black uppercase text-slate-500">Product image</label>
                                <label htmlFor="souvenir-image" className="flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600 hover:border-primary">
                                    {imagePreview
                                        ? <Image src={imagePreview} alt="Selected souvenir preview" width={80} height={80} unoptimized className="h-20 w-20 rounded-lg object-cover" />
                                        : <ImagePlus className="h-6 w-6 text-primary" />}
                                    <span className="min-w-0 break-all">{imageFile?.name || 'Choose an image (optional)'}</span>
                                </label>
                                <input
                                    id="souvenir-image"
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={event => {
                                        const file = event.target.files?.[0] || null;
                                        if (file && !file.type.startsWith('image/')) {
                                            setLoadError('Choose a valid image file.');
                                            event.target.value = '';
                                            return;
                                        }
                                        if (file && file.size > 8 * 1024 * 1024) {
                                            setLoadError('Choose an image smaller than 8 MB.');
                                            event.target.value = '';
                                            return;
                                        }
                                        setLoadError(null);
                                        setImageFile(file);
                                    }}
                                />
                                <p className="text-xs text-slate-500">Images are stored with this product in the catalog. Maximum size: 8 MB.</p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-400">Description</label>
                                <Textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Premium stainless steel hip flask built for nights out."
                                    className="rounded-xl bg-slate-50 border-none text-xs"
                                    rows={2}
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
                                    {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <><CheckCircle2 size={16} className="mr-2" /> Save & Publish</>}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
