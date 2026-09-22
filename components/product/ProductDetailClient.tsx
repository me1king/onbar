'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
    ArrowLeft,
    Zap,
    ChevronLeft,
    ChevronRight,
    Check,
    Loader2,
    X,
    Trophy,
    Utensils,
    Lock,
    Globe,
    Plus,
    MessageSquare,
    Share2,
    Star,
    Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice, cn, getReferralLink, normalizeImage } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useSettings } from '@/lib/useSettings';
import Image from 'next/image';
import { OB_OS } from '@/lib/onlineBarOS';
import { v4 as uuidv4 } from 'uuid';
import { useInteractionTracking } from '@/lib/utils/useInteractionTracking';
import { ApexKnowledge, ProductDossier, SensoryDNA } from '@/lib/engines/productKnowledgeEngine';
import { supabase } from '@/lib/supabaseClient';
import { Product } from '@/types/product';

import ReviewSection from '@/components/product/ReviewSection';
import BundleUpsell from './BundleUpsell';
import RestockNotifyButton from './RestockNotifyButton';
import ProductDNACard from './ProductDNACard';
import PerfectServeCommerce from './PerfectServeCommerce';
import DossierEditorialHub from './DossierEditorialHub';
import AuthenticitySentinel from './AuthenticitySentinel';

const Product3DViewer = dynamic(() => import('./Product3DViewer'), {
    ssr: false,
    loading: () => <div className="w-full h-[600px] bg-[#080808] rounded-[3rem] border border-primary/20 flex items-center justify-center animate-pulse"><Loader2 className="h-10 w-10 text-primary animate-spin" /></div>
});

