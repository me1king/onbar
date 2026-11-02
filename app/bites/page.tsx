'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Utensils,
    Flame,
    Clock,
    ArrowLeft,
    CheckCircle2,
    Loader2,
    Coffee,
    Sparkles,
    Plus,
    X
} from 'lucide-react';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { isMealProduct } from '@/lib/productDepartment';

interface BiteItem {
    id: number | string;
    name: string;
    price: number;
    image_url: string;
    category: string;
    sub_category?: string | null;
    description?: string;
    prep_time?: number;
    spice_level?: number;
    drink_pairings?: string[];
    popular?: boolean;
}

interface FoodAddon {
    id: string;
    name: string;
    price: number;
}

const CATEGORIES = ['All Food', 'Street Food', 'Burgers & Wings', 'Meals & Sides'];
const STREET_FOOD_PATTERN = /\b(smocha|smokie|rolex|chapati|mandazi|samosa|bhajia|viazi|mutura|mishkaki|nyama choma|street food|street bite)\b/i;
const BURGER_PATTERN = /\b(burger|wings)\b/i;

export default function BiteCommandPage() {
    const [bites, setBites] = useState<BiteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addError, setAddError] = useState<string | null>(null);
    const [activeCat, setActiveCat] = useState('All Food');
    const [addedId, setAddedId] = useState<number | string | null>(null);
    const [selectedBite, setSelectedBite] = useState<BiteItem | null>(null);
    const [addons, setAddons] = useState<FoodAddon[]>([]);
    const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
    const [addonError, setAddonError] = useState<string | null>(null);
    const [addonsLoading, setAddonsLoading] = useState(true);

    const { addToCart } = useCart();
    const foodCategories = React.useMemo(() => {
        const categories = new Map(CATEGORIES.map(category => [category.toLowerCase(), category]));
        bites.forEach(bite => {
            const category = bite.sub_category?.trim();
            if (category) categories.set(category.toLowerCase(), category);
        });
        return Array.from(categories.values());
    }, [bites]);

    useEffect(() => {
        async function fetchAddons() {
            if (!supabase) {
                setAddonsLoading(false);
                return;
            }
            try {
                const { data, error: addonsError } = await supabase
                    .from('food_addons')
                    .select('id, name, price')
                    .eq('is_active', true)
                    .order('name');
                if (addonsError) {
                    console.error('Unable to load meal extras:', addonsError);
                    setAddonError('Meal extras are temporarily unavailable. You can still order the meal without extras.');
                } else {
                    setAddons((data || []) as FoodAddon[]);
                }
            } catch (error) {
                console.error('Unable to load meal extras:', error);
                setAddonError('Meal extras are temporarily unavailable. You can still order the meal without extras.');
            } finally {
                setAddonsLoading(false);
            }
        }

        async function fetchBites() {
            setLoading(true);
            setError(null);
            if (!supabase) {
                setError('Bite data is unavailable.');
                setLoading(false);
                return;
            }
            try {
                const { data, error: fetchError } = await supabase
                    .from('products')
                    .select('*')
                    .or('is_bite.eq.true,category.ilike.%food%,category.ilike.%street%,category.ilike.%meal%');

                if (fetchError) {
                    throw fetchError;
                }
                setBites(((data || []) as unknown as BiteItem[])
                    .filter(isStorefrontProductVisible)
                    .filter(isMealProduct));
            } catch (e) {
                console.error('Error loading bites:', e);
                setBites([]);
                setError('Could not load bites. Please try again.');
            } finally {
                setLoading(false);
            }
        }
        fetchBites();
        fetchAddons();

        if (supabase) {
            const channel = supabase
                .channel('realtime_storefront_bites')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    fetchBites();
                })
                .subscribe();

            return () => {
                if (supabase) supabase.removeChannel(channel);
            };
        }
    }, []);

    const handleAddBite = (item: BiteItem) => {
        const productId = Number(item.id);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            setAddError('This product has an invalid catalogue ID and cannot be added to your bag.');
            return;
        }
        setSelectedAddonIds([]);
        setSelectedBite(item);
        setAddError(null);
    };

    const confirmAddBite = () => {
        if (!selectedBite) return;
        const productId = Number(selectedBite.id);
        const selectedAddons = addons.filter(addon => selectedAddonIds.includes(addon.id));
        addToCart({
            id: productId,
            name: selectedBite.name,
            price: selectedBite.price + selectedAddons.reduce((sum, addon) => sum + Number(addon.price), 0),
            base_price: selectedBite.price,
            image: normalizeImage(selectedBite.image_url || ''),
            quantity: 1,
            category: selectedBite.category,
            addons: selectedAddons.map(addon => ({ ...addon, price: Number(addon.price) }))
        });

        setAddError(null);
        setAddedId(selectedBite.id);
        setTimeout(() => setAddedId(null), 2000);
        setSelectedBite(null);
    };

    const filteredBites = bites.filter(bite => {
        if (activeCat === 'All Food') return true;
        if (bite.sub_category?.trim().toLowerCase() === activeCat.toLowerCase()) return true;
        const details = `${bite.name} ${bite.category} ${bite.sub_category || ''} ${bite.description || ''}`;
        if (activeCat === 'Street Food') return STREET_FOOD_PATTERN.test(details);
        if (activeCat === 'Burgers & Wings') return BURGER_PATTERN.test(details);
        return !STREET_FOOD_PATTERN.test(details) && !BURGER_PATTERN.test(details);
    });

    return (
        <div className="min-h-screen bg-slate-50 text-foreground text-left selection:bg-primary/20 pb-40">
            {selectedBite && (
                <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-sm">
                    <Card className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl bg-white p-5 text-left shadow-2xl sm:p-8">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Customize your meal</p>
                                <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">{selectedBite.name}</h2>
                                <p className="mt-1 text-sm font-bold text-slate-500">Base price {formatPrice(selectedBite.price)}</p>
                            </div>
                            <button onClick={() => setSelectedBite(null)} className="rounded-full bg-slate-100 p-2 text-slate-600" aria-label="Close meal options"><X size={18} /></button>
                        </div>
                        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Add extras</h3>
                        {addonError && <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">{addonError}</p>}
                        {addonsLoading ? (
                            <p className="rounded-xl border border-slate-100 p-4 text-sm text-slate-500">Loading meal extras…</p>
                        ) : addons.length === 0 ? (
                            <p className="rounded-xl border border-slate-100 p-4 text-sm text-slate-500">No meal extras are currently available.</p>
                        ) : (
                            <div className="space-y-2">
                                {addons.map(addon => {
                                    const checked = selectedAddonIds.includes(addon.id);
                                    return (
                                        <button
                                            key={addon.id}
                                            type="button"
                                            aria-pressed={checked}
                                            onClick={() => setSelectedAddonIds(current => checked ? current.filter(id => id !== addon.id) : [...current, addon.id])}
                                            className={cn(
                                                'flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors',
                                                checked ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:bg-slate-50'
                                            )}
                                        >
                                            <span className="flex items-center gap-3">
                                                <span className={cn('flex h-5 w-5 items-center justify-center rounded border text-xs', checked ? 'border-primary bg-primary text-white' : 'border-slate-300')}>
                                                    {checked ? '✓' : ''}
                                                </span>
                                                <span className="text-sm font-bold">{addon.name}</span>
                                            </span>
                                            <span className="text-sm font-black text-primary">+{formatPrice(Number(addon.price))}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
                            <div>
                                <p className="text-[9px] font-bold uppercase text-slate-400">Total per meal</p>
                                <p className="text-xl font-black">{formatPrice(selectedBite.price + addons.filter(addon => selectedAddonIds.includes(addon.id)).reduce((sum, addon) => sum + Number(addon.price), 0))}</p>
                            </div>
                            <Button onClick={confirmAddBite} disabled={addonsLoading} className="rounded-xl bg-primary px-6 font-black text-white">
                                <Plus size={16} className="mr-2" /> Add to Bag
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* HERO SECTION */}
            <header className="bg-white border-b border-slate-200/80 py-8 sm:py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden shadow-sm">
                <div className="max-w-7xl mx-auto relative z-10 space-y-4">
                    <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 hover:text-primary transition-colors">
                        <ArrowLeft size={16} /> Return to Main Menu
                    </Link>

                    <div className="max-w-2xl space-y-3">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[9px] font-black uppercase tracking-[0.3em]">
                            <Flame size={14} className="fill-current text-amber-500" /> Bites Menu
                        </div>
                        <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none italic text-foreground">
                            Bite <span className="text-primary italic">Command.</span>
                        </h1>
                        <p className="text-slate-500 font-medium text-base sm:text-lg italic leading-relaxed">
                            Smocha, rolex, and fresh street-food favorites. Customize your meal, then add it to the same bag as your drinks.
                        </p>
                    </div>
                </div>

                <Utensils className="absolute -bottom-10 -right-10 h-72 w-72 text-slate-900/5 rotate-12 pointer-events-none" />
            </header>

            {/* CATEGORY TABS */}
            <div className="sticky top-16 bg-white/95 backdrop-blur-xl z-40 border-b border-slate-200/80 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
                    <label htmlFor="bite-category" className="sr-only">Filter food by category</label>
                    <select
                        id="bite-category"
                        value={activeCat}
                        onChange={event => setActiveCat(event.target.value)}
                        className="w-full min-w-0 rounded-full border border-slate-200 bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 sm:hidden"
                    >
                        {foodCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <div className="hidden sm:flex gap-3 overflow-x-auto no-scrollbar">
                        {foodCategories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCat(cat)}
                                className={cn(
                                    "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                                    activeCat === cat ? "bg-primary text-white font-black shadow-lg shadow-primary/30 scale-105" : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-slate-200/60"
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* BITES GRID */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
                {addError && (
                    <p role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                        {addError}
                    </p>
                )}
                {loading ? (
                    <div className="py-10 sm:py-16 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Loading the street-food menu...</p>
                    </div>
                ) : error ? (
                    <div role="alert" className="px-4 py-10 sm:py-16 text-center text-rose-600">
                        <p className="text-xs sm:text-sm font-black uppercase tracking-wide sm:tracking-widest break-words">{error}</p>
                    </div>
                ) : filteredBites.length === 0 ? (
                    <div className="px-4 py-10 sm:py-16 text-center text-slate-400 space-y-4">
                        <Utensils size={56} className="mx-auto opacity-30" />
                        <p className="text-sm font-black uppercase tracking-widest italic">
                            {bites.length === 0
                                ? 'Street food is being prepared. Check back soon.'
                                : activeCat === 'All Food'
                                    ? 'No street-food items are currently available.'
                                    : `No food matched ${activeCat}.`}
                        </p>
                        {activeCat !== 'All Food' && bites.length > 0 && (
                            <Button onClick={() => setActiveCat('All Food')} className="rounded-xl bg-primary text-white font-black uppercase text-xs px-6 py-3">
                                Show All Food
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                        {filteredBites.map((item) => (
                            <Card key={item.id} className="min-w-0 p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md hover:shadow-xl transition-all group flex flex-col justify-between text-left relative overflow-hidden">
                                <div className="relative z-10 space-y-5">
                                    {/* Image Stage */}
                                    <div className="relative aspect-[4/3] w-full min-w-0 rounded-xl sm:rounded-[2rem] bg-slate-50/80 border border-slate-100 overflow-hidden flex items-center justify-center shadow-inner">
                                        <Image src={normalizeImage(item.image_url)} alt={item.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-contain p-2 sm:p-4" />

                                        {/* Top Badges */}
                                        <div className="absolute top-4 left-4 flex gap-2">
                                            <div className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/80 shadow-sm flex items-center gap-1.5">
                                                <Clock size={12} className="text-primary" />
                                                <span className="text-[9px] font-black uppercase text-foreground">{item.prep_time ? `${item.prep_time} min` : 'Prep time unavailable'}</span>
                                            </div>
                                            {item.popular && (
                                                <div className="bg-amber-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1">
                                                    Popular
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Item Details */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-start">
                                            <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-tight">{item.name}</h3>
                                            <p className="text-2xl font-black text-primary tracking-tighter shrink-0 ml-2">{formatPrice(item.price)}</p>
                                        </div>
                                        {item.description && <p className="text-xs font-medium text-slate-500 italic leading-relaxed">{item.description}</p>}
                                    </div>

                                    {typeof item.spice_level === 'number' && (
                                        <div className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                                            Spice Level: {'🌶️'.repeat(Math.max(0, item.spice_level))}
                                        </div>
                                    )}

                                    {/* Suggested Pairings */}
                                    {item.drink_pairings && item.drink_pairings.length > 0 && (
                                        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/60 space-y-1.5">
                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase text-amber-800 tracking-wider">
                                                <Coffee size={12} className="text-amber-600" /> Pair with
                                            </div>
                                            <p className="text-[10px] font-extrabold text-amber-900 uppercase">
                                                {item.drink_pairings.join(' • ')}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-100 relative z-10 flex gap-3">
                                    <Button
                                        onClick={() => handleAddBite(item)}
                                        className={cn(
                                            "w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all",
                                            addedId === item.id
                                                ? "bg-emerald-500 text-white"
                                                : "bg-slate-900 text-white hover:bg-primary transition-colors active:scale-95"
                                        )}
                                    >
                                        {addedId === item.id ? (
                                            <><CheckCircle2 size={16} className="mr-2" /> Added to Order!</>
                                        ) : (
                                            <><Plus size={16} className="mr-2" /> Add to Bag</>
                                        )}
                                    </Button>
                                </div>

                                <Sparkles className="absolute -bottom-6 -right-6 h-32 w-32 text-slate-900/5 rotate-12 -z-0" />
                            </Card>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}
