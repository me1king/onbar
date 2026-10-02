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
    Plus
} from 'lucide-react';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';

interface BiteItem {
    id: number | string;
    name: string;
    price: number;
    image_url: string;
    category: string;
    description?: string;
    prep_time?: number;
    spice_level?: number;
    drink_pairings?: string[];
    popular?: boolean;
}

const CATEGORIES = ['All', 'Hot Right Now', 'Street Bites', 'Burgers & Wings', 'Drink Pairings'];

export default function BiteCommandPage() {
    const [bites, setBites] = useState<BiteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addError, setAddError] = useState<string | null>(null);
    const [activeCat, setActiveCat] = useState('All');
    const [addedId, setAddedId] = useState<number | string | null>(null);

    const { addToCart } = useCart();

    useEffect(() => {
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
                    .or('is_snack.eq.true,is_bite.eq.true');

                if (fetchError) {
                    throw fetchError;
                }
                setBites((data || []) as unknown as BiteItem[]);
            } catch (e) {
                console.error('Error loading bites:', e);
                setBites([]);
                setError('Could not load bites. Please try again.');
            } finally {
                setLoading(false);
            }
        }
        fetchBites();

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

        addToCart({
            id: productId,
            name: item.name,
            price: item.price,
            base_price: item.price,
            image: normalizeImage(item.image_url || ''),
            quantity: 1,
            category: item.category
        });

        setAddError(null);
        setAddedId(item.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    const filteredBites = bites.filter(b => {
        if (activeCat === 'All') return true;
        return (b.category || '').toLowerCase().includes(activeCat.toLowerCase());
    });

    return (
        <div className="min-h-screen bg-slate-50 text-foreground text-left selection:bg-primary/20 pb-40">
            {/* HERO SECTION */}
            <header className="bg-white border-b border-slate-200/80 py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden shadow-sm">
                <div className="max-w-7xl mx-auto relative z-10 space-y-6">
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
                            Fresh hot bites and street food, available for ordering.
                        </p>
                    </div>
                </div>

                <Utensils className="absolute -bottom-10 -right-10 h-72 w-72 text-slate-900/5 rotate-12 pointer-events-none" />
            </header>

            {/* CATEGORY TABS */}
            <div className="sticky top-16 bg-white/95 backdrop-blur-xl z-40 border-b border-slate-200/80 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-3 overflow-x-auto no-scrollbar">
                    {CATEGORIES.map(cat => (
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

            {/* BITES GRID */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {addError && (
                    <p role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                        {addError}
                    </p>
                )}
                {loading ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Deploying 20-Minute Fast Food Menu...</p>
                    </div>
                ) : error ? (
                    <div role="alert" className="py-32 text-center text-rose-600">
                        <p className="text-sm font-black uppercase tracking-widest">{error}</p>
                    </div>
                ) : filteredBites.length === 0 ? (
                    <div className="py-32 text-center text-slate-400 space-y-4">
                        <Utensils size={56} className="mx-auto opacity-30" />
                        <p className="text-sm font-black uppercase tracking-widest italic">{activeCat === 'All' ? 'No bites are currently available.' : 'No bites matched this filter. Select All.'}</p>
                        {activeCat !== 'All' && (
                            <Button onClick={() => setActiveCat('All')} className="rounded-xl bg-primary text-white font-black uppercase text-xs px-6 py-3">
                                Show All Bites
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredBites.map((item) => (
                            <Card key={item.id} className="p-8 rounded-[3rem] bg-white border border-slate-200/80 shadow-md hover:shadow-xl transition-all group flex flex-col justify-between text-left relative overflow-hidden">
                                <div className="relative z-10 space-y-5">
                                    {/* Image Stage */}
                                    <div className="aspect-[4/3] rounded-[2.5rem] bg-slate-50/80 border border-slate-100 relative overflow-hidden flex items-center justify-center p-6 shadow-inner group-hover:scale-105 transition-transform duration-700">
                                        <Image src={normalizeImage(item.image_url)} alt={item.name} fill className="object-cover p-2 rounded-[2rem]" />

                                        {/* Top Badges */}
                                        <div className="absolute top-4 left-4 flex gap-2">
                                            <div className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/80 shadow-sm flex items-center gap-1.5">
                                                <Clock size={12} className="text-primary" />
                                                <span className="text-[9px] font-black uppercase text-foreground">{item.prep_time ? `${item.prep_time} min` : 'Prep time unavailable'}</span>
                                            </div>
                                            {item.popular && (
                                                <div className="bg-amber-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1">
                                                    🔥 Popular
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
