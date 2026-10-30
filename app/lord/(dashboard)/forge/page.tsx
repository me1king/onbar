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

interface ForgeProduct {
    id: number;
    name: string;
    brand: string;
    sku: string;
    price: number;
    image_url: string;
    has_3d: boolean;
    stock: number;
}

interface ForgeCatalogRecord {
    id: number;
    name: string | null;
    brand: string | null;
    sku: string | null;
    price: number | string | null;
    image_url: string | null;
    stock: number | null;
    beverage_specs: { model_3d_url?: string | null } | null;
}

type ForgeFilterMode = 'all' | '3d' | 'gaps' | 'readiness';
type CatalogStatus = 'checking' | 'connected' | 'unavailable';

export default function ProductForgeDashboard() {
    const [products, setProducts] = React.useState<ForgeProduct[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState('');
    const [catalogStatus, setCatalogStatus] = React.useState<CatalogStatus>('checking');
    const [search, setSearch] = React.useState('');
    const [filterMode, setFilterMode] = React.useState<ForgeFilterMode>('all');

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        setLoadError('');
        setCatalogStatus('checking');
        try {
            const response = await fetch('/api/admin/products?scope=inventory', {
                cache: 'no-store',
                signal: AbortSignal.timeout(15_000)
            });
            const result = await response.json() as { products?: ForgeCatalogRecord[]; error?: string };
            if (!response.ok) throw new Error(result.error || 'The product catalog could not be loaded.');
            if (!Array.isArray(result.products)) throw new Error('The product catalog returned an invalid response.');
            setProducts(result.products.map(product => ({
                id: Number(product.id),
                name: product.name || 'Unnamed product',
                brand: product.brand || 'Brand unavailable',
                sku: product.sku || '',
                price: Number(product.price || 0),
                image_url: product.image_url || '',
                stock: Number(product.stock || 0),
                has_3d: Boolean(product.beverage_specs?.model_3d_url)
            })));
            setCatalogStatus('connected');
        } catch (err) {
            console.error('[ProductForge] Could not load the product catalog:', err);
            setCatalogStatus('unavailable');
            setLoadError(err instanceof Error && ['AbortError', 'TimeoutError'].includes(err.name)
                ? 'The catalog request timed out. Check your connection and try again.'
                : err instanceof Error
                    ? err.message
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
                             p.brand.toLowerCase().includes(search.toLowerCase()) ||
                             p.sku.toLowerCase().includes(search.toLowerCase());

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
                    <Button onClick={fetchData} disabled={loading} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Re-Scan Catalog
                    </Button>
                    <Link href="/lord/upload" className="inline-flex h-12 items-center rounded-xl bg-slate-900 px-6 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95">
                        <Database size={14} className="mr-2" /> Initialize New Node
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
                    <button
                        key={stat.label}
                        type="button"
                        aria-pressed={filterMode === stat.id}
                        onClick={() => setFilterMode(stat.id as ForgeFilterMode)}
                        className={cn(
                            "w-full p-8 rounded-[3rem] bg-white border shadow-sm group hover:shadow-xl transition-all text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
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
                        <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-slate-400">Click to filter the product grid</p>
                    </button>
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
                        <div className="col-span-full flex flex-col items-center gap-4 rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
                            <Database className="h-9 w-9 text-slate-300" />
                            <div>
                                <p className="text-sm font-black uppercase tracking-wide text-slate-700">
                                    {products.length === 0 ? 'Your catalog is empty' : 'No products match this view'}
                                </p>
                                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                                    {products.length === 0
                                        ? 'Add your first product in Cellar Hub, then re-scan to build its media readiness profile here.'
                                        : 'Try another search or clear the current readiness filter.'}
                                </p>
                            </div>
                            {products.length === 0 ? (
                                <Link href="/lord/upload" className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                                    Add first product<ChevronRight className="ml-2 h-4 w-4" />
                                </Link>
                            ) : (
                                <Button type="button" variant="outline" onClick={() => { setSearch(''); setFilterMode('all'); }}>
                                    Clear filters
                                </Button>
                            )}
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
                                        {item.sku && <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase truncate">SKU: {item.sku}</p>}
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
                            <Link href={`/lord/forge/${item.id}`} aria-label={`Open Product Studio for ${item.name}`} className="flex h-20 w-full items-center justify-center gap-3 bg-slate-900 text-white transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Enter Forge Node</span>
                                <ChevronRight size={16} />
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
                    <div className="flex items-center gap-4 rounded-xl p-2" title={loadError || 'Authenticated product catalog request status.'}>
                        <div className={cn(
                            'h-2 w-2 rounded-full',
                            catalogStatus === 'connected' ? 'bg-emerald-500 animate-pulse'
                                : catalogStatus === 'unavailable' ? 'bg-rose-500'
                                    : 'bg-amber-400 animate-pulse'
                        )} />
                        <div>
                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none">Catalog Connection</p>
                            <p className="text-[10px] font-black text-foreground uppercase mt-1">
                                {catalogStatus === 'connected' ? 'Connected' : catalogStatus === 'unavailable' ? 'Unavailable' : 'Checking'}
                            </p>
                        </div>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-100" />
                    <Link href="/lord/upload" className="hover:bg-slate-50 p-2 rounded-xl transition-all">
                        <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none text-left">Total Nodes</p>
                        <p className="text-[10px] font-black text-foreground uppercase mt-1 text-left">{products.length}</p>
                    </Link>
                    <div className="h-8 w-[1px] bg-slate-100" />
                    <button type="button" onClick={fetchData} disabled={loading} className="flex items-center gap-3 rounded-xl p-2 transition-all hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
                        <Sparkles size={14} className="text-primary" />
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{loading ? 'Syncing catalog' : 'Refresh studio data'}</span>
                    </button>
                 </div>
            </div>

        </div>
    );
}
