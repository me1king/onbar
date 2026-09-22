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
    Check
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
    { id: '20K', label: '10K - 20K+', val: 20000 },
];

interface BuildResult {
    id: number;
    name: string;
    price: number;
    image_url: string;
    category: string;
}

export default function BuildMyNightWidget() {
    const [step, setStep] = React.useState(1);
    const [occasion, setOccasion] = React.useState<string | null>(null);
    const [budget, setBudget] = React.useState<number | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [results, setResults] = React.useState<BuildResult[]>([]);
    const { addBundleToCart } = useCart();

    const handleGenerate = async () => {
        if (!occasion || !budget || !supabase) return;
        setLoading(true);
        try {
            const { data } = await supabase
                .from('products')
                .select('id, name, price, image_url, category')
                .lte('price', budget)
                .order('price', { ascending: false })
                .limit(4);

            if (data) setResults(data as BuildResult[]);
            setStep(3);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddAll = () => {
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
        alert("Your night has been established in the bag! 🥂");
    };

    const handleOccasionSelect = (id: string) => {
        setOccasion(id);
        setStep(2);
        OB_OS.track('UI_INTERACTION', { details: { id: 'concierge.occasion_selected', value: id } });
    };

    return (
        <section id="hero-section" className="relative min-h-[85vh] flex items-center overflow-hidden px-6 sm:px-12 lg:px-20 py-20 bg-white">

            {/* Soft Neural Accents */}
            <div className="absolute top-0 right-0 w-1/2 h-full bg-slate-50/50 rounded-l-[10rem] -z-10" />

            <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-12 gap-16 items-center relative z-10">

                {/* LEFT: CONTENT (True Original Style) */}
                <div className="lg:col-span-5 space-y-10 text-left animate-in fade-in slide-in-from-left-8 duration-700">
                    <div className="space-y-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#F5A000]/10 rounded-full text-[9px] font-black uppercase tracking-widest text-[#F5A000] border border-[#F5A000]/10">
                            <Sparkles size={12} /> DIGITAL CONCIERGE
                        </div>

                        <h1 className="text-5xl sm:text-7xl lg:text-[7rem] font-black uppercase tracking-tighter text-[#2D3748] leading-[0.85] font-sans break-words">
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
                    <Card className="p-10 sm:p-12 rounded-[4rem] bg-white border border-slate-50 shadow-2xl relative overflow-hidden min-h-[550px] flex flex-col justify-between">

                        {step === 1 && (
                            <div className="space-y-12 animate-in fade-in slide-in-from-right-10 duration-700">
                                <h3 className="text-3xl font-black uppercase tracking-tighter text-[#2D3748]">WHAT ARE YOU PLANNING?</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                            <div className="space-y-12 animate-in fade-in slide-in-from-right-10 duration-700">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-3xl font-black uppercase tracking-tighter text-[#2D3748]">TARGET BUDGET</h3>
                                    <button onClick={() => setStep(1)} className="text-[10px] font-black text-slate-400 uppercase hover:text-primary">Back</button>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {BUDGETS.map(bug => (
                                        <button
                                            key={bug.id}
                                            onClick={() => setBudget(bug.val)}
                                            className={cn(
                                                "p-8 rounded-[2.5rem] border-2 transition-all flex justify-between items-center group/bug",
                                                budget === bug.val ? "border-primary bg-primary/5" : "border-slate-50 bg-slate-50 hover:border-slate-200 hover:bg-white"
                                            )}
                                        >
                                            <span className="text-xl font-black uppercase tracking-tighter">{bug.label}</span>
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
                                    disabled={loading || !budget}
                                    className="w-full h-20 rounded-[2rem] bg-slate-900 text-white font-black uppercase text-xs tracking-[0.3em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : "ESTABLISH EXPERIENCE"}
                                </Button>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-700">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground leading-none">Your Night is Ready</h3>
                                        <p className="text-[10px] font-black text-[#F5A000] uppercase tracking-widest mt-2">{occasion?.replace('_', ' ')} &bull; {formatPrice(budget!)} Limit</p>
                                    </div>
                                    <button onClick={() => setStep(1)} className="text-[10px] font-black text-slate-400 uppercase hover:text-primary underline">Restart</button>
                                </div>

                                <div className="grid gap-3">
                                    {results.map(prod => (
                                        <div key={prod.id} className="p-4 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between group hover:bg-white transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="h-14 w-14 rounded-2xl bg-white p-2 border border-slate-100 flex items-center justify-center relative overflow-hidden">
                                                    <Image src={normalizeImage(prod.image_url)} alt="" fill className="object-contain p-2" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-[11px] font-black uppercase text-foreground leading-none truncate max-w-[150px]">{prod.name}</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{prod.category}</p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-black text-primary">{formatPrice(prod.price)}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Experience Total</p>
                                        <p className="text-2xl font-black text-foreground">{formatPrice(results.reduce((s, r) => s + Number(r.price), 0))}</p>
                                    </div>
                                    <Button onClick={handleAddAll} className="h-16 px-10 rounded-2xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all flex items-center gap-3">
                                        Add Entire Selection <ArrowRight size={16} />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Decoration */}
                        <Zap className="absolute -bottom-10 -right-10 h-64 w-64 text-slate-50 rotate-12 -z-0" />
                    </Card>
                </div>

            </div>
        </section>
    );
}
