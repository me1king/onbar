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
    CheckCircle2,
    Sparkles,
    PackageCheck,
    Image as ImageIcon,
    Upload,
    Snowflake as ChilledIcon
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import { isBeverageInventoryProduct } from '@/lib/productDepartment';
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
    is_bite?: boolean;
    is_snack?: boolean;
    is_souvenir?: boolean;
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
    const [formFeedback, setFormFeedback] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);
    const [stockDrafts, setStockDrafts] = React.useState<Record<string, string>>({});

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
        pairings: ''
    });

    React.useEffect(() => {
        if (!imageFile) {
            setImagePreview(null);
            return;
        }
        const objectUrl = URL.createObjectURL(imageFile);
        setImagePreview(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [imageFile]);

    const fetchBeverages = React.useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const response = await fetch('/api/admin/products?scope=inventory', { cache: 'no-store' });
            const result = await response.json() as { products?: BeverageNode[]; error?: string };
            if (!response.ok || !result.products) throw new Error(result.error || 'Unable to load beverage inventory.');
            const beverageProducts = result.products.filter(isBeverageInventoryProduct);
            setBeverages(beverageProducts);
            setStockDrafts(Object.fromEntries(beverageProducts.map(beverage => [String(beverage.id), String(beverage.stock ?? 0)])));
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
        const price = Number(form.price);
        const stock = Number(form.stock);
        if (!form.name.trim() || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
            setFormFeedback({ type: 'error', text: 'Enter a beverage name, a price greater than zero, and a whole-number stock quantity of zero or more.' });
            return;
        }
        if (form.temperature !== '' && (!Number.isFinite(Number(form.temperature)) || Number(form.temperature) < -20 || Number(form.temperature) > 30)) {
            setFormFeedback({ type: 'error', text: 'Serving temperature must be between -20°C and 30°C.' });
            return;
        }
        if (imageFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type) || imageFile.size > 8 * 1024 * 1024)) {
            setFormFeedback({ type: 'error', text: 'Choose a JPG, PNG, or WebP image no larger than 8 MB.' });
            return;
        }
        setSaving(true);
        setFormFeedback(null);
        let uploadedImagePath: string | null = null;
        try {
            const pairings = form.pairings.split(',').map(s => s.trim()).filter(Boolean);
            let imageUrl = form.image_url.trim() || null;
            if (imageFile) {
                const uploadForm = new FormData();
                uploadForm.set('file', imageFile);
                const uploadResponse = await fetch('/api/admin/product-image', {
                    method: 'POST',
                    body: uploadForm
                });
                const uploadResult = await uploadResponse.json() as { error?: string; path?: string; image_url?: string };
                if (!uploadResponse.ok || !uploadResult.path || !uploadResult.image_url) {
                    throw new Error(uploadResult.error || 'The beverage image could not be uploaded.');
                }
                uploadedImagePath = uploadResult.path;
                imageUrl = uploadResult.image_url;
            }

            const payload = {
                name: form.name.trim(),
                brand: form.brand.trim() || 'BAR OS',
                category: form.category,
                sub_category: form.category,
                price,
                stock,
                size_label: form.size_label,
                sizes: form.size_label.trim() ? [form.size_label.trim()] : ['Standard'],
                is_ice_cold: Boolean(form.temperature),
                temperature_celsius: form.temperature ? Number(form.temperature) : null,
                is_available_now: stock > 0,
                beverage_specs: {
                    pairings: pairings
                },
                pairing_suggestions: pairings,
                image_url: imageUrl
            };

            const response = await fetch('/api/admin/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product: payload })
            });
            const result = await response.json() as { error?: string; id?: number };
            if (!response.ok || !result.id) throw new Error(result.error || 'The beverage could not be saved.');

            await logAuditAction(email, 'CREATE_BEVERAGE', { name: form.name });
            uploadedImagePath = null;
            setIsAddModalOpen(false);
            setFormFeedback({ type: 'success', text: `${form.name.trim()} is now in your beverage inventory.` });
            setImageFile(null);
            setForm({
                name: '',
                brand: 'BAR OS Originals',
                category: 'Soft Drinks',
                size_label: '500ml',
                price: '',
                stock: '0',
                temperature: '',
                image_url: '',
                pairings: ''
            });

            await fetchBeverages();
        } catch (err: unknown) {
            setFormFeedback({
                type: 'error',
                text: err instanceof Error ? `Could not save this beverage: ${err.message}` : 'Could not save this beverage. Try again.'
            });
            if (uploadedImagePath) {
                try {
                    const cleanupResponse = await fetch('/api/admin/product-image', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: uploadedImagePath })
                    });
                    if (!cleanupResponse.ok) {
                        console.error('Unable to remove the image after beverage save failed.', await cleanupResponse.text());
                    }
                } catch (cleanupError) {
                    console.error('Unable to remove the image after beverage save failed.', cleanupError);
                }
            }
        } finally {
            setSaving(false);
        }
    };

    const toggleAvailability = async (id: string | number, current?: boolean) => {
        if (!supabase) return;
        const nextState = current === false;
        const product = beverages.find(beverage => beverage.id === id);
        if (nextState && Number(product?.stock || 0) < 1) {
            setFormFeedback({ type: 'error', text: 'Add stock before making this beverage available to customers.' });
            return;
        }
        try {
            const response = await fetch('/api/admin/products', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: Number(id), product: { is_available_now: nextState } })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Availability could not be changed.');
            setBeverages(prev => prev.map(b => b.id === id ? { ...b, is_available_now: nextState } : b));
            setFormFeedback({ type: 'success', text: `${product?.name || 'Beverage'} is ${nextState ? 'available' : 'hidden'} in the store.` });
        } catch (error) {
            console.error('Could not update beverage availability:', error);
            setFormFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Availability could not be changed.' });
        }
    };

    const updateStock = async (beverage: BeverageNode) => {
        if (!supabase) return;
        const nextStock = Number(stockDrafts[String(beverage.id)]);
        if (!Number.isInteger(nextStock) || nextStock < 0) {
            setFormFeedback({ type: 'error', text: 'Stock must be a whole number of zero or more.' });
            return;
        }
        try {
            const response = await fetch('/api/admin/products', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: Number(beverage.id),
                    product: {
                        stock: nextStock,
                        ...(nextStock === 0 ? { is_available_now: false } : {})
                    }
                })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Stock could not be updated.');
            setBeverages(prev => prev.map(item => item.id === beverage.id
                ? { ...item, stock: nextStock, ...(nextStock === 0 ? { is_available_now: false } : {}) }
                : item));
            setFormFeedback({ type: 'success', text: `${beverage.name} stock updated to ${nextStock} units.` });
        } catch (error) {
            console.error('Could not update beverage stock:', error);
            setFormFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Stock could not be updated.' });
        }
    };

    const handleDelete = async (id: string | number) => {
        if (!supabase || !confirm("Expel this beverage node from inventory?")) return;
        try {
            const response = await fetch('/api/admin/products', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: Number(id) })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Beverage could not be deleted.');
            setBeverages(prev => prev.filter(b => b.id !== id));
            await logAuditAction(email, 'DELETE_BEVERAGE', { id });
            setFormFeedback({ type: 'success', text: 'Beverage removed from the inventory.' });
        } catch (error) {
            console.error('Could not delete beverage:', error);
            setFormFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Beverage could not be deleted.' });
        }
    };

    const filteredBeverages = beverages.filter(b => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (b.name || '').toLowerCase().includes(q) || (b.category || '').toLowerCase().includes(q) || (b.brand || '').toLowerCase().includes(q);
    });
    const listingChecks = [
        Boolean(form.name.trim()),
        Number.isFinite(Number(form.price)) && Number(form.price) > 0,
        Number.isInteger(Number(form.stock)) && Number(form.stock) >= 0,
        Boolean(form.category)
    ];
    const completedListingChecks = listingChecks.filter(Boolean).length;
    const listingProgress = Math.round((completedListingChecks / listingChecks.length) * 100);
    const pairingSuggestions = form.pairings.split(',').map(pairing => pairing.trim()).filter(Boolean);

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
                    <p className="text-muted-foreground text-sm font-medium mt-1">Upload and publish spirits, wine, beer, soft drinks, and food pairings to their storefront categories.</p>
                </div>
                <div className="flex gap-4">
                    <Button onClick={() => { setFormFeedback(null); setImageFile(null); setIsAddModalOpen(true); }} className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
                        <Plus size={16} className="mr-2" /> Upload Beverage
                    </Button>
                    <Button onClick={fetchBeverages} variant="outline" className="h-12 px-4 rounded-xl border-slate-200 bg-white font-black uppercase text-[8px] tracking-widest">
                        <RefreshCcw size={14} className={cn("mr-2", loading && "animate-spin")} /> Re-Sync
                    </Button>
                </div>
            </header>

            {formFeedback && !isAddModalOpen && (
                <div
                    role={formFeedback.type === 'error' ? 'alert' : 'status'}
                    className={cn(
                        "rounded-2xl border px-5 py-4 text-sm font-bold shadow-sm",
                        formFeedback.type === 'error'
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    )}
                >
                    {formFeedback.text}
                </div>
            )}

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
                    <p className="text-xl font-black text-emerald-600 uppercase italic mt-1">{beverages.filter(beverage => beverage.is_available_now !== false && Number(beverage.stock) > 0).length}</p>
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
                            const isLive = bev.is_available_now !== false && Number(bev.stock) > 0;

                            return (
                                <div key={bev.id} className="group flex flex-col items-stretch gap-4 p-6 transition-all hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                                    <div className="flex min-w-0 items-center gap-4 sm:gap-6">
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
                                                    {isLive ? 'Live Storefront' : 'Deactivated'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                {bev.brand || 'BAR OS'} &bull; {bev.category} &bull; Size: <span className="text-foreground font-black">{bev.size_label || '500ml'}</span> &bull; Stock: <span className="text-foreground font-black">{bev.stock ?? 50} units</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-start gap-3 sm:justify-end">
                                        <span className="text-lg font-black text-primary">{formatPrice(bev.price)}</span>
                                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5">
                                            <Input
                                                aria-label={`Stock units for ${bev.name}`}
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={stockDrafts[String(bev.id)] ?? String(bev.stock ?? 0)}
                                                onChange={event => setStockDrafts(current => ({ ...current, [String(bev.id)]: event.target.value }))}
                                                className="h-8 w-20 border-0 bg-transparent px-2 text-center text-xs font-bold shadow-none focus-visible:ring-2 focus-visible:ring-orange-200"
                                            />
                                            <Button onClick={() => void updateStock(bev)} variant="outline" className="h-8 rounded-lg px-2.5 text-[9px] font-black uppercase">Save stock</Button>
                                        </div>
                                        <Button
                                            onClick={() => toggleAvailability(bev.id, bev.is_available_now)}
                                            variant="outline"
                                            className={cn(
                                                "h-10 px-4 rounded-xl font-black uppercase text-[8px] tracking-widest",
                                                isLive ? "border-slate-200 text-slate-700" : "bg-emerald-500 text-white border-none"
                                            )}
                                            disabled={!isLive && Number(bev.stock || 0) < 1}
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
                <div className="fixed inset-0 z-[3000] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-xl animate-in fade-in duration-300 sm:p-6">
                    <Card
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="beverage-form-title"
                        className="my-auto flex max-h-[min(92dvh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white p-0 text-left shadow-[0_40px_120px_-30px_rgba(15,23,42,0.8)]"
                    >
                        <div className="sticky top-0 z-20 relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-6 py-6 text-white sm:px-10 sm:py-7">
                            <div className="absolute -right-8 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
                            <div className="absolute right-32 top-12 h-28 w-28 rounded-full bg-orange-400/20 blur-2xl" />
                            <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
                            <button
                                type="button"
                                aria-label="Close beverage form"
                                onClick={() => setIsAddModalOpen(false)}
                                className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:rotate-90 hover:bg-white/20 sm:right-8 sm:top-8"
                            >
                                <X size={18} />
                            </button>
                            <div className="relative flex items-start gap-4 pr-12">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-sky-500 text-slate-950 shadow-lg shadow-cyan-950/30">
                                    <Sparkles size={22} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Beverage Vault · New product</p>
                                    <h3 id="beverage-form-title" className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Give it a place on the shelf.</h3>
                                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">Build the listing, watch it come together, and publish when it is ready.</p>
                                    <div className="mt-4 max-w-sm">
                                        <div className="mb-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                                            <span className="text-slate-300">Listing readiness</span>
                                            <span className={listingProgress === 100 ? "text-emerald-300" : "text-cyan-200"}>
                                                {listingProgress === 100 ? 'Ready to publish' : `${completedListingChecks} of ${listingChecks.length} essentials`}
                                            </span>
                                        </div>
                                        <div
                                            role="progressbar"
                                            aria-label="Listing readiness"
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={listingProgress}
                                            className="h-1.5 overflow-hidden rounded-full bg-white/15"
                                        >
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-500 ease-out",
                                                    listingProgress === 100 ? "bg-emerald-400" : "bg-gradient-to-r from-cyan-300 to-orange-300"
                                                )}
                                                style={{ width: `${listingProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)]">
                            <form onSubmit={handleCreateBeverage} className="space-y-7 p-5 sm:p-8 lg:p-10">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[11px] font-black text-orange-700">1</span>
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Product details</h4>
                                    </div>
                                    <Field label="Beverage name">
                                        <Input required maxLength={120} autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Coca-Cola Original" className="h-12 rounded-xl border-slate-200 bg-slate-50/80 font-semibold shadow-none transition focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-100" />
                                    </Field>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label="Brand">
                                            <Input maxLength={100} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Coca-Cola Company" className="h-12 rounded-xl border-slate-200 bg-slate-50/80 font-semibold shadow-none focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-100" />
                                        </Field>
                                        <Field label="Category">
                                            <select
                                                value={form.category}
                                                onChange={e => setForm({ ...form, category: e.target.value })}
                                                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                                            >
                                                <optgroup label="Spirits">
                                                    <option value="Gin">Gin</option>
                                                    <option value="Whisky">Whisky</option>
                                                    <option value="Vodka">Vodka</option>
                                                    <option value="Rum">Rum</option>
                                                    <option value="Tequila">Tequila</option>
                                                    <option value="Brandy">Brandy</option>
                                                    <option value="Cognac">Cognac</option>
                                                    <option value="Liqueur">Liqueur</option>
                                                </optgroup>
                                                <optgroup label="Other drinks">
                                                    <option value="Wine">Wine</option>
                                                    <option value="Beer">Beer</option>
                                                    <option value="Champagne">Champagne</option>
                                                    <option value="Soft Drinks">Soft Drinks</option>
                                                    <option value="Energy">Energy Drinks</option>
                                                    <option value="Water">Mineral Water</option>
                                                    <option value="Juices">Fresh Juices</option>
                                                    <option value="Coffee">Coffee & Tea</option>
                                                    <option value="Mixers">Cocktail Mixers</option>
                                                </optgroup>
                                            </select>
                                        </Field>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-[11px] font-black text-cyan-800">2</span>
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Price & stock</h4>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                                        <Field label="Price · KSh">
                                            <Input type="number" min="0" step="0.01" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="120" className="h-12 rounded-xl border-slate-200 bg-slate-50/80 font-black text-orange-700 shadow-none focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-100" />
                                        </Field>
                                        <Field label="Pack size">
                                            <Input maxLength={40} value={form.size_label} onChange={e => setForm({ ...form, size_label: e.target.value })} placeholder="500ml" className="h-12 rounded-xl border-slate-200 bg-slate-50/80 font-semibold shadow-none focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-100" />
                                        </Field>
                                        <Field label="Units in stock">
                                            <Input type="number" min="0" step="1" required value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="100" className="col-span-2 h-12 rounded-xl border-slate-200 bg-slate-50/80 font-semibold shadow-none focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-100 sm:col-span-1" />
                                        </Field>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[11px] font-black text-violet-800">3</span>
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">Make it yours</h4>
                                    </div>
                                    <Field label="Product image" hint="Upload a JPG, PNG, or WebP up to 8 MB, or use a public image URL.">
                                        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 text-sm font-semibold text-slate-600 transition hover:border-orange-300 hover:bg-orange-50/50">
                                            <Upload className="h-4 w-4 shrink-0 text-orange-500" />
                                            <span className="min-w-0 flex-1 truncate">{imageFile ? imageFile.name : 'Choose an image from your device'}</span>
                                            <span className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 shadow-sm">Browse</span>
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                className="sr-only"
                                                onChange={event => {
                                                    setImageFile(event.target.files?.[0] || null);
                                                    setFormFeedback(null);
                                                }}
                                            />
                                        </label>
                                        <div className="relative">
                                            <ImageIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <Input type="url" value={form.image_url} onChange={e => { setForm({ ...form, image_url: e.target.value }); setImageFile(null); }} placeholder="Or paste https://your-image.jpg" className="h-12 rounded-xl border-slate-200 bg-slate-50/80 pl-10 text-sm shadow-none focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-100" />
                                        </div>
                                    </Field>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label="Serving temperature · °C" hint="Optional; adds a chilled badge to inventory.">
                                            <div className="relative">
                                                <ChilledIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-600" />
                                                <Input type="number" min="-20" max="30" step="0.5" value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value })} placeholder="e.g. 4" className="h-12 rounded-xl border-slate-200 bg-slate-50/80 pl-10 shadow-none focus-visible:border-cyan-300 focus-visible:ring-4 focus-visible:ring-cyan-100" />
                                            </div>
                                        </Field>
                                    </div>
                                    <Field label="Goes well with" hint="These suggestions appear on the customer-facing product page. Separate items with commas.">
                                        <Textarea value={form.pairings} onChange={e => setForm({ ...form, pairings: e.target.value })} placeholder="Smocha Deluxe, Chips Masala, Burgers" className="min-h-24 resize-y rounded-xl border-slate-200 bg-slate-50/80 p-3 text-sm shadow-none focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-100" rows={3} />
                                    </Field>
                                </div>

                                {formFeedback && (
                                    <p role="alert" className={cn(
                                        "rounded-xl border px-4 py-3 text-sm font-semibold",
                                        formFeedback.type === 'error' ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    )}>
                                        {formFeedback.text}
                                    </p>
                                )}

                                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                                    <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)} disabled={saving} className="h-12 rounded-xl border-slate-200 px-6 font-bold text-slate-600">Cancel</Button>
                                    <Button type="submit" disabled={saving} className="h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-7 font-black uppercase tracking-wider text-white shadow-lg shadow-orange-500/25 transition hover:-translate-y-0.5 hover:shadow-orange-500/40">
                                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving product...</> : <><CheckCircle2 size={17} className="mr-2" /> Publish beverage</>}
                                    </Button>
                                </div>
                            </form>

                            <aside className="border-t border-slate-100 bg-gradient-to-b from-slate-50 via-white to-cyan-50/40 p-5 sm:p-8 lg:sticky lg:top-0 lg:self-start lg:border-l lg:border-t-0 lg:p-7">
                                <div className="mb-5 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Storefront preview</p>
                                        <h4 className="mt-1 font-black text-slate-900">Looking good?</h4>
                                    </div>
                                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                                        Live preview
                                    </span>
                                </div>
                                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-2xl">
                                    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-cyan-100 via-sky-50 to-orange-100">
                                        {(imagePreview || form.image_url.trim()) ? (
                                            <Image src={imagePreview || normalizeImage(form.image_url.trim())} unoptimized alt={form.name || 'Beverage preview'} fill sizes="(max-width: 1024px) 90vw, 320px" className="object-contain p-5 transition-transform duration-500 hover:scale-105" />
                                        ) : (
                                            <div className="relative flex h-28 w-20 items-center justify-center rounded-[1.5rem] border border-white/80 bg-gradient-to-br from-white/90 to-cyan-100/80 shadow-xl shadow-cyan-900/10">
                                                <Coffee className="h-10 w-10 text-cyan-700 transition-transform duration-500 hover:rotate-6 hover:scale-110" />
                                                <span className="absolute -right-3 top-2 h-3 w-3 animate-bounce rounded-full bg-white/80 shadow-sm [animation-delay:150ms]" />
                                                <span className="absolute -left-3 bottom-5 h-2 w-2 animate-bounce rounded-full bg-white/70 [animation-delay:400ms]" />
                                            </div>
                                        )}
                                        <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/85 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-800 shadow-sm">{form.category}</span>
                                        {form.temperature !== '' && (
                                            <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-cyan-100 bg-white/90 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-800 shadow-sm">
                                                <ChilledIcon size={12} /> Chilled · {form.temperature}°C
                                            </span>
                                        )}
                                        {Number(form.stock) === 0 ? (
                                            <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/80 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white">Out of stock</span>
                                        ) : (
                                            <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white/90 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 shadow-sm">
                                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Available now
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-3 p-5">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{form.brand || 'Your brand'}{form.size_label ? ` · ${form.size_label}` : ''}</p>
                                            <h5 className="mt-1 min-h-12 text-lg font-black leading-tight text-slate-900">{form.name.trim() || 'Your beverage name'}</h5>
                                        </div>
                                        <div className="flex items-end justify-between border-t border-slate-100 pt-3">
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Your price</p>
                                                <p className="mt-0.5 text-xl font-black text-orange-600 transition-all duration-200">{form.price ? formatPrice(Number(form.price)) : 'KSh —'}</p>
                                            </div>
                                            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                                                <PackageCheck size={13} /> {Number(form.stock) > 0 ? `${form.stock} in stock` : 'Stock pending'}
                                            </span>
                                        </div>
                                        {pairingSuggestions.length > 0 && (
                                            <div className="border-t border-slate-100 pt-3">
                                                <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Goes well with</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {pairingSuggestions.slice(0, 3).map((pairing, index) => (
                                                        <span key={`${pairing}-${index}`} className="rounded-full bg-orange-50 px-2.5 py-1 text-[9px] font-bold text-orange-800 ring-1 ring-orange-100">
                                                            {pairing}
                                                        </span>
                                                    ))}
                                                    {pairingSuggestions.length > 3 && (
                                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500">
                                                            +{pairingSuggestions.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <p className="mt-4 text-xs leading-relaxed text-slate-500">Customers will see these details on the store. You can change availability or stock later from your inventory.</p>
                            </aside>
                        </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</label>
            {children}
            {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
        </div>
    );
}
