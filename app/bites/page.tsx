'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Utensils,
    Flame,
    Clock,
    Zap,
    ArrowLeft,
    CheckCircle2,
    Loader2,
    ShoppingBag,
    Coffee
} from 'lucide-react';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';

interface BiteItem {
    id: number;
    name: string;
    price: number;
    image_url: string;
    category: string;
    description?: string;
    prep_time?: number;
    spice_level?: number;
    drink_pairings?: string[];
}

const CATEGORIES = ['All', 'Hot Right Now', 'Street Bites', 'Burgers', 'Pizza', 'Snacks', 'Drink Pairings'];

export default function BiteCommandPage() {
    const [bites, setBites] = useState<BiteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCat, setActiveCat] = useState('All');
    const [addedId, setAddedId] = useState<number | null>(null);
    const { addToCart } = useCart();

    useEffect(() => {
        async function fetchBites() {
            setLoading(true);
            if (!supabase) return;
            const { data } = await supabase.from('products').select('*').eq('is_snack', true);
            if (data) {
                setBites((data as unknown as BiteItem[]).map(d => ({
                    ...d,
                    prep_time: d.prep_time || 8,
                    spice_level: d.spice_level || 2,
                    drink_pairings: d.drink_pairings || ['KC Pineapple', 'Tusker Lite']
                })));
            }
            setLoading(false);
        }
        fetchBites();
    }, []);

    const handleAddBite = (item: BiteItem) => {
        addToCart({
            id: item.id,
            name: item.name,
            price: item.price,
            base_price: item.price,
            image: normalizeImage(item.image_url),
            quantity: 1,
            category: item.category || 'Bites'
        });
        setAddedId(item.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-left selection:bg-primary/20 pb-40">
            {/* HERO SECTION */}
            <header className="bg-slate-900 text-white py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
                <div className="max-w-7xl mx-auto relative z-10 space-y-8">
                    <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors">
                        <ArrowLeft size={16} /> Return to Cellar
                    </Link>

                    <div className="max-w-2xl space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[9px] font-black uppercase tracking-[0.3em]">
                            <Flame size={14} className="fill-current animate-pulse" /> Live Kitchen Radar Active
                        </div>
                        <h1 className="text-5xl sm:text-6xl font-black uppercase tracking-tighter leading-none italic">
                            Bite <span className="text-primary italic">Command.</span>
                        </h1>
                        <p className="text-slate-400 font-medium text-base sm:text-lg italic leading-relaxed">
                            &quot;Hot bites. Cold drinks. Tactical dispatch in under 20 minutes.&quot;
                        </p>
                    </div>

                    {/* LIVE KITCHEN RADAR HUD */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-800">
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Grill Station</p>
                            <p className="text-xl font-black text-emerald-400">2 Orders Active</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Fryer Station</p>
                            <p className="text-xl font-black text-primary">Ready in 4 min</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Dispatch Runner</p>
                            <p className="text-xl font-black text-amber-400">Departing in 3 min</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Average Prep</p>
                            <p className="text-xl font-black text-foreground">11 Minutes</p>
                        </div>
                    </div>
                </div>

                <Utensils className="absolute -bottom-10 -right-10 h-72 w-72 text-white/5 rotate-12 pointer-events-none" />
            </header>

            {/* CATEGORY TABS */}
            <div className="sticky top-20 bg-white/90 backdrop-blur-xl z-40 border-b border-slate-100 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex gap-3 overflow-x-auto no-scrollbar">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCat(cat)}
                            className={cn(
                                "px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                                activeCat === cat ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* BITES GRID */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                {loading ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Deploying 20-Minute Tactical Menu...</p>
                    </div>
                ) : bites.length === 0 ? (
                    <div className="py-32 text-center text-slate-300">
                        <Utensils size={64} className="mx-auto mb-4 opacity-20" />
                        <p className="text-sm font-black uppercase tracking-widest italic">&quot;Kitchen refueling in progress. Check back shortly.&quot;</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {bites.map((item) => (
                            <Card key={item.id} className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm hover:shadow-2xl transition-all group flex flex-col justify-between text-left relative overflow-hidden">
                                <div className="relative z-10 space-y-6">
                                    <div className="aspect-[4/3] rounded-[2rem] bg-slate-50 border border-slate-100 relative overflow-hidden flex items-center justify-center p-6 shadow-inner group-hover:scale-105 transition-transform duration-700">
                                        <Image src={normalizeImage(item.image_url)} alt={item.name} fill className="object-contain p-4" />
                                        <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/60 shadow-sm flex items-center gap-1.5">
                                            <Clock size={12} className="text-primary" />
                                            <span className="text-[9px] font-black uppercase text-foreground">{item.prep_time} min prep</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex justify-between items-start">
                                            <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-tight">{item.name}</h3>
                                            <p className="text-2xl font-black text-primary tracking-tighter">{formatPrice(item.price)}</p>
                                        </div>
                                        <p className="text-xs font-medium text-slate-500 italic leading-relaxed">
                                            {item.description || 'Freshly prepared hot street bite, served with house kachumbari & sauce.'}
                                        </p>
                                    </div>

                                    {/* Drink Pairings Badge */}
                                    {item.drink_pairings && item.drink_pairings.length > 0 && (
                                        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60 space-y-1.5">
                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase text-amber-800 tracking-wider">
                                                <Coffee size={12} className="text-amber-600" /> Suggested Drink Pairings
                                            </div>
                                            <p className="text-[10px] font-bold text-amber-900 uppercase">
                                                {item.drink_pairings.join(' • ')}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-50 relative z-10">
                                    <Button
                                        onClick={() => handleAddBite(item)}
                                        className={cn(
                                            "w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all",
                                            addedId === item.id ? "bg-emerald-500 text-white" : "bg-primary text-white shadow-primary/20 hover:scale-[1.02] active:scale-95"
                                        )}
                                    >
                                        {addedId === item.id ? <><CheckCircle2 size={16} className="mr-2" /> Secured in Bag!</> : <><ShoppingBag size={16} className="mr-2" /> + Add to Order</>}
                                    </Button>
                                </div>

                                <Zap className="absolute -bottom-6 -right-6 h-32 w-32 text-primary/5 rotate-12 -z-0" />
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
