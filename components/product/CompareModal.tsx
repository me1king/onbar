'use client';

import { useState } from 'react';
import { X, Zap, Trophy, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice, normalizeImage } from '@/lib/utils';
import Image from 'next/image';
import { Product } from '@/types/product';

export default function CompareModal({
    p1,
    p2,
    onClose
}: {
    p1: Product,
    p2: Product,
    onClose: () => void
}) {
    const [img1Error, setImg1Error] = useState(false);
    const [img2Error, setImg2Error] = useState(false);

    // Build a flat list of specs to compare
    const getSpecs = (p: Product) => {
        const specs: Record<string, string> = {};
        if (p.category) specs['Category'] = p.category;
        if (p.brand) specs['Brand'] = p.brand;
        if (p.origin) specs['Origin'] = p.origin;
        if (p.abv_label) specs['ABV'] = p.abv_label;
        if (p.size_label) specs['Size'] = p.size_label;
        if (p.manufacturer) specs['Producer'] = p.manufacturer;

        // Include any manual specs
        if (p.specifications) {
            p.specifications.forEach(s => {
                specs[s.key] = s.value;
            });
        }

        return specs;
    };

    const s1 = getSpecs(p1);
    const s2 = getSpecs(p2);
    const allKeys = Array.from(new Set([...Object.keys(s1), ...Object.keys(s2)]));

    const cheaperProduct = p1.price < p2.price ? p1 : p2;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-500/10 backdrop-blur-xl p-4 animate-in fade-in duration-500">
            <div className="bg-white rounded-2xl sm:rounded-[3.5rem] w-full min-w-0 max-w-5xl max-h-[90dvh] overflow-hidden shadow-2xl flex flex-col border border-white/20">

                <header className="p-4 sm:p-12 border-b border-slate-50 flex items-center justify-between gap-3 shrink-0 bg-slate-50/50">
                    <div className="min-w-0">
                        <h2 className="text-xl sm:text-3xl font-black text-foreground uppercase tracking-tighter">Premium Comparison</h2>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mt-1">Deep Spec Analysis Active</p>
                    </div>
                    <button onClick={onClose} className="h-11 w-11 sm:h-14 sm:w-14 shrink-0 rounded-full bg-white shadow-xl flex items-center justify-center text-slate-400 hover:text-brand-red hover:rotate-90 transition-all duration-300 border border-slate-100">
                        <X className="h-5 w-5 sm:h-6 sm:w-6" />
                    </button>
                </header>

                <div className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-12 no-scrollbar">
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-3 gap-2 sm:gap-8 mb-8 sm:mb-16 items-start">
                        <div className="flex flex-col items-center justify-center border-r border-slate-100 pr-1 sm:pr-8 pt-8 sm:pt-20 space-y-4">
                            <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm"><Zap className="h-4 w-4 sm:h-6 sm:w-6" /></div>
                            <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-300 tracking-[0.3em] rotate-180 [writing-mode:vertical-lr]">Visual Profile</p>
                        </div>

                        {/* Product 1 */}
                        <div className="text-center space-y-6 relative group">
                            {p1.id === cheaperProduct.id && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[8px] font-black uppercase px-3 py-1 rounded-full shadow-lg z-20 animate-bounce">Best Value</div>
                            )}
                            <div className="relative aspect-square w-full min-w-0 rounded-xl sm:rounded-[2.5rem] bg-white flex items-center justify-center p-1 sm:p-2 border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden">
                                {!img1Error ? (
                                    <Image
                                        src={normalizeImage(p1.image || p1.image_url)}
                                        alt={p1.name}
                                        fill
                                        className="object-contain p-4 transform group-hover:scale-110 transition-transform duration-700"
                                        onError={() => setImg1Error(true)}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-slate-300">
                                        <EyeOff className="h-8 w-8" />
                                        <span className="text-[8px] font-black uppercase">Image Load Error</span>
                                    </div>
                                )}
                            </div>
                            <div className="px-2">
                                <h3 className="font-black text-foreground uppercase text-[11px] sm:text-xs tracking-tight mb-2 h-8 line-clamp-2 leading-none italic">{p1.name}</h3>
                                <p className="text-2xl font-black text-primary tracking-tighter">{formatPrice(p1.price)}</p>
                            </div>
                        </div>

                        {/* Product 2 */}
                        <div className="text-center space-y-6 relative group">
                            {p2.id === cheaperProduct.id && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[8px] font-black uppercase px-3 py-1 rounded-full shadow-lg z-20 animate-bounce">Best Value</div>
                            )}
                            <div className="relative aspect-square w-full min-w-0 rounded-xl sm:rounded-[2.5rem] bg-white flex items-center justify-center p-1 sm:p-2 border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden">
                                {!img2Error ? (
                                    <Image
                                        src={normalizeImage(p2.image || p2.image_url)}
                                        alt={p2.name}
                                        fill
                                        className="object-contain p-4 transform group-hover:scale-110 transition-transform duration-700"
                                        onError={() => setImg2Error(true)}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-slate-300">
                                        <EyeOff className="h-8 w-8" />
                                        <span className="text-[8px] font-black uppercase">Image Load Error</span>
                                    </div>
                                )}
                            </div>
                            <div className="px-2">
                                <h3 className="font-black text-foreground uppercase text-[11px] sm:text-xs tracking-tight mb-2 h-8 line-clamp-2 leading-none italic">{p2.name}</h3>
                                <p className="text-2xl font-black text-primary tracking-tighter">{formatPrice(p2.price)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-8 items-center py-3 sm:py-4 px-2 sm:px-6 bg-slate-50 border border-slate-100 rounded-2xl mb-6 shadow-sm">
                            <span className="min-w-0 text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 break-words">Beverage Specs</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground text-center">Unit Alpha</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground text-center">Unit Beta</span>
                        </div>

                        {allKeys.map(key => (
                            <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-8 items-center py-4 sm:py-6 border-b border-slate-50 hover:bg-slate-50/50 rounded-2xl transition-colors group/row">
                                <div className="min-w-0 pl-1 sm:pl-6">
                                    <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 break-words group-hover/row:text-primary transition-colors">{key}</span>
                                </div>
                                <div className="min-w-0 text-center">
                                    <span className="text-[10px] sm:text-xs font-bold text-foreground break-words">{s1[key] || 'Not specified'}</span>
                                </div>
                                <div className="min-w-0 text-center">
                                    <span className="text-[10px] sm:text-xs font-bold text-foreground break-words">{s2[key] || 'Not specified'}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 sm:mt-16 p-4 sm:p-8 bg-brand-red/5 rounded-[2rem] border border-brand-red/10 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-xl bg-white flex items-center justify-center text-brand-red shadow-sm border border-brand-red/10"><Trophy className="h-5 w-5 sm:h-6 sm:w-6" /></div>
                            <div className="min-w-0">
                                <p className="font-black text-foreground uppercase text-xs">Apex Recommendation</p>
                                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">Best choice for your selection</p>
                            </div>
                        </div>
                        <div className="min-w-0 max-w-full text-left sm:text-right">
                            <p className="text-[10px] font-black uppercase text-emerald-600 mb-1">Pick of the day</p>
                            <p className="font-black text-foreground uppercase text-[10px] sm:text-xs tracking-tight italic break-words">{cheaperProduct.name}</p>
                        </div>
                    </div>
                </div>

                <footer className="p-3 sm:p-8 border-t border-slate-50 flex gap-4 shrink-0 bg-white">
                    <Button onClick={onClose} className="min-w-0 flex-1 h-12 sm:h-16 rounded-xl sm:rounded-[1.5rem] bg-brand-red text-white font-black uppercase text-[9px] sm:text-[11px] tracking-widest shadow-2xl shadow-brand-red/30 hover:bg-brand-red/90 hover:scale-[1.01] active:scale-95 transition-all border-none">Close Comparison View</Button>
                </footer>

            </div>
        </div>
    );
}
