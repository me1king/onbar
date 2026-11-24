'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Cookie,
    Zap,
    Flame,
    ArrowLeft,
    Star,
    Clock,
    Loader2,
    Utensils
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProductCard from '@/components/home/ProductCard';
import { Product } from '@/types/product';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { isSnackProduct } from '@/lib/productDepartment';

const SUBCATS = [
    { label: 'Trending', icon: Flame },
    { label: 'Crisps', icon: Zap },
    { label: 'Chocolate', icon: Cookie },
    { label: 'Nuts', icon: Utensils },
    { label: 'Healthy', icon: Star },
];

export default function SnackShopPage() {
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSub, setActiveSub] = useState('Trending');

    useEffect(() => {
        async function loadSnacks() {
            setLoading(true);
            if (!supabase) {
                setProducts([]);
                setLoading(false);
                return;
            }

            let query = supabase
                .from('products')
                .select('*')
                .or('is_snack.eq.true,category.ilike.%snack%,category.ilike.%munch%');

            if (activeSub !== 'Trending') {
                query = query.eq('sub_category', activeSub);
            }

            try {
                const { data, error } = await query.order('created_at', { ascending: false });
                if (error) throw error;
                setProducts(((data as unknown as Product[]) || [])
                    .filter(isStorefrontProductVisible)
                    .filter(isSnackProduct));
            } catch (error) {
                console.error('Could not load snacks:', error);
                setProducts([]);
            } finally {
                setLoading(false);
            }
        }
        loadSnacks();

        if (!supabase) return;
        const channel = supabase
            .channel('realtime_storefront_snacks')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                loadSnacks();
            })
            .subscribe();
        return () => {
            if (supabase) void supabase.removeChannel(channel);
        };
    }, [activeSub]);

    return (
        <div className="min-h-screen bg-white text-left selection:bg-primary/20">
            {/* 1. Header */}
            <header className="relative isolate overflow-hidden border-b border-amber-100 bg-[#fff8ec] py-10 sm:py-14 lg:py-16">
                <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-amber-300/40 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-0 h-72 w-72 rounded-full bg-orange-200/50 blur-3xl" />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-600 hover:text-primary transition-colors mb-8">
                        <ArrowLeft className="h-4 w-4" /> Back to Bar
                    </Link>
                    <div className="max-w-xl space-y-6">
                        <h1 className="text-5xl font-black uppercase leading-[0.94] tracking-[-0.055em] text-slate-950 sm:text-6xl md:text-7xl">
                            The Snack
                            <span className="mt-1 block text-primary">shop.</span>
                        </h1>
                        <p className="text-slate-600 text-lg font-medium leading-relaxed">
                            Premium pairings for your favourite drinks, delivered with your order.
                        </p>
                    </div>
                </div>
                <Utensils className="absolute -bottom-10 -right-10 h-64 w-64 text-primary/5 rotate-12 -z-0" />
            </header>

            {/* 2. Tactical Discovery Bar */}
            <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-wrap gap-3 items-center sticky top-20 bg-white/80 backdrop-blur-xl z-40 border-b border-slate-50">
                {SUBCATS.map((cat) => (
                    <button
                        key={cat.label}
                        onClick={() => setActiveSub(cat.label)}
                        className={cn(
                            "px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                            activeSub === cat.label
                                ? "bg-primary text-white shadow-xl shadow-primary/20 scale-105"
                                : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                        )}
                    >
                        <cat.icon className="h-3 w-3" />
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* 3. Products Grid */}
            <div id="snack-grid" className="mx-auto max-w-screen-2xl px-4 py-16 scroll-mt-32 sm:px-6 lg:px-8">
                {loading ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="animate-spin text-primary" size={40} />
                        <p className="text-[10px] font-black uppercase text-slate-300">Scanning Cellar Nodes...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className="py-32 text-center opacity-30">
                        <Cookie size={64} className="mx-auto mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest italic">Restock mission in progress for {activeSub}.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {products.map((p) => (
                            <ProductCard key={p.id} product={p} />
                        ))}
                    </div>
                )}
            </div>

            {/* 4. Quick Delivery CTA */}
            <section className="max-w-7xl mx-auto px-4 py-24 sm:px-6 lg:px-8">
                <Card className="p-12 rounded-[4rem] bg-white border border-slate-200/80 text-foreground shadow-2xl relative overflow-hidden group">
                    <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-600"><Clock className="h-6 w-6" /></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Speed Protocol</span>
                            </div>
                            <h2 className="text-5xl font-black uppercase tracking-tighter leading-none">Pair it with <br/> <span className="text-primary italic">Street Food</span></h2>
                            <p className="text-lg font-medium text-slate-500 italic max-w-sm">
                                &quot;Build one bag with food and snacks, then place everything together at checkout.&quot;
                            </p>
                            <Button
                                onClick={() => router.push('/bites')}
                                className="h-16 px-10 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest hover:bg-primary/90 transition-all shadow-xl active:scale-95 border-none"
                            >
                                Order Street Food
                            </Button>
                        </div>
                        <div className="hidden md:flex justify-center">
                            <div className="h-80 w-80 rounded-full border-4 border-white/10 flex items-center justify-center relative">
                                <div className="h-64 w-64 rounded-full bg-white/5 animate-ping absolute" />
                                <Zap className="h-32 w-32 text-white opacity-10" />
                            </div>
                        </div>
                    </div>
                    <Zap className="absolute -bottom-20 -right-20 h-[500px] w-[500px] text-white/5 rotate-45 -z-0" />
                </Card>
            </section>
        </div>
    );
}
