'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import {
    Moon,
    Users,
    ArrowRight,
    Sparkles,
    Wine,
    Heart,
    Zap,
    Loader2,
    Check,
    ShoppingBag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useCart } from '@/context/CartContext';
import { OB_OS } from '@/lib/onlineBarOS';
import Image from 'next/image';
import Link from 'next/link';

const OCCASIONS = [
    { id: 'CELEBRATION', label: 'CELEBRATION', icon: Sparkles, color: 'bg-[#F5A000]/10 text-[#F5A000]' },
    { id: 'DATE_NIGHT', label: 'DATE NIGHT', icon: Heart, color: 'bg-rose-50 text-rose-500' },
    { id: 'PARTY', label: 'HOUSE PARTY', icon: Users, color: 'bg-indigo-50 text-indigo-500' },
    { id: 'DINNER', label: 'DINNER TONIGHT', icon: Wine, color: 'bg-emerald-50 text-emerald-500' },
    { id: 'CHILL', label: 'CHILL NIGHT', icon: Moon, color: 'bg-slate-100 text-slate-500' },
    { id: 'GIFT', label: 'PREMIUM GIFT', icon: Zap, color: 'bg-amber-50 text-amber-600' },
];

const BUDGETS = [
    { id: '2K', label: 'Under 2.5K', val: 2500 },
    { id: '5K', label: '2.5K - 5K', val: 5000 },
    { id: '10K', label: '5K - 10K', val: 10000 },
    { id: '20K', label: '10K - 20K', val: 20000 },
];

interface BuildResult {
    id: number;
    name: string;
    price: number;
    image_url: string;
    category: string;
    stock: number;
    is_available_now: boolean | null;
    is_souvenir: boolean | null;
}

