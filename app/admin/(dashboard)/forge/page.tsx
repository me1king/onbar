'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
    Zap,
    Search,
    RefreshCcw,
    ChevronRight,
    Loader2,
    Database,
    ShieldCheck,
    AlertTriangle,
    Flame,
    Box,
    Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

interface ForgeProduct {
    id: number;
    name: string;
    brand: string;
    price: number;
    image_url: string;
    has_3d: boolean;
    stock: number;
}

type ForgeFilterMode = 'all' | '3d' | 'gaps' | 'readiness';

export default function ProductForgeDashboard() {
    const [products, setProducts] = React.useState<ForgeProduct[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [filterMode, setFilterMode] = React.useState<ForgeFilterMode>('all');

    const fetchData = React.useCallback(async () => {
        if (!supabase) {
            setProducts([]);
            setLoadError('The catalog database is not configured. Contact your administrator.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError('');
        try {
            const { data, error } = await supabase
                .from('products')
                .select('id, name, brand, price, image_url, stock, beverage_specs')
                .order('name')
                .limit(1000)
                .abortSignal(AbortSignal.timeout(15000));

            if (error) throw error;
            setProducts((data || []).map(p => ({
                id: p.id,
                name: p.name,
                brand: p.brand || 'Brand unavailable',
                price: p.price,
                image_url: p.image_url,
                stock: p.stock,
                has_3d: !!p.beverage_specs?.model_3d_url
            })));
        } catch (err) {
            console.error('[ProductForge] Could not load the product catalog:', err);
            setLoadError(err instanceof Error && err.name === 'AbortError'
                ? 'The catalog request timed out. Check your connection and try again.'
                : 'The product catalog could not be loaded. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filtered = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                             p.brand.toLowerCase().includes(search.toLowerCase());

        let matchesFilter = true;
        if (filterMode === '3d') matchesFilter = p.has_3d;
        if (filterMode === 'gaps') matchesFilter = !p.image_url || !p.has_3d;
        if (filterMode === 'readiness') matchesFilter = Boolean(p.image_url) && p.has_3d;

        return matchesSearch && matchesFilter;
    });

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20">

            {/* FORGE DASHBOARD HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Flame className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary italic text-left">Catalogue Intelligence Node</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Product <span className="text-primary">Studio.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Transform raw inventory into high-conversion digital assets.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={fetchData} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Re-Scan Catalog
                    </Button>
                    <Link href="/lord/upload">
                        <Button className="rounded-xl h-12 px-6 bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:scale-[1.02] active:scale-95 transition-all">
                            <Database size={14} className="mr-2" /> Initialize New Node
                        </Button>
                    </Link>
                </div>
            </header>

            {/* CATALOG ANALYTICS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { id: 'all', label: 'Catalog Products', val: products.length, icon: ShieldCheck, color: 'emerald' },
                    { id: '3d', label: '3D Coverage', val: `${Math.round((products.filter(p => p.has_3d).length / products.length) * 100) || 0}%`, icon: Box, color: 'indigo' },
                    { id: 'gaps', label: 'Media Gaps', val: products.filter(p => !p.image_url || !p.has_3d).length, icon: AlertTriangle, color: 'rose' },
                    { id: 'readiness', label: 'Complete Media', val: products.filter(p => Boolean(p.image_url) && p.has_3d).length, icon: Zap, color: 'primary' },
                ].map(stat => (
                    <Card
                        key={stat.label}
                        onClick={() => setFilterMode(stat.id as ForgeFilterMode)}
                        className={cn(
                            "p-8 rounded-[3rem] bg-white border shadow-sm group hover:shadow-xl transition-all text-left cursor-pointer",
                            filterMode === stat.id ? "border-primary ring-2 ring-primary/10" : "border-slate-100"
                        )}
                    >
                        <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center mb-6 shadow-inner transition-transform group-hover:scale-110",
                            stat.color === 'primary' ? "bg-primary/10 text-primary" :
                            stat.color === 'emerald' ? "bg-emerald-50 text-emerald-500" :
                            stat.color === 'rose' ? "bg-rose-50 text-rose-500" :
                            "bg-indigo-50 text-indigo-500"
                        )}>
                            <stat.icon size={20} />
                        </div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">{stat.val}</h3>
                    </Card>
                ))}
            </div>

            {/* FORGE GRID */}
            <div className="space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-4">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Grid Decryption</h2>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                            <Input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by SKU or Name..."
                                className="h-12 w-80 pl-12 rounded-2xl bg-white border-slate-100 text-[10px] font-black uppercase tracking-widest shadow-sm"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {loading && products.length === 0 ? (
                        <div className="col-span-full py-40 flex flex-col items-center gap-6">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Synchronizing Forge Hub...</p>
                        </div>
                    ) : loadError && products.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center gap-4 rounded-3xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
                            <AlertTriangle className="h-8 w-8 text-amber-600" />
                            <p role="alert" className="max-w-lg text-sm font-semibold text-amber-900">{loadError}</p>
                            <Button onClick={fetchData} variant="outline" className="rounded-xl border-amber-300 bg-white px-5 font-bold text-amber-900 hover:bg-amber-100">
                                <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Try again
                            </Button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                            No product data available
                        </div>
                    ) : filtered.map(item => (
                        <Card key={item.id} className="rounded-[3.5rem] bg-white border border-slate-100 shadow-sm hover:shadow-2xl transition-all group overflow-hidden flex flex-col h-full text-left">
                            {/* SCORE HEADER */}
                            <div className="px-8 pt-8 pb-4 flex justify-between items-start">
                                <div className={cn(
                                    "px-4 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest",
                                    item.image_url && item.has_3d ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                    "bg-rose-50 text-rose-600 border-rose-100"
                                )}>
                                    Media: {item.image_url && item.has_3d ? 'Complete' : 'Incomplete'}
                                </div>
                                {item.has_3d && <Box size={14} className="text-indigo-400 animate-pulse" />}
                            </div>

                            <div className="p-8 pt-4 space-y-6 flex-1 flex flex-col">
                                <div className="flex gap-6 items-center">
                                    <div className="h-20 w-20 rounded-3xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center p-2 group-hover:scale-105 transition-transform relative">
                                        {item.image_url ? (
                                            <Image
                                                src={normalizeImage(item.image_url)}
                                                alt={item.name}
                                                fill
                                                className="object-contain p-2"
                                            />
                                        ) : (
                                            <Sparkles className="text-slate-200" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1 text-left">
                                        <p className="text-[9px] font-black uppercase text-primary tracking-widest mb-1 truncate">{item.brand}</p>
                                        <h3 className="text-xl font-black text-foreground uppercase tracking-tight truncate leading-tight italic">{item.name}</h3>
                                        <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase truncate">{formatPrice(item.price)} • {item.stock} Units</p>
                                    </div>
                                </div>

                                {/* GAP ANALYSIS */}
                                <div className="space-y-3 bg-slate-50 p-6 rounded-[2rem] border border-slate-100/50">
                                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Readiness Protocol</p>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            {item.image_url ? <ShieldCheck size={10} className="text-emerald-500" /> : <AlertTriangle size={10} className="text-amber-500" />}
                                            <span className="text-[8px] font-black uppercase text-slate-500">{item.image_url ? 'Product Image Available' : 'Product Image Missing'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {item.has_3d ? (
                                                <ShieldCheck size={10} className="text-emerald-500" />
                                            ) : (
                                                <AlertTriangle size={10} className="text-amber-500" />
                                            )}
                                            <span className="text-[8px] font-black uppercase text-slate-500">{item.has_3d ? '3D Stage Established' : '3D Model Missing'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CTA */}
                            <Link href={`/lord/forge/${item.id}`}>
                                <button className="w-full h-20 bg-slate-900 group-hover:bg-primary transition-colors flex items-center justify-center gap-3 text-white">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Enter Forge Node</span>
                                    <ChevronRight size={16} />
                                </button>
                            </Link>
                        </Card>
                    ))}
                </div>
                {loadError && products.length > 0 && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{loadError} Showing the last successfully loaded catalog.</p>
                )}
            </div>

            {/* MASTER HUD OVERLAY */}
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
                 <div className="bg-white/90 backdrop-blur-2xl px-10 py-5 rounded-[2.5rem] shadow-2xl flex items-center gap-10 border border-slate-100">
                    <Link href="/lord/audit" className="flex items-center gap-4 hover:bg-slate-50 p-2 rounded-xl transition-all">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <div>
                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none">Catalog Status</p>
                            <p className="text-[10px] font-black text-foreground uppercase mt-1">Health unavailable</p>
                        </div>
                    </Link>
                    <div className="h-8 w-[1px] bg-slate-100" />
                    <Link href="/lord/upload" className="hover:bg-slate-50 p-2 rounded-xl transition-all">
                        <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none text-left">Total Nodes</p>
                        <p className="text-[10px] font-black text-foreground uppercase mt-1 text-left">{products.length}</p>
                    </Link>
                    <div className="h-8 w-[1px] bg-slate-100" />
                    <button onClick={fetchData} className="flex items-center gap-3 hover:bg-slate-50 p-2 rounded-xl transition-all">
                        <Sparkles size={14} className="text-primary" />
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">AI Command Active</span>
                    </button>
                 </div>
            </div>

        </div>
    );
}