export default function ProductDetailClient({
  product,
  relatedProducts,
  reviewStats = { count: 26, rating: 4.9 }
}: {
  product: Product,
  relatedProducts: Product[],
  reviewStats?: { count: number, rating: number }
}) {
  const router = useRouter();
  const { settings } = useSettings();
  const { addToCart, addBundleToCart } = useCart();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const { trackClick } = useInteractionTracking();

  const [dossier, setDossier] = useState<ProductDossier | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedVariant, setSelectedVariant] = useState<string>(
    (product.sizes && product.sizes.length > 0) ? product.sizes[0] : 'Standard'
  );
  const [isAdding, setIsAdding] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [is3DMode, setIs3DMode] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [boughtTogether, setBoughtTogether] = useState<number[]>([product.id]);
  const [bundleProducts, setBundleProducts] = useState<Product[]>([]);

  const fallbackDNA: SensoryDNA = {
      sweetness: 50, body: 50, oak: 30, smoke: 20, intensity: 60, acidity: 40, tannin: 30, bitterness: 20
  };

  useEffect(() => {
    async function initData() {
        if (!supabase) return;
        try {
            const knowledge = await ApexKnowledge.getDossier(product.id);
            if (knowledge) setDossier(knowledge);

            const { data: { session } } = await supabase.auth.getSession();
            let anonymousId = localStorage.getItem('ob_anonymous_id');
            if (!anonymousId) {
                anonymousId = `anon-${uuidv4().substring(0, 8)}`;
                localStorage.setItem('ob_anonymous_id', anonymousId);
            }

            await OB_OS.track('PRODUCT_VIEW', {
                userId: session?.user?.id,
                anonymousId,
                productId: product.id,
                details: { name: product.name, price: product.price, category: product.category }
            });

            if (session) {
                const { data: profile } = await supabase.from('profiles').select('referral_code').eq('id', session.user.id).single();
                if (profile) setReferralCode(profile.referral_code);
                await supabase.from('browsing_history').insert([{ user_id: session.user.id, product_id: product.id }]);
            }

            if (product.bought_together_ids && product.bought_together_ids.length > 0) {
                const { data: bData } = await supabase.from('products').select('*').in('id', product.bought_together_ids);
                if (bData) setBundleProducts(bData as Product[]);
            } else {
                setBundleProducts(relatedProducts.slice(0, 2));
            }
        } catch (err) {
            console.warn("Dossier/History failure:", err);
        }
    }
    initData();
  }, [product.id, product.name, product.price, product.category, product.bought_together_ids, relatedProducts]);

  const allImages = (product.images && product.images.length > 0)
    ? product.images.map(img => normalizeImage(img))
    : [normalizeImage(product.image || product.image_url)];

  const isSale = product.old_price && Number(product.old_price) > Number(product.price);
  const discountPercent = isSale ? Math.round((1 - (product.price / Number(product.old_price!))) * 100) : 0;
  const savings = isSale ? (Number(product.old_price) - product.price) : 0;
  const points = Math.floor(product.price / 23);

  const activeBundleItems = [product, ...bundleProducts].filter(p => boughtTogether.includes(p.id));
  const bundleTotal = activeBundleItems.reduce((sum, item) => sum + item.price, 0);

  const handleAddToCart = () => {
    setIsAdding(true);
    OB_OS.track('ADD_TO_CART', {
        productId: product.id,
        amount: product.price,
        details: { name: product.name, category: product.category, size: selectedVariant }
    });

    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      base_price: product.price,
      image: normalizeImage(product.image || product.image_url),
      quantity: quantity,
      category: product.category,
      size: selectedVariant,
      wholesale_price: product.wholesale_price,
      wholesale_min_qty: product.wholesale_min_qty
    });

    setTimeout(() => {
        setIsAdding(false);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2000);
    }, 500);
  };

  const handleWhatsAppOrder = () => {
    trackClick('whatsapp-order-btn', 'WhatsApp Order', { productId: product.id });
    const message = `Hello Online Bar Nairobi! I want to order:\n\n*Product:* ${product.name}\n*Variant:* ${selectedVariant}\n*Quantity:* ${quantity}\n*Price:* ${formatPrice(product.price * quantity)}\n\nIs this available?`;
    window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleShare = () => {
    trackClick('share-btn', 'Share Product', { productId: product.id });
    const url = referralCode ? getReferralLink(referralCode, `/shop/${product.id}`) : (typeof window !== 'undefined' ? window.location.href : '');
    navigator.clipboard.writeText(url);
    alert('Product link copied!');
  };

  const toggleLightbox = (open: boolean) => {
      setIsLightboxOpen(open);
      if (open) OB_OS.track('GALLERY_OPENED', { productId: product.id });
  };

  return (
    <div className="bg-brand-cream/50 min-h-screen pt-4 sm:pt-10 pb-24 px-2 sm:px-6 flex flex-col items-center gap-12 text-left selection:bg-brand-red/10 animate-in fade-in duration-700 font-sans antialiased">

      {/* 🏛️ ELITE PRODUCT GRID STAGE (Oaks Style) */}
      <Card className="max-w-6xl w-full bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden relative flex flex-col lg:flex-row min-h-[90dvh] border-none">

        <div className="absolute top-8 left-10 z-50">
            <Link href="/" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-red transition-colors group">
                <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Full Store ↗
            </Link>
        </div>
        <button
            onClick={() => router.back()}
            className="absolute top-8 right-10 z-50 h-10 w-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-brand-red transition-all shadow-sm"
        >
            <X size={20} />
        </button>

        {/* LEFT: VISUAL GALLERY HUB */}
        <div className="lg:w-[58%] p-8 sm:p-20 border-r border-slate-50 relative bg-white">
            {isSale && (
                <div className="absolute top-24 left-10 z-40 bg-brand-red text-white h-16 w-16 rounded-full flex items-center justify-center font-black text-sm shadow-xl shadow-brand-red/30 animate-bounce">
                    -{discountPercent}%
                </div>
            )}

            {is3DMode && product.beverage_specs?.model_3d_url ? (
                <div className="animate-in zoom-in-95 duration-500 relative aspect-square">
                    <Product3DViewer
                        modelUrl={product.beverage_specs.model_3d_url}
                        productName={product.name}
                        onClose={() => setIs3DMode(false)}
                    />
                </div>
            ) : (
                <div className="relative aspect-square flex items-center justify-center transform hover:scale-105 transition-transform duration-700 ease-out overflow-hidden group">
                    {product.beverage_specs?.model_3d_url && (
                        <div className="absolute top-6 right-6 z-20">
                            <Button
                                onClick={() => setIs3DMode(true)}
                                className="rounded-full h-14 w-14 bg-brand-red text-white shadow-xl shadow-brand-red/20 hover:scale-110 active:scale-95 transition-all p-0 flex items-center justify-center"
                                title="Enter 3D View"
                            >
                                <Zap size={24} className="fill-current" />
                            </Button>
                        </div>
                    )}
                    <Image
                        src={allImages[activeImageIndex] || '/images/NoImage.jpg'}
                        alt={product.name}
                        fill
                        className="object-contain p-10 cursor-zoom-in group-hover:scale-110 transition-transform duration-1000"
                        onClick={() => toggleLightbox(true)}
                        priority
                    />
                </div>
            )}

            {allImages.length > 1 && (
                <div className="mt-12 flex justify-center gap-4 overflow-x-auto no-scrollbar py-2">
                    {allImages.map((img, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveImageIndex(idx)}
                            className={cn(
                                "h-20 w-20 rounded-2xl bg-slate-50 border-2 transition-all p-2 shrink-0 relative overflow-hidden",
                                activeImageIndex === idx ? "border-brand-red shadow-lg scale-105" : "border-transparent opacity-60 hover:opacity-100"
                            )}
                        >
                            <Image src={img} alt="" fill className="object-contain p-2" />
                        </button>
                    ))}
                </div>
            )}

            <div className="mt-24 space-y-16">
                <div className="bg-brand-cream p-12 rounded-[2.5rem] space-y-8 relative overflow-hidden border border-brand-red/5">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-red flex items-center gap-3">
                        <span className="h-px w-8 bg-brand-red/20" /> TASTING NOTE &bull; BY ONLINE BAR CELLAR
                    </p>
                    <div className="space-y-4">
                        <h3 className="text-3xl font-black text-brand-red uppercase tracking-tighter leading-none italic">Exceptional ★★★★★</h3>
                        <p className="text-slate-700 font-medium leading-relaxed italic text-lg pr-4">
                            &quot;{dossier?.origin_story || "A masterfully balanced profile that defines excellence in its category."}&quot;
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 pt-10 border-t border-brand-red/10">
                        {[
                            { label: 'Body', key: 'body' },
                            { label: 'Sweet', key: 'sweet' },
                            { label: 'Smoke', key: 'smoke' },
                            { label: 'Spice', key: 'spice' },
                        ].map(trait => {
                            const val = product.sensory_metrics?.[trait.key] || dossier?.sensory_dna?.[trait.key as keyof SensoryDNA] || 60;
                            return (
                                <div key={trait.label} className="flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em]">{trait.label}</span>
                                    <div className="flex gap-2">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "h-3 w-3 rounded-full transition-all duration-700",
                                                    i < (val / 20) ? "bg-brand-red shadow-[0_0_8px_rgba(217,28,28,0.4)]" : "bg-slate-200"
                                                )}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-8 min-w-0">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 ml-4">The Technical Protocol</h3>
                    <div className="grid grid-cols-2 bg-slate-50 rounded-[3rem] border border-slate-100 overflow-hidden shadow-inner">
                        {[
                            { k: 'Type', v: product.category || 'Premium Selection' },
                            { k: 'Brand', v: product.brand || 'Reserve' },
                            { k: 'Region', v: dossier?.region_of_origin || 'Imported' },
                            { k: 'Country', v: product.origin || dossier?.country_of_origin || 'Global' },
                            { k: 'Body', v: 'Medium' },
                            { k: 'Sweetness', v: 'Off-dry' },
                            { k: 'Volume', v: product.size_label || selectedVariant || 'Standard' },
                            { k: 'ABV', v: product.abv_label || dossier?.abv_actual || '40%' },
                        ].map((row, i) => (
                            <div key={i} className={cn(
                                "p-6 sm:p-8 flex flex-col gap-1.5 border-slate-100 min-w-0",
                                i % 2 === 0 ? "border-r" : "",
                                i < 6 ? "border-b" : ""
                            )}>
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest truncate">{row.k}</span>
                                <span className="text-sm font-black text-foreground uppercase tracking-tight break-words">{row.v}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-6 px-4">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-3">
                        <Utensils size={14} className="text-brand-red" /> Pairs Well With
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {(product.pairing_suggestions || ['Nyama choma', 'BBQ ribs', 'Smoked brisket', 'Burgers', 'Dark chocolate']).map(chip => (
                            <span key={chip} className="px-5 py-2.5 bg-white border border-slate-100 rounded-full text-[11px] font-black text-slate-600 uppercase shadow-sm hover:border-brand-red transition-colors cursor-default">{chip}</span>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* RIGHT: STICKY PURCHASE TERMINAL */}
        <div className="lg:w-[42%] bg-slate-50/50">
            <div className="p-8 sm:p-14 space-y-12 sticky top-0">
                <div className="space-y-4 min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-red truncate">{product.category}</p>
                    <h1 className="text-4xl sm:text-5xl font-black text-foreground tracking-tighter leading-[1] uppercase italic break-words">{product.name}</h1>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex text-brand-red text-sm tracking-tighter shrink-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} size={14} className={cn(i < Math.round(reviewStats.rating) ? "fill-current" : "opacity-20")} />
                            ))}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {reviewStats.rating} ({reviewStats.count} verified reviews)
                        </span>
                    </div>
                </div>

                <div className="space-y-3 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-4">
                        <span className="text-5xl font-black text-foreground tracking-tighter shrink-0">{formatPrice(product.price)}</span>
                        {isSale && <span className="text-2xl text-slate-300 line-through font-bold shrink-0">{formatPrice(Number(product.old_price))}</span>}
                    </div>
                    {isSale && (
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-[11px] font-black text-brand-red uppercase tracking-widest bg-brand-red/5 px-3 py-1 rounded-lg truncate">
                                Save {formatPrice(savings)} &bull; {discountPercent}% off
                            </p>
                        </div>
                    )}
                    <div className="flex items-center gap-3 pt-3">
                        <div className="h-6 px-3 rounded-lg bg-amber-50 text-amber-600 text-[9px] font-black flex items-center gap-2 uppercase tracking-widest border border-amber-100 shadow-sm shrink-0">
                             <Trophy size={12} className="fill-current" /> Earn {points} points
                        </div>
                    </div>
                </div>

                {product.stock !== undefined && product.stock > 0 ? (
                    <div className="flex items-center gap-3 px-5 py-3 bg-emerald-50 text-emerald-600 rounded-full w-fit border border-emerald-100 shadow-sm animate-in slide-in-from-left-4 duration-1000 max-w-full">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest truncate">In stock &bull; dispatched 24/7</span>
                    </div>
                ) : (
                    <div className="w-full">
                        <RestockNotifyButton productId={product.id} productName={product.name} />
                    </div>
                )}

                <div className="space-y-6">
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 ml-1 italic">Select Configuration</label>
                    <div className="grid grid-cols-2 gap-4">
                        {product.sizes?.map(size => {
                            const isSelected = selectedVariant === size;
                            return (
                                <button
                                    key={size}
                                    onClick={() => setSelectedVariant(size)}
                                    className={cn(
                                        "p-6 rounded-[2rem] border-2 transition-all text-left flex flex-col gap-1.5 relative group/size",
                                        isSelected
                                            ? "border-brand-red bg-rose-50 shadow-xl scale-[1.02]"
                                            : "border-slate-100 bg-white hover:border-slate-300"
                                    )}
                                >
                                    <span className={cn("text-[10px] font-black uppercase tracking-widest", isSelected ? "text-brand-red" : "text-slate-400")}>{size}</span>
                                    <span className={cn("text-base font-black tracking-tight", isSelected ? "text-foreground" : "text-slate-500")}>{formatPrice(product.price)}</span>
                                    {isSelected && <Check size={14} className="absolute top-4 right-4 text-brand-red" />}
                                </button>
                            );
                        }) || (
                            <button className="p-6 rounded-[2rem] border-2 border-brand-red bg-rose-50 shadow-xl text-left flex flex-col gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-brand-red">{product.size_label || 'Standard'}</span>
                                <span className="text-base font-black tracking-tight">{formatPrice(product.price)}</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="flex items-center justify-between px-2">
                         <label className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 italic">Quantity</label>
                         <div className="flex items-center bg-white border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="h-14 w-14 hover:bg-slate-50 font-black text-xl text-slate-300 transition-colors">-</button>
                            <span className="px-10 font-black text-lg">{quantity}</span>
                            <button onClick={() => setQuantity(q => q + 1)} className="h-14 w-14 hover:bg-slate-50 font-black text-xl text-slate-300 transition-colors">+</button>
                         </div>
                    </div>
                    <div className="flex gap-2.5 justify-center">
                        {[1, 2, 3, 6, 12].map(num => (
                            <button
                                key={num}
                                onClick={() => setQuantity(num)}
                                className={cn(
                                    "h-12 w-12 rounded-xl text-[10px] font-black border-2 transition-all active:scale-90",
                                    quantity === num ? "bg-slate-900 text-white border-slate-900 shadow-lg" : "bg-white text-slate-400 border-slate-100 hover:border-slate-300"
                                )}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-4">
                        <Button
                            onClick={handleAddToCart}
                            disabled={isAdding || (product.stock !== undefined && product.stock === 0)}
                            className="flex-1 h-24 rounded-[2.5rem] bg-brand-red text-white font-black uppercase tracking-[0.4em] text-sm shadow-2xl shadow-brand-red/30 hover:scale-[1.02] active:scale-95 transition-all group border-none"
                        >
                            {isAdding ? <Loader2 className="animate-spin" /> : justAdded ? <><Check size={20} className="mr-2" /> In Bag</> : <>Add {quantity} &bull; {formatPrice(product.price * quantity)}</>}
                        </Button>
                        <button
                            onClick={() => {
                                if (isInWishlist(product.id)) removeFromWishlist(product.id);
                                else addToWishlist({
                                    id: product.id,
                                    name: product.name,
                                    price: product.price,
                                    image: normalizeImage(product.image || product.image_url) as string,
                                    category: product.category
                                });
                            }}
                            className={cn(
                                "h-24 w-24 rounded-[2.5rem] border-2 transition-all flex items-center justify-center shadow-xl active:scale-90",
                                isInWishlist(product.id) ? "bg-rose-50 border-brand-red text-brand-red" : "bg-white border-slate-100 text-slate-300 hover:border-brand-red hover:text-brand-red"
                            )}
                        >
                            <Heart size={32} fill={isInWishlist(product.id) ? "currentColor" : "none"} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Button onClick={handleWhatsAppOrder} variant="outline" className="h-16 rounded-[1.5rem] border-2 border-slate-100 text-[10px] font-black uppercase hover:bg-slate-50">
                            <MessageSquare size={16} className="mr-2 text-brand-red" /> WhatsApp
                        </Button>
                        <Button onClick={handleShare} variant="outline" className="h-16 rounded-[1.5rem] border-2 border-slate-100 text-[10px] font-black uppercase hover:bg-slate-50">
                            <Share2 size={16} className="mr-2" /> Share
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-10 border-t border-slate-100">
                    {[
                        { l: 'Secure Pay', i: Lock, c: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
                        { l: '100% Genuine', i: Check, c: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
                        { l: '18+ Only', i: Globe, c: 'bg-rose-50 text-brand-red border-rose-100' },
                    ].map(badge => (
                        <div key={badge.l} className={cn("p-5 rounded-3xl border flex flex-col items-center gap-3 text-center transition-transform hover:scale-105", badge.c)}>
                            <badge.i size={18} />
                            <span className="text-[8px] font-black uppercase tracking-widest leading-none">{badge.l}</span>
                        </div>
                    ))}
                </div>

                {bundleProducts.length > 0 && (
                    <div className="space-y-8 pt-12 border-t-4 border-slate-100 min-w-0">
                         <p className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400 ml-2 italic">Frequently Bought Together</p>
                         <div className="space-y-5">
                            {[product, ...bundleProducts].map((item, i) => (
                                <div key={item.id} className="flex items-center justify-between p-4 sm:p-6 bg-white rounded-[2rem] border-2 border-slate-50 group hover:border-brand-red/20 hover:shadow-xl transition-all min-w-0 gap-3">
                                    <div className="flex items-center gap-4 sm:gap-6 min-w-0 flex-1">
                                        <button
                                            onClick={() => setBoughtTogether(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                                            className={cn(
                                                "h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                                                boughtTogether.includes(item.id) || i === 0 ? "bg-brand-red border-brand-red text-white" : "bg-white border-slate-200"
                                            )}
                                        >
                                            <Check size={14} strokeWidth={4} />
                                        </button>
                                        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-slate-50 relative overflow-hidden shrink-0 border border-slate-100">
                                            <Image src={normalizeImage(item.image || item.image_url)} alt="" fill className="object-contain p-2 group-hover:scale-110 transition-transform duration-500" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] sm:text-xs font-black text-foreground uppercase truncate italic">{item.name}</p>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{formatPrice(item.price)}</p>
                                        </div>
                                    </div>
                                    {i < bundleProducts.length && <Plus size={16} className="text-slate-200 shrink-0 ml-1" />}
                                </div>
                            ))}

                            <Card className="p-8 bg-slate-900 rounded-[2.5rem] text-white space-y-6 shadow-2xl relative overflow-hidden group border-none">
                                <div className="flex justify-between items-center px-2">
                                    <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-50">Total for bundle</p>
                                    <p className="text-2xl font-black tracking-tighter text-brand-red">{formatPrice(bundleTotal)}</p>
                                </div>
                                <Button
                                    onClick={() => {
                                        addBundleToCart(activeBundleItems.map(p => ({
                                            id: p.id,
                                            name: p.name,
                                            price: p.price,
                                            base_price: p.price,
                                            image: normalizeImage(p.image || p.image_url),
                                            quantity: 1,
                                            category: p.category
                                        })));
                                        alert("Bundle established in your bag! 🥂");
                                    }}
                                    className="w-full h-16 rounded-2xl bg-brand-red text-white font-black uppercase text-xs tracking-[0.3em] shadow-xl group-hover:scale-[1.02] active:scale-95 transition-all border-none"
                                >
                                    Add Bundle to Basket
                                </Button>
                                <Zap className="absolute -bottom-6 -right-6 h-32 w-32 text-white/5 rotate-12 transition-transform group-hover:rotate-45 duration-1000" />
                            </Card>
                         </div>
                    </div>
                )}
            </div>
        </div>

      </Card>

      <div className="max-w-6xl w-full grid lg:grid-cols-12 gap-10 items-stretch px-4">
            <div className="lg:col-span-4 h-full flex flex-col gap-10">
                <ProductDNACard
                    dna={dossier?.sensory_dna || fallbackDNA}
                    origin={dossier?.country_of_origin || 'Imported'}
                    style={product.category || 'Premium Spirit'}
                    abv={dossier?.abv_actual || product.abv_label || '40%'}
                    verification={dossier?.source_verification || { sensory_dna: 'TECHNICAL' }}
                />
                <AuthenticitySentinel
                    batchNo={product.id.toString().padStart(6, '0')}
                    origin={dossier?.country_of_origin || 'Imported'}
                />
            </div>
            <div className="lg:col-span-8 flex flex-col gap-10">
                {dossier && (
                    <DossierEditorialHub
                        story={dossier.origin_story || undefined}
                        origin={dossier.region_of_origin || undefined}
                        production={dossier.production_method || undefined}
                        brandName={product.brand || product.name.split(' ')[0]}
                    />
                )}
                <PerfectServeCommerce
                    mainProduct={{
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image_url: normalizeImage(product.image || product.image_url)
                    }}
                    mixerId={product.beverage_specs?.perfect_serve?.mixer_id || relatedProducts[0]?.id}
                    glassware={product.beverage_specs?.perfect_serve?.glassware || "Highball Glass"}
                />
            </div>
        </div>

      <div className="max-w-6xl w-full mt-16 space-y-10 px-4">
          <div className="flex items-center gap-4 px-10">
              <div className="h-px flex-1 bg-slate-200" />
              <h2 className="text-xs font-black uppercase tracking-[0.6em] text-slate-400">Tactical Inquiries</h2>
              <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
                {(product.faq_data || [
                    { q: "What is the delivery timeline?", a: "Online Bar Nairobi mission protocol ensures most orders reach your grid coordinates within 20-45 minutes. Chilled dispatch is standard." },
                    { q: "Is this product authentic?", a: "Affirmative. Every node in our cellar is 100% genuine, sourced directly from authorized Kenyan distributors and bonded warehouses." },
                    { q: "Can I pay on delivery?", a: "Negative. To maintain operational speed and rider security, we primarily support M-Pesa and Card authorization before dispatch." },
                    { q: "What if my drink is warm?", a: "Chilled delivery is our prime directive. If your beverage arrives above 8°C, our dispatch hub will issue a tactical replacement." }
                ]).map((faq, i) => (
                    <Card key={i} className="p-10 rounded-[3rem] bg-white border border-slate-100 hover:shadow-2xl transition-all group border-none">
                        <h4 className="text-[11px] font-black text-brand-red uppercase tracking-widest mb-4 flex items-center gap-3">
                            <div className="h-1.5 w-1.5 rounded-full bg-brand-red animate-pulse" /> {faq.q}
                        </h4>
                        <p className="text-slate-500 font-medium leading-relaxed italic text-sm">&quot;{faq.a}&quot;</p>
                    </Card>
                ))}
          </div>
      </div>

        {isLightboxOpen && (
            <div className="fixed inset-0 z-[5000] bg-white/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-300">
                <div className="p-8 flex justify-between items-center border-b border-slate-100">
                    <div>
                        <h4 className="text-xl font-black uppercase text-foreground tracking-tighter">{product.name}</h4>
                        <p className="text-[10px] font-black text-brand-red uppercase tracking-[0.3em] mt-1">High-Resolution Payload View</p>
                    </div>
                    <button onClick={() => toggleLightbox(false)} className="h-14 w-14 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-brand-red transition-all border border-slate-100 shadow-sm"><X size={24} /></button>
                </div>
                <div className="flex-1 relative flex items-center justify-center p-12">
                    <div className="relative w-full h-full max-w-5xl">
                        <Image
                            src={allImages[activeImageIndex] || '/images/NoImage.jpg'}
                            alt={product.name}
                            fill
                            className="object-contain animate-in zoom-in-95 duration-500"
                            sizes="90vw"
                        />
                    </div>

                    {allImages.length > 1 && (
                        <div className="absolute inset-x-12 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
                            <button
                                onClick={() => setActiveImageIndex(i => i === 0 ? allImages.length - 1 : i - 1)}
                                className="h-16 w-16 rounded-full bg-white/50 backdrop-blur shadow-2xl flex items-center justify-center text-foreground hover:bg-white transition-all pointer-events-auto border border-white/20"
                            >
                                <ChevronLeft size={32} />
                            </button>
                            <button
                                onClick={() => setActiveImageIndex(i => i === allImages.length - 1 ? 0 : i + 1)}
                                className="h-16 w-16 rounded-full bg-white/50 backdrop-blur shadow-2xl flex items-center justify-center text-foreground hover:bg-white transition-all pointer-events-auto border border-white/20"
                            >
                                <ChevronRight size={32} />
                            </button>
                        </div>
                    )}
                </div>
                <div className="p-8 border-t border-slate-100 flex justify-center gap-4 bg-slate-50/30 overflow-x-auto no-scrollbar">
                    {allImages.map((img, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveImageIndex(idx)}
                            className={cn(
                                "h-20 w-20 rounded-2xl bg-white border-4 transition-all shrink-0 relative overflow-hidden",
                                activeImageIndex === idx ? "border-brand-red shadow-xl scale-110" : "border-transparent opacity-40 hover:opacity-100"
                            )}
                        >
                            <Image src={img} alt="" fill className="object-contain p-2" />
                        </button>
                    ))}
                </div>
            </div>
        )}

        {product.bundle_product_id && (
            <div className="max-w-6xl w-full px-4 mb-24">
                <BundleUpsell
                    mainProduct={{
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image_url: normalizeImage(product.image || product.image_url)
                    }}
                    bundleProductId={product.bundle_product_id}
                    discountPercent={product.bundle_discount_percent || 5}
                />
            </div>
        )}

        <ReviewSection productId={product.id} />

        {relatedProducts.length > 0 && (
          <section className="border-t border-slate-100 pt-24 mb-32 text-left w-full max-w-6xl px-4">
            <h2 className="text-4xl font-black tracking-tighter text-foreground uppercase mb-16 italic">You Might Also Need</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {relatedProducts.map((item) => (
                <Link key={item.id} href={`/shop/${item.id}`} className="group block text-left">
                  <div className="bg-slate-50 rounded-[2.5rem] aspect-square flex items-center justify-center p-8 mb-6 border border-transparent group-hover:border-slate-100 transition-all relative overflow-hidden shadow-sm hover:shadow-2xl">
                    <Image src={normalizeImage(item.image || item.image_url)} alt={item.name} fill className="object-contain p-8 transform group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <h3 className="text-[13px] font-black text-foreground uppercase tracking-widest truncate group-hover:text-brand-red transition-colors italic">{item.name}</h3>
                  <p className="text-sm font-black text-slate-400 mt-2">{formatPrice(item.price)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
    </div>
  );
}
