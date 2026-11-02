'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Gift,
    Sparkles,
    ArrowLeft,
    Type,
    X,
    Plus,
    Check
} from 'lucide-react';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import DecodedImage from '@/components/ui/DecodedImage';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

interface SouvenirItem {
    id: number | string;
    name: string;
    brand?: string;
    category: string;
    material?: string;
    finish?: string;
    capacity_ml?: number;
    weight_grams?: number;
    is_souvenir?: boolean;
    price: number;
    old_price?: number;
    stock?: number;
    engraving_enabled?: boolean;
    engraving_fee?: number;
    gift_packaging_fee?: number;
    image_url?: string;
    image?: string;
    description?: string;
    story?: string;
    drink_pairings?: string[];
}

const CATEGORIES = [
    'All Souvenirs',
    'Shot Glass Vault',
    'Hip Flask Collection',
    'Whiskey Glass Collection',
    'Bottle Accessories',
    'BAR OS Wear',
    'Gift Boxes'
];

export default function SouvenirPalacePage() {
    const [souvenirs, setSouvenirs] = useState<SouvenirItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeCat, setActiveCat] = useState('All Souvenirs');
    const [addedId, setAddedId] = useState<number | string | null>(null);

    // Engraving Studio Modal State
    const [selectedEngraveItem, setSelectedEngraveItem] = useState<SouvenirItem | null>(null);
    const [engraveText, setEngraveText] = useState('');
    const [engraveFont, setEngraveFont] = useState<'classic' | 'modern' | 'signature'>('modern');
    const [engraveFinish, setEngraveFinish] = useState<'matte_black' | 'brushed_steel'>('brushed_steel');
    const [isGiftWrap, setIsGiftWrap] = useState(false);
    const [giftMessage, setGiftMessage] = useState('');
    const [spellingApproved, setSpellingApproved] = useState(false);

    const { addToCart } = useCart();

    const openEngraving = (item: SouvenirItem) => {
        setEngraveText('');
        setEngraveFont('modern');
        setEngraveFinish('brushed_steel');
        setIsGiftWrap(false);
        setGiftMessage('');
        setSpellingApproved(false);
        setSelectedEngraveItem(item);
    };

    const fetchSouvenirs = React.useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const response = await fetch('/api/catalog/products?limit=500', { cache: 'no-store' });
            const result = await response.json() as { error?: string; products?: SouvenirItem[] };
            if (!response.ok) throw new Error(result.error || 'Souvenir products could not be loaded.');

            const products = (result.products || []).filter(product =>
                product.is_souvenir === true
                || /\b(souvenir|flask|shot glass)\b/i.test(product.category || '')
            );
            setSouvenirs(products.filter(isStorefrontProductVisible));
        } catch (error) {
            console.error('[SouvenirPalace] Could not load souvenirs:', error);
            setLoadError(error instanceof Error ? error.message : 'Souvenir products could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchSouvenirs();
    }, [fetchSouvenirs]);

    const handleAddDirect = (item: SouvenirItem) => {
        const img = item.image_url || item.image || '';
        addToCart({
            id: Number(item.id) || Date.now(),
            name: item.name,
            price: item.price,
            base_price: item.price,
            image: normalizeImage(img),
            quantity: 1,
            category: item.category || 'Souvenirs'
        });
        setAddedId(item.id);
        setTimeout(() => setAddedId(null), 2000);
    };

    const handleConfirmEngraveAdd = () => {
        const text = engraveText.trim();
        if (!selectedEngraveItem || !text || text.length > 20 || !/^[A-Za-z0-9 .,'&-]+$/.test(text) || !spellingApproved) return;

        const engravingFee = Number(selectedEngraveItem.engraving_fee) || 0;
        const packagingFee = isGiftWrap ? Number(selectedEngraveItem.gift_packaging_fee) || 0 : 0;
        const finalPrice = selectedEngraveItem.price + engravingFee + packagingFee;
        const img = selectedEngraveItem.image_url || selectedEngraveItem.image || '';

        addToCart({
            id: Number(selectedEngraveItem.id) || Date.now(),
            name: selectedEngraveItem.name,
            price: finalPrice,
            base_price: selectedEngraveItem.price,
            image: normalizeImage(img),
            quantity: 1,
            category: selectedEngraveItem.category || 'Custom Merch',
            size: 'Standard',
            engraving: {
                text,
                font: engraveFont,
                finish: engraveFinish,
                giftPackage: isGiftWrap,
                giftMessage: isGiftWrap ? giftMessage.trim() || null : null,
                spellingApproved: true
            },
            engraving_fee: engravingFee,
            gift_packaging_fee: packagingFee
        });

        setAddedId(selectedEngraveItem.id);
        setSelectedEngraveItem(null);
        setTimeout(() => setAddedId(null), 2000);
    };

    const engravingText = engraveText.trim();
    const engravingTextValid = engravingText.length > 0
        && engravingText.length <= 20
        && /^[A-Za-z0-9 .,'&-]+$/.test(engravingText);
    const filteredSouvenirs = souvenirs.filter(s => {
        if (activeCat === 'All Souvenirs') return true;
        return (s.category || '').toLowerCase().includes(activeCat.toLowerCase());
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
                            <Gift size={14} className="text-amber-500" /> SOUVENIR PALACE — BAR OS MERCH
                        </div>
                        <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none italic text-foreground">
                            The Merch <span className="text-primary italic">Vault.</span>
                        </h1>
                        <p className="text-slate-500 font-medium text-base sm:text-lg italic leading-relaxed">
                            &quot;Keepsakes, custom laser-engraved hip flasks, shot glasses, and premium gift sets.&quot;
                        </p>
                    </div>
                </div>

                <Sparkles className="absolute -bottom-10 -right-10 h-72 w-72 text-slate-900/5 rotate-12 pointer-events-none" />
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

            {/* MERCH GRID */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {loadError && (
                    <div role="alert" className="mb-8 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
                        <span>{loadError}</span>
                        <Button onClick={() => void fetchSouvenirs()} className="min-h-11 rounded-xl bg-white px-4 font-bold text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100">
                            Try again
                        </Button>
                    </div>
                )}
                {loading ? (
                    <div role="status" aria-label="Loading souvenir products" className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }, (_, index) => (
                            <div key={index} aria-hidden="true" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[3rem] sm:p-8">
                                <div className="aspect-square rounded-xl bg-slate-100 motion-safe:animate-pulse sm:rounded-[2.5rem]" />
                                <div className="mt-6 h-5 w-2/3 rounded bg-slate-100 motion-safe:animate-pulse" />
                                <div className="mt-3 h-4 w-1/3 rounded bg-slate-100 motion-safe:animate-pulse" />
                                <div className="mt-6 h-12 rounded-xl bg-slate-100 motion-safe:animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : !loadError && filteredSouvenirs.length === 0 ? (
                    <div className="py-32 text-center text-slate-400 space-y-4">
                        <Gift size={56} className="mx-auto opacity-30" />
                        <p className="text-sm font-black uppercase tracking-widest italic">&quot;No collectibles found in this section. Show All.&quot;</p>
                        <Button onClick={() => setActiveCat('All Souvenirs')} className="rounded-xl bg-primary text-white font-black uppercase text-xs px-6 py-3">
                            Show All Collectibles
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredSouvenirs.map((item) => {
                            const img = item.image_url || item.image || '';
                            return (
                                <Card key={item.id} className="p-4 sm:p-8 rounded-2xl sm:rounded-[3rem] bg-white border border-slate-200/80 shadow-md hover:shadow-xl transition-all group flex flex-col justify-between text-left relative overflow-hidden">
                                    <div className="relative z-10 space-y-5">
                                        {/* Image Stage */}
                                        <div className="relative aspect-square w-full min-w-0 rounded-xl sm:rounded-[2.5rem] bg-slate-50/80 border border-slate-100 overflow-hidden flex items-center justify-center p-2 sm:p-6 shadow-inner group-hover:scale-105 transition-transform duration-700">
                                            <DecodedImage src={normalizeImage(img)} alt={item.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-contain p-2 sm:p-4" />
                                            {item.capacity_ml ? (
                                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/80 shadow-sm text-[9px] font-black uppercase text-foreground">
                                                    {item.capacity_ml} ml
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Details */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest">{item.category}</p>
                                                    <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-tight">{item.name}</h3>
                                                </div>
                                                <div className="shrink-0 ml-2 text-right">
                                                    <p className="text-2xl font-black text-primary tracking-tight">{formatPrice(item.price)}</p>
                                                    {item.old_price && <p className="text-xs text-slate-300 line-through font-bold">{formatPrice(item.old_price)}</p>}
                                                </div>
                                            </div>
                                            <p className="text-xs font-medium text-slate-500 italic leading-relaxed">{item.description}</p>
                                        </div>

                                        {/* Material & Pairings */}
                                        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/60 space-y-1">
                                            <p className="text-[9px] font-black uppercase text-amber-800 tracking-wider">Material: {item.material || '304 Stainless Steel'}</p>
                                            {item.drink_pairings && (
                                                <p className="text-[10px] font-bold text-amber-950 uppercase">Pairs with {item.drink_pairings.join(' • ')}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-slate-100 relative z-10 flex gap-3">
                                        {item.engraving_enabled && (
                                            <Button
                                                onClick={() => openEngraving(item)}
                                                className="flex-1 h-14 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:bg-primary transition-all active:scale-95"
                                            >
                                                <Type size={16} className="mr-2" /> Custom Engrave
                                            </Button>
                                        )}
                                        <Button
                                            onClick={() => handleAddDirect(item)}
                                            className={cn(
                                                "h-14 px-5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all",
                                                addedId === item.id ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                            )}
                                        >
                                            {addedId === item.id ? <Check size={18} /> : <Plus size={18} />}
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* DIGITAL ENGRAVING STUDIO MODAL */}
            {selectedEngraveItem && (
                <div role="presentation" className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div role="dialog" aria-modal="true" aria-labelledby="engraving-studio-title" className="bg-white rounded-[2rem] p-5 sm:p-8 max-w-xl w-full space-y-5 shadow-2xl relative max-h-[92vh] overflow-y-auto no-scrollbar border border-slate-100 text-left">
                        <button
                            onClick={() => setSelectedEngraveItem(null)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-500 hover:text-foreground flex items-center justify-center transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-primary tracking-widest">Digital Engraving Studio</span>
                            <h2 id="engraving-studio-title" className="text-2xl font-black text-foreground uppercase tracking-tight">{selectedEngraveItem.name}</h2>
                        </div>

                        {/* LIVE PRODUCT ENGRAVING PREVIEW STAGE */}
                        <div className="sticky top-0 z-30 relative aspect-[16/9] rounded-2xl bg-slate-900 overflow-hidden flex items-center justify-center shadow-xl p-6">
                            <DecodedImage
                                src={normalizeImage(selectedEngraveItem.image_url || selectedEngraveItem.image || '')}
                                alt={`${selectedEngraveItem.name} engraving preview`}
                                fill
                                sizes="(max-width: 640px) 100vw, 560px"
                                className="object-contain opacity-50 p-6"
                            />

                            {/* Live Engraved Overlay Text */}
                            <div className="relative z-20 max-w-full text-center px-6 py-3">
                                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/80 block mb-1">Laser engraving preview</span>
                                <p style={engraveFont === 'signature' ? { fontFamily: 'cursive' } : undefined} className={cn(
                                    "break-words text-2xl sm:text-3xl font-black tracking-widest uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]",
                                    engraveFinish === 'matte_black' ? "text-slate-100" : "text-slate-900",
                                    engraveFont === 'classic' && "font-serif italic",
                                    engraveFont === 'modern' && "font-sans uppercase font-black",
                                    engraveFont === 'signature' && "italic tracking-wider"
                                )}>
                                    {engravingText || 'YOUR NAME HERE'}
                                </p>
                                <span className="mt-1 block text-[9px] font-semibold text-white/70">{engraveFinish === 'matte_black' ? 'Matte black · light engraving' : 'Brushed steel · dark engraving'}</span>
                            </div>
                        </div>

                        {/* ENGRAVING CONTROLS */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <label htmlFor="engraving-text" className="text-[10px] font-black uppercase text-slate-600">Engraving text · max 20 characters</label>
                                    <span className="text-xs tabular-nums text-slate-500">{engravingText.length}/20</span>
                                </div>
                                <Input
                                    id="engraving-text"
                                    value={engraveText}
                                    onChange={e => setEngraveText(e.target.value.slice(0, 20))}
                                    maxLength={20}
                                    placeholder="Enter the exact text"
                                    className="rounded-xl h-12 bg-slate-50 border-none font-bold text-sm tracking-wider"
                                />
                                {!engravingTextValid && engravingText.length > 0 && <p role="alert" className="text-xs text-rose-700">Use letters, numbers, spaces, and . , &amp; &apos; - only.</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-600">Engraving finish</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        ['matte_black', 'Matte black'],
                                        ['brushed_steel', 'Brushed steel']
                                    ] as const).map(([finish, label]) => (
                                        <button key={finish} type="button" aria-pressed={engraveFinish === finish} onClick={() => setEngraveFinish(finish)} className={cn("min-h-11 rounded-xl border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600", engraveFinish === finish ? "border-amber-600 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-700")}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-600">Choose font style</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['classic', 'modern', 'signature'] as const).map(f => (
                                        <button
                                            key={f}
                                            type="button"
                                            aria-pressed={engraveFont === f}
                                            onClick={() => setEngraveFont(f)}
                                            className={cn(
                                                "py-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all text-center",
                                                f === 'classic' && "font-serif italic",
                                                f === 'signature' && "italic",
                                                engraveFont === f
                                                    ? "bg-primary text-white border-primary shadow-md"
                                                    : "bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100"
                                            )}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* GIFT WRAP TOGGLE */}
                            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60 space-y-3">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-xs font-black uppercase text-amber-900">Add premium gift packaging (+{formatPrice(Number(selectedEngraveItem.gift_packaging_fee) || 0)})</span>
                                    <input
                                        type="checkbox"
                                        checked={isGiftWrap}
                                        onChange={e => setIsGiftWrap(e.target.checked)}
                                        className="h-5 w-5 accent-primary rounded cursor-pointer"
                                    />
                                </label>
                                {isGiftWrap && (
                                    <>
                                        <Textarea
                                            value={giftMessage}
                                            onChange={e => setGiftMessage(e.target.value.slice(0, 150))}
                                            maxLength={150}
                                            placeholder="Write a personal gift message to include in the box..."
                                            className="rounded-xl bg-white border-amber-200 text-xs text-amber-950"
                                            rows={2}
                                        />
                                        <p className="text-right text-[11px] tabular-nums text-amber-900/70">{giftMessage.length}/150</p>
                                    </>
                                )}
                            </div>

                            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                                <input type="checkbox" checked={spellingApproved} onChange={event => setSpellingApproved(event.target.checked)} className="mt-1 h-4 w-4 accent-amber-600" />
                                <span>I have checked and approve the exact spelling and finish shown above.</span>
                            </label>
                        </div>

                        {/* TOTAL & CONFIRM */}
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between gap-3"><span className="text-slate-600">Product</span><span className="font-semibold">{formatPrice(selectedEngraveItem.price)}</span></div>
                                <div className="flex justify-between gap-3"><span className="text-slate-600">Engraving</span><span className="font-semibold">{formatPrice(Number(selectedEngraveItem.engraving_fee) || 0)}</span></div>
                                {isGiftWrap && <div className="flex justify-between gap-3"><span className="text-slate-600">Gift packaging</span><span className="font-semibold">{formatPrice(Number(selectedEngraveItem.gift_packaging_fee) || 0)}</span></div>}
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-[9px] font-black uppercase text-slate-400">Total Price</p>
                                <p className="text-3xl font-black text-primary tracking-tight">
                                    {formatPrice(selectedEngraveItem.price + (Number(selectedEngraveItem.engraving_fee) || 0) + (isGiftWrap ? Number(selectedEngraveItem.gift_packaging_fee) || 0 : 0))}
                                </p>
                              </div>
                            <Button
                                onClick={handleConfirmEngraveAdd}
                                disabled={!engravingTextValid || !spellingApproved}
                                className="h-16 px-8 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl hover:bg-primary/90 transition-all"
                            >
                                Add to cart
                            </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
