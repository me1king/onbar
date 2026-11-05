'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Coffee,
    ArrowLeft,
    CheckCircle2,
    Loader2,
    ShoppingBag,
    Snowflake,
    Sparkles
} from 'lucide-react';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { LOCAL_DELIVERY_ESTIMATE } from '@/lib/deliveryEstimate';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

interface BeverageItem {
    id: number | string;
    name: string;
    brand?: string;
    category: string;
    sub_category?: string;
    price: number;
    image_url?: string;
    image?: string;
    size_label?: string;
    is_ice_cold?: boolean;
    temperature_celsius?: number;
    stock?: number;
    is_available_now?: boolean;
}

const CATEGORIES = ['All Drinks', 'Soft Drinks', 'Energy', 'Water', 'Juices', 'Coffee', 'Mixers'];

export default function BeverageCommandPage() {
    const [beverages, setBeverages] = useState<BeverageItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addError, setAddError] = useState<string | null>(null);
    const [activeCat, setActiveCat] = useState('All Drinks');
    const [addedId, setAddedId] = useState<string | number | null>(null);
    const { addToCart } = useCart();

    useEffect(() => {
        async function fetchBeverages() {
            setLoading(true);
            setError(null);
            if (!supabase) {
                setError('Product data is unavailable.');
                setLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) {
                    throw error;
                }
                if (data) {
                    const alcoholicCategories = ['whiskey', 'whisky', 'wine', 'spirits', 'champagne', 'vodka', 'gin', 'rum', 'tequila', 'cognac', 'liquor', 'cellar', 'snacks'];
                    let items = (data as unknown as BeverageItem[]).filter(i => {
                        const cat = (i.category || '').toLowerCase();
                        const subCat = (i.sub_category || '').toLowerCase();
                        return isStorefrontProductVisible(i)
                            && Number(i.stock) > 0
                            && !alcoholicCategories.some(a => cat.includes(a) || subCat.includes(a));
                    });

                    if (activeCat !== 'All Drinks') {
                        const target = activeCat.toLowerCase();
                        items = items.filter(i => {
                            const cat = (i.category || '').toLowerCase();
                            const subCat = (i.sub_category || '').toLowerCase();
                            const name = (i.name || '').toLowerCase();
                            return cat.includes(target) || subCat.includes(target) || name.includes(target);
                        });
                    }
                    setBeverages(items);
                }
            } catch (err) {
                console.error('Error loading beverages:', err);
                setBeverages([]);
                setError('Could not load beverages. Please try again.');
            } finally {
                setLoading(false);
            }
        }
        fetchBeverages();

        if (supabase) {
            const channel = supabase
                .channel('realtime_storefront_beverages')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    fetchBeverages();
                })
                .subscribe();

            return () => {
                if (supabase) supabase.removeChannel(channel);
            };
        }
    }, [activeCat]);

    const handleAddBev = (item: BeverageItem) => {
        const productId = Number(item.id);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            setAddError('This product has an invalid catalogue ID and cannot be added to your bag.');
            return;
        }

        const img = item.image_url || item.image || '';
        addToCart({
            id: productId,
            name: item.name,
            price: item.price,
            base_price: item.price,
            image: normalizeImage(img),
            quantity: 1,
            category: item.category || 'Beverages'
        });
        setAddError(null);
        setAddedId(item.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-foreground text-left selection:bg-primary/20 pb-40">
            {/* HERO SECTION */}
            <header className="py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-white border-b border-slate-200/80 shadow-sm">
                <div className="max-w-7xl mx-auto relative z-10 space-y-6">
                    <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 hover:text-primary transition-colors">
                        <ArrowLeft size={16} /> Return to Main Menu
                    </Link>

                    <div className="max-w-2xl space-y-3">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[9px] font-black uppercase tracking-[0.3em]">
                            <Snowflake size={14} className="text-amber-500" /> Beverages
                        </div>
                        <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none italic text-foreground">
                            Beverage <span className="text-primary italic">Command.</span>
                        </h1>
                        <p className="text-slate-500 font-medium text-base sm:text-lg italic leading-relaxed">
                            &quot;Order online 24/7. Estimated {LOCAL_DELIVERY_ESTIMATE} local delivery in eligible Nairobi areas; confirm address and availability at checkout.&quot;
                        </p>
                    </div>
                </div>

                <Coffee className="absolute -bottom-10 -right-10 h-72 w-72 text-slate-900/5 rotate-12 pointer-events-none" />
            </header>

            {/* CATEGORY CHIPS */}
            <div className="sticky top-16 bg-white/95 backdrop-blur-xl z-40 border-b border-slate-200/80 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-3 overflow-x-auto no-scrollbar">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCat(cat)}
                            className={cn(
                                "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                                activeCat === cat
                                    ? "bg-primary text-white font-black shadow-lg shadow-primary/30 scale-105"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-slate-200/60"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* FLOATING CARDS GRID */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {addError && (
                    <p role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                        {addError}
                    </p>
                )}
                {loading ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Scanning Chilled Nodes...</p>
                    </div>
                ) : error ? (
                    <div role="alert" className="py-32 text-center text-rose-600">
                        <p className="text-sm font-black uppercase tracking-widest">{error}</p>
                    </div>
                ) : beverages.length === 0 ? (
                    <div className="py-32 text-center text-slate-400 space-y-4">
                        <Coffee size={56} className="mx-auto opacity-30" />
                        <p className="text-sm font-black uppercase tracking-widest italic">{activeCat === 'All Drinks' ? 'No beverages are currently available.' : 'No beverages matched this filter. Select All Drinks.'}</p>
                        <Button onClick={() => setActiveCat('All Drinks')} className="rounded-xl bg-primary text-white font-black uppercase text-xs px-6 py-3">
                            Show All Drinks
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
                        {beverages.map((item) => {
                            const img = item.image_url || item.image || '';
                            return (
                                <Card key={item.id} className="p-4 sm:p-8 rounded-2xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md hover:shadow-xl transition-all group flex flex-col justify-between text-left relative overflow-hidden">
                                    <div className="relative z-10 space-y-5">
                                        {/* Price Badge */}
                                        <div className="flex justify-between items-center">
                                            <div className="bg-primary text-white px-4 py-1.5 rounded-full text-xs font-black tracking-tight shadow-md shadow-primary/20">
                                                {formatPrice(item.price)}
                                            </div>
                                        </div>

                                        {/* Product Image Stage */}
                                        <div className="relative aspect-square w-full min-w-0 rounded-xl sm:rounded-[2.5rem] bg-slate-50/80 border border-slate-100 overflow-hidden flex items-center justify-center p-2 sm:p-6 shadow-inner group-hover:scale-105 transition-transform duration-700">
                                            <Image src={normalizeImage(img)} alt={item.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-contain p-3 sm:p-6" />
                                        </div>

                                        {/* Product Hierarchy */}
                                        <div className="space-y-1">
                                            <h3 className="text-lg font-black text-foreground uppercase tracking-tight leading-tight line-clamp-2">{item.name}</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                {[item.category, item.size_label].filter(Boolean).join(' • ')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-5 border-t border-slate-100 relative z-10">
                                        <Button
                                            onClick={() => handleAddBev(item)}
                                            className={cn(
                                                "w-full h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md transition-all",
                                                addedId === item.id ? "bg-emerald-500 text-white" : "bg-slate-900 text-white hover:bg-primary transition-colors active:scale-95"
                                            )}
                                        >
                                            {addedId === item.id ? <><CheckCircle2 size={16} className="mr-2" /> Added to Cart!</> : <><ShoppingBag size={16} className="mr-2" /> + Add to Bag</>}
                                        </Button>
                                    </div>

                                    <Sparkles className="absolute -bottom-6 -right-6 h-32 w-32 text-slate-900/5 rotate-12 -z-0" />
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