export default function BuildMyNightWidget({ compact = false }: { compact?: boolean }) {
    const [step, setStep] = React.useState(1);
    const [occasion, setOccasion] = React.useState<string | null>(null);
    const [budget, setBudget] = React.useState<number | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [results, setResults] = React.useState<BuildResult[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [addedToCart, setAddedToCart] = React.useState(false);
    const { addBundleToCart } = useCart();

    const handleGenerate = async () => {
        if (!occasion || !budget) {
            setError('Choose an occasion and a budget to build your night.');
            return;
        }
        if (!supabase) {
            setError('Product recommendations are unavailable because the store connection is not configured.');
            return;
        }
        setLoading(true);
        setError(null);
        setAddedToCart(false);
        try {
            const { data, error: productsError } = await supabase
                .from('products')
                .select('id, name, price, image_url, category, stock, is_available_now, is_souvenir')
                .gt('stock', 0)
                .order('price', { ascending: true })
                .limit(100);
            if (productsError) throw productsError;

            const eligible = (data || [])
                .filter(product =>
                    product.is_available_now !== false
                    && product.is_souvenir !== true
                    && Number(product.stock) > 0
                    && Number.isFinite(Number(product.price))
                    && Number(product.price) > 0
                    && Number(product.price) <= budget
                )
                .map(product => ({
                    ...product,
                    price: Number(product.price),
                    image_url: product.image_url || '',
                    category: product.category || 'Beverages',
                    stock: Number(product.stock)
                })) as BuildResult[];

            let currentSum = 0;
            const selected: BuildResult[] = [];
            for (const product of eligible) {
                if (currentSum + product.price <= budget) {
                    selected.push(product);
                    currentSum += product.price;
                }
                if (selected.length >= 3) break;
            }
            if (selected.length === 0) {
                setResults([]);
                setError(`No in-stock products fit under ${formatPrice(budget)} right now. Try a higher budget or check back later.`);
                return;
            }
            setResults(selected);
            setStep(3);
        } catch (requestError) {
            console.error('[BuildMyNight] Could not generate recommendations:', requestError);
            setError(requestError instanceof Error
                ? `Could not load recommendations: ${requestError.message}`
                : 'Could not load recommendations. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddAll = () => {
        if (results.length === 0) {
            setError('There are no products to add. Build your selection first.');
            return;
        }
        const items = results.map(r => ({
            id: r.id,
            name: r.name,
            price: r.price,
            base_price: r.price,
            image: normalizeImage(r.image_url),
            quantity: 1,
            category: r.category
        }));
        addBundleToCart(items);
        setAddedToCart(true);
        setError(null);
    };

    const handleOccasionSelect = (id: string) => {
        setOccasion(id);
        setStep(2);
        setError(null);
        setAddedToCart(false);
        OB_OS.track('UI_INTERACTION', { details: { id: 'concierge.occasion_selected', value: id } });
    };

    return (
        <section id="hero-section" className={cn(
            "relative flex items-center overflow-hidden bg-white px-4 sm:px-8 lg:px-20",
            compact ? "min-h-0 py-4" : "min-h-[70dvh] py-8 sm:py-12 lg:min-h-[85vh] lg:py-20"
        )}>

            {/* Soft Neural Accents */}
            <div className="absolute top-0 right-0 w-1/2 h-full bg-slate-50/50 rounded-l-[10rem] -z-10" />

            <div className={cn("relative z-10 mx-auto grid w-full max-w-7xl items-center lg:grid-cols-12", compact ? "gap-4 lg:gap-8" : "gap-8 lg:gap-16")}>

                {/* LEFT: CONTENT (True Original Style) */}
                <div className="space-y-6 text-left animate-in fade-in slide-in-from-left-8 duration-700 lg:col-span-5 lg:space-y-10">
                    <div className="space-y-5 lg:space-y-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#F5A000]/10 rounded-full text-[9px] font-black uppercase tracking-widest text-[#F5A000] border border-[#F5A000]/10">
                            <Sparkles size={12} /> DIGITAL CONCIERGE
                        </div>

                        <h1 className="break-words font-sans text-5xl font-black uppercase leading-[0.9] tracking-tighter text-[#2D3748] sm:text-7xl lg:text-[7rem]">
                            BUILD MY <br />
                            <span className="text-[#F5A000]">NIGHT.</span>
                        </h1>

                        <p className="text-slate-500 font-medium text-lg leading-relaxed italic max-w-sm break-words">
                            &quot;Planning the perfect evening shouldn&apos;t be tactical. Select your occasion, set your budget, and I will handle the inventory.&quot;
                        </p>

                        <div className="flex gap-2 pt-2">
                            {[1, 2, 3].map(s => (
                                <div key={s} className={cn(
                                    "h-1.5 w-10 rounded-full transition-all duration-500",
                                    step >= s ? "bg-[#F5A000]" : "bg-slate-100"
                                )} />
                            ))}
                        </div>
                    </div>

                    <div className="pt-6">
                        <Link href="/shop" className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 hover:text-primary transition-all flex items-center gap-2">
                            JUST BROWSING? OPEN GLOBAL MENU &rarr;
                        </Link>
                    </div>
                </div>

                {/* RIGHT: INTERACTIVE HUD (Original Screenshot Style) */}
                <div className="lg:col-span-7">
                    <Card className={cn(
                        "relative flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-2xl sm:rounded-[2.5rem] sm:p-8 lg:rounded-[4rem] lg:p-12",
                        compact ? "min-h-0" : "min-h-[460px] sm:min-h-[500px] lg:min-h-[550px]"
                    )}>

                        {step === 1 && (
                            <div className={cn("relative z-10 animate-in fade-in slide-in-from-right-10 sm:space-y-10", compact ? "space-y-5 duration-300" : "space-y-7 duration-700")}>
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-[#2D3748] sm:text-3xl">What are you planning?</h3>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                                    {OCCASIONS.map(occ => (
                                        <button
                                            key={occ.id}
                                            onClick={() => handleOccasionSelect(occ.id)}
                                            className={cn(
                                                "p-6 rounded-[2.5rem] border-2 transition-all flex flex-col items-center gap-4 group/occ relative overflow-hidden",
                                                occasion === occ.id ? "border-primary bg-primary/5" : "border-slate-50 bg-slate-50/30 hover:border-slate-100 hover:bg-white"
                                            )}
                                        >
                                            <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center transition-all group-hover/occ:scale-110 shadow-sm", occ.color)}>
                                                <occ.icon size={28} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest">{occ.label}</span>
                                            {occasion === occ.id && (
                                                <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className={cn("relative z-10 animate-in fade-in slide-in-from-right-10 sm:space-y-10", compact ? "space-y-5 duration-300" : "space-y-7 duration-700")}>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-2xl font-black uppercase tracking-tighter text-[#2D3748] sm:text-3xl">Target budget</h3>
                                    <button onClick={() => { setStep(1); setError(null); }} className="text-[10px] font-black text-slate-400 uppercase hover:text-primary">Back</button>
                                </div>
                                <div className={cn("relative z-10 grid grid-cols-1 sm:grid-cols-2 sm:gap-4", compact ? "gap-2" : "gap-3")}>
                                    {BUDGETS.map(bug => (
                                        <button
                                            key={bug.id}
                                            onClick={() => { setBudget(bug.val); setError(null); setAddedToCart(false); }}
                                            className={cn(
                                                "flex items-center justify-between rounded-2xl border-2 text-left transition-all group/bug sm:rounded-[2rem] sm:p-6",
                                                compact ? "p-3" : "p-4",
                                                budget === bug.val ? "border-primary bg-primary/5" : "border-slate-50 bg-slate-50 hover:border-slate-200 hover:bg-white"
                                            )}
                                        >
                                            <span className="text-base font-black uppercase tracking-tight sm:text-xl sm:tracking-tighter">{bug.label}</span>
                                            <div className={cn(
                                                "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                                                budget === bug.val ? "border-primary bg-primary" : "border-slate-200"
                                            )}>
                                                {budget === bug.val && <Check size={14} className="text-white" />}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <Button
                                    onClick={handleGenerate}
                                    disabled={loading || !occasion || !budget}
                                    className={cn("relative z-20 w-full rounded-2xl bg-slate-900 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-xl transition-all hover:scale-[1.01] active:scale-95 sm:h-20 sm:rounded-[2rem] sm:text-xs sm:tracking-[0.3em]", compact ? "h-12" : "h-14")}
                                >
                                    {loading ? <><Loader2 className="animate-spin" /> Finding in-stock picks...</> : "Build my selection"}
                                </Button>
                                {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
                            </div>
                        )}

                        {step === 3 && (
                            <div className={cn("relative z-10 animate-in fade-in zoom-in-95 sm:space-y-8", compact ? "space-y-4 duration-300" : "space-y-6 duration-700")}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none sm:text-2xl">Your night is ready</h3>
                                        <p className="text-[10px] font-black text-[#F5A000] uppercase tracking-widest mt-2">{occasion?.replace('_', ' ')} &bull; {formatPrice(budget!)} Limit</p>
                                    </div>
                                    <button onClick={() => { setStep(1); setBudget(null); setResults([]); setError(null); setAddedToCart(false); }} className="text-[10px] font-black text-slate-400 uppercase hover:text-primary underline">Restart</button>
                                </div>

                                <div className="grid gap-3">
                                    {results.map(prod => (
                                        <div key={prod.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 transition-all hover:bg-white sm:rounded-3xl sm:p-4">
                                            <div className="flex items-center gap-4">
                                                <div className="h-14 w-14 rounded-2xl bg-white p-2 border border-slate-100 flex items-center justify-center relative overflow-hidden">
                                                    <Image src={normalizeImage(prod.image_url)} alt="" fill className="object-contain p-2" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="max-w-[150px] truncate text-[11px] font-black uppercase leading-none text-foreground sm:max-w-[220px]">{prod.name}</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{prod.category}</p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-black text-primary">{formatPrice(prod.price)}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="relative z-20 flex flex-col items-start justify-between gap-4 border-t border-slate-100 bg-white pt-5 sm:flex-row sm:items-center sm:pt-6">
                                    <div className="text-left">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Experience Total</p>
                                        <p className="text-2xl font-black text-foreground">{formatPrice(results.reduce((s, r) => s + Number(r.price), 0))}</p>
                                    </div>
                                    <Button onClick={handleAddAll} disabled={addedToCart} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-2xl transition-all hover:bg-primary/90 active:scale-95 disabled:bg-emerald-600 sm:h-14 sm:w-auto sm:rounded-2xl sm:px-8">
                                        {addedToCart ? <><Check size={16} /> Added to bag</> : <>Add selection to bag <ShoppingBag size={16} /> </>}
                                    </Button>
                                </div>
                                {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
                                {addedToCart && (
                                    <Link href="/cart" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 underline underline-offset-4">
                                        Your picks are in the bag. Review cart <ArrowRight size={15} />
                                    </Link>
                                )}
                            </div>
                        )}

                        {/* Background Decoration */}
                        <Zap className="pointer-events-none absolute -bottom-10 -right-10 z-0 h-64 w-64 select-none rotate-12 text-slate-100/40" />
                    </Card>
                </div>

            </div>
        </section>
    );
}
