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
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';

interface BeverageItem {
    id: number | string;
    name: string;
    brand: string;
    category: string;
    sub_category?: string;
    price: number;
    image_url: string;
    size_label?: string;
    is_ice_cold?: boolean;
    temperature_celsius?: number;
    stock: number;
}

const CATEGORIES = ['All Drinks', 'Soft Drinks', 'Energy', 'Water', 'Juices', 'Coffee', 'Milkshakes'];

export default function BeverageCommandPage() {
    const [beverages, setBeverages] = useState<BeverageItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCat, setActiveCat] = useState('All Drinks');
    const [addedId, setAddedId] = useState<string | number | null>(null);
    const { addToCart } = useCart();

    useEffect(() => {
        async function fetchBeverages() {
            setLoading(true);
            if (!supabase) return;

            let query = supabase.from('products').select('*').eq('category', 'beverage');
            if (activeCat !== 'All Drinks') {
                query = query.eq('sub_category', activeCat);
            }

            const { data } = await query.order('created_at', { ascending: false });
            if (data && data.length > 0) {
                setBeverages(data as unknown as BeverageItem[]);
            } else {
                // Default high-end floating cards mock data if table is empty
                setBeverages([
                    {
                        id: 101,
                        name: 'Coca-Cola',
                        brand: 'Coca-Cola',
                        category: 'Soft Drink',
                        sub_category: 'Soft Drinks',
                        price: 80,
                        image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&q=80',
                        size_label: '500ml',
                        is_ice_cold: true,
                        temperature_celsius: 4.0,
                        stock: 45
                    },
                    {
                        id: 102,
                        name: 'Red Bull',
                        brand: 'Red Bull',
                        category: 'Energy Drink',
                        sub_category: 'Energy',
                        price: 220,
                        image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80',
                        size_label: '250ml',
                        is_ice_cold: true,
                        temperature_celsius: 3.5,
                        stock: 30
                    },
                    {
                        id: 103,
                        name: 'Minute Maid',
                        brand: 'Minute Maid',
                        category: 'Fresh Juice',
                        sub_category: 'Juices',
                        price: 250,
                        image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&q=80',
                        size_label: '1L',
                        is_ice_cold: true,
                        temperature_celsius: 5.0,
                        stock: 18
                    },
                    {
                        id: 104,
                        name: 'Sprite',
                        brand: 'Coca-Cola',
                        category: 'Soft Drink',
                        sub_category: 'Soft Drinks',
                        price: 80,
                        image_url: 'https://images.unsplash.com/photo-1625772299848-39176a82107c?auto=format&fit=crop&q=80',
                        size_label: '500ml',
                        is_ice_cold: true,
                        temperature_celsius: 4.0,
                        stock: 50
                    }
                ]);
            }
            setLoading(false);
        }
        fetchBeverages();
    }, [activeCat]);

    const handleAddBev = (item: BeverageItem) => {
        addToCart({
            id: Number(item.id) || Date.now(),
            name: item.name,
            price: item.price,
            base_price: item.price,
            image: normalizeImage(item.image_url),
            quantity: 1,
            category: item.category || 'Beverages'
        });
        setAddedId(item.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white text-left selection:bg-primary/20 pb-40">
            {/* HERO SECTION */}
            <header className="py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-gradient-to-b from-slate-950 to-slate-900">
                <div className="max-w-7xl mx-auto relative z-10 space-y-8">
                    <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors">
                        <ArrowLeft size={16} /> Return to Cellar
                    </Link>

                    <div className="max-w-2xl space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[9px] font-black uppercase tracking-[0.3em]">
                            <Snowflake size={14} className="animate-spin" /> Chill Meter™ Active (4°C)
                        </div>
                        <h1 className="text-5xl sm:text-7xl font-black uppercase tracking-tighter leading-none italic">
                            Beverage <span className="text-primary italic">Command.</span>
                        </h1>
                        <p className="text-slate-400 font-medium text-base sm:text-lg italic leading-relaxed">
                            &quot;Cold drinks. Instant refresh. Delivered in under 20 minutes.&quot;
                        </p>
                    </div>
                </div>

                <Coffee className="absolute -bottom-10 -right-10 h-72 w-72 text-white/5 rotate-12 pointer-events-none" />
            </header>

            {/* CATEGORY CHIPS */}
            <div className="sticky top-20 bg-slate-950/80 backdrop-blur-xl z-40 border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex gap-3 overflow-x-auto no-scrollbar">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCat(cat)}
                            className={cn(
                                "px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                                activeCat === cat ? "bg-primary text-slate-950 font-black shadow-lg shadow-primary/20 scale-105" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* FLOATING CARDS GRID */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                {loading ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Scanning Chilled Nodes...</p>
                    </div>
                ) : beverages.length === 0 ? (
                    <div className="py-32 text-center text-slate-500">
                        <Coffee size={64} className="mx-auto mb-4 opacity-20" />
                        <p className="text-sm font-black uppercase tracking-widest italic">&quot;Beverage restock mission in progress.&quot;</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {beverages.map((item) => (
                            <Card key={item.id} className="p-8 rounded-[3.5rem] bg-slate-950 border border-slate-800 shadow-2xl hover:border-primary/50 transition-all group flex flex-col justify-between text-left relative overflow-hidden">
                                <div className="relative z-10 space-y-6">
                                    {/* Price Badge */}
                                    <div className="flex justify-between items-center">
                                        <div className="bg-primary text-slate-950 px-4 py-1.5 rounded-full text-xs font-black tracking-tight shadow-lg shadow-primary/20">
                                            {formatPrice(item.price)}
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[8px] font-black uppercase">
                                            <Snowflake size={10} /> Ice Cold (4°C)
                                        </div>
                                    </div>

                                    {/* Product Image Stage */}
                                    <div className="aspect-square rounded-[2.5rem] bg-slate-900/50 border border-slate-800/80 relative overflow-hidden flex items-center justify-center p-6 shadow-inner group-hover:scale-105 transition-transform duration-700">
                                        <Image src={normalizeImage(item.image_url)} alt={item.name} fill className="object-contain p-6" />
                                    </div>

                                    {/* Product Hierarchy */}
                                    <div className="space-y-1.5">
                                        <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight leading-tight">{item.name}</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                            {item.category || 'Soft Drink'} &bull; {item.size_label || '500ml'}
                                        </p>
                                    </div>

                                    {/* Stock Indicator */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-0.5">
                                            <span className="h-2 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                            <span className="h-2 w-1.5 bg-emerald-500 rounded-full" />
                                        </div>
                                        <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">Many in stock</span>
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-800/80 relative z-10">
                                    <Button
                                        onClick={() => handleAddBev(item)}
                                        className={cn(
                                            "w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all",
                                            addedId === item.id ? "bg-emerald-500 text-white" : "bg-white text-slate-950 hover:bg-primary hover:text-slate-950 shadow-white/5 active:scale-95"
                                        )}
                                    >
                                        {addedId === item.id ? <><CheckCircle2 size={16} className="mr-2" /> Secured!</> : <><ShoppingBag size={16} className="mr-2" /> + Add</>}
                                    </Button>
                                </div>

                                <Sparkles className="absolute -bottom-6 -right-6 h-32 w-32 text-primary/5 rotate-12 -z-0" />
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
