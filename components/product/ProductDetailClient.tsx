'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
    ArrowLeft,
    Zap,
    Flame,
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
    Copy,
    Star,
    Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice, cn, normalizeImage } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useSettings } from '@/lib/useSettings';
import Image from 'next/image';
import { OB_OS } from '@/lib/onlineBarOS';
import { v4 as uuidv4 } from 'uuid';
import { useInteractionTracking } from '@/lib/utils/useInteractionTracking';
import { productKnowledgeEngine, ProductDossier, SensoryDNA } from '@/lib/engines/productKnowledgeEngine';
import { supabase } from '@/lib/supabaseClient';
import { Product } from '@/types/product';
import { getStoredVariantPrices, getVariantPrice } from '@/lib/productPricing';

import ReviewSection from '@/components/product/ReviewSection';
import BundleUpsell from './BundleUpsell';
import RestockNotifyButton from './RestockNotifyButton';
import ProductDNACard from './ProductDNACard';
import PerfectServeCommerce from './PerfectServeCommerce';
import DossierEditorialHub from './DossierEditorialHub';
import AuthenticitySentinel from './AuthenticitySentinel';

type SensoryProfile = Partial<Pick<SensoryDNA, 'body' | 'sweetness' | 'acidity' | 'oak' | 'smoke' | 'intensity'>>;

function getSensoryProfile(source: Partial<SensoryDNA> | Record<string, number> | null | undefined): SensoryProfile | null {
    if (!source) return null;
    const values: Array<[keyof SensoryProfile, unknown]> = [
        ['body', source.body],
        ['sweetness', source.sweetness ?? ('sweet' in source ? source.sweet : undefined)],
        ['acidity', source.acidity],
        ['oak', source.oak],
        ['smoke', source.smoke],
        ['intensity', source.intensity]
    ];
    const profile: SensoryProfile = {};
    for (const [key, value] of values) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
            profile[key] = value;
        }
    }
    return Object.keys(profile).length > 0 ? profile : null;
}

interface FoodAddon {
    id: string;
    name: string;
    price: number;
}

const Product3DViewer = dynamic(() => import('./Product3DViewer'), {
    ssr: false,
    loading: () => <div className="w-full h-[600px] bg-[#080808] rounded-[3rem] border border-primary/20 flex items-center justify-center animate-pulse"><Loader2 className="h-10 w-10 text-primary animate-spin" /></div>
});

export default function ProductDetailClient({
  product,
  relatedProducts,
  reviewStats = { count: 0, rating: 0 }
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
  const isFoodProduct = Boolean(product.is_bite || product.is_snack);
  const variantPrices = getStoredVariantPrices(product.variant_prices, product.beverage_specs);

  const [dossier, setDossier] = useState<ProductDossier | null>(null);
  const sensoryProfile = getSensoryProfile(dossier?.sensory_dna)
    || getSensoryProfile(product.beverage_specs?.sensory_dna)
    || getSensoryProfile(product.sensory_metrics);
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
  const [foodAddons, setFoodAddons] = useState<FoodAddon[]>([]);
  const [selectedFoodAddonIds, setSelectedFoodAddonIds] = useState<string[]>([]);
  const [foodAddonError, setFoodAddonError] = useState<string | null>(null);
  const [foodAddonsLoading, setFoodAddonsLoading] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const [orderEarnPercent, setOrderEarnPercent] = useState(5);

  useEffect(() => {
    let active = true;
    fetch('/api/loyalty/config', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load reward rate.');
        return response.json();
      })
      .then(result => {
        const rate = Number(result.config?.points?.order_earn_percent);
        if (active && Number.isFinite(rate) && rate >= 0) setOrderEarnPercent(rate);
      })
      .catch(error => console.error('Product loyalty estimate unavailable:', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    async function initData() {
        if (!supabase) return;
        try {
            if (isFoodProduct) {
                setFoodAddonsLoading(true);
                setFoodAddons([]);
                setSelectedFoodAddonIds([]);
                try {
                    const { data: extras, error: extrasError } = await supabase
                        .from('food_addons')
                        .select('id, name, price')
                        .eq('is_active', true)
                        .order('name');
                    if (extrasError) {
                        console.error('Meal extras are unavailable:', extrasError);
                        setFoodAddonError('Meal extras are temporarily unavailable. You can still order without extras.');
                    } else {
                        setFoodAddons((extras || []) as FoodAddon[]);
                        setFoodAddonError(null);
                    }
                } catch (error) {
                    console.error('Meal extras are unavailable:', error);
                    setFoodAddonError('Meal extras are temporarily unavailable. You can still order without extras.');
                } finally {
                    setFoodAddonsLoading(false);
                }
            }
            if (!isFoodProduct) {
                const knowledge = await productKnowledgeEngine.getDossier(product.id);
                if (knowledge) setDossier(knowledge);
            }

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
  }, [product.id, product.name, product.price, product.category, product.bought_together_ids, isFoodProduct, relatedProducts]);

  const allImages = Array.from(new Set([
    product.image || product.image_url,
    ...(product.images || []),
    ...(product.image_gallery || [])
  ].filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
    .map(image => normalizeImage(image)))).slice(0, 4);
  if (allImages.length === 0) allImages.push(normalizeImage(null));
  const productDNA = product.sensory_metrics || {};
  const beverageDNA = product.beverage_specs?.sensory_dna;
  const sensoryDNA = {
    body: dossier?.sensory_dna?.body ?? beverageDNA?.body ?? productDNA.body,
    sweetness: dossier?.sensory_dna?.sweetness ?? beverageDNA?.sweetness ?? productDNA.sweetness ?? productDNA.sweet,
    acidity: dossier?.sensory_dna?.acidity ?? productDNA.acidity,
    oak: dossier?.sensory_dna?.oak ?? beverageDNA?.oak ?? productDNA.oak,
    smoke: dossier?.sensory_dna?.smoke ?? beverageDNA?.smoke ?? productDNA.smoke,
    intensity: dossier?.sensory_dna?.intensity ?? beverageDNA?.intensity ?? productDNA.intensity ?? productDNA.spice,
  };

  const isSale = !variantPrices?.[selectedVariant] && product.old_price && Number(product.old_price) > Number(product.price);
  const discountPercent = isSale ? Math.round((1 - (product.price / Number(product.old_price!))) * 100) : 0;
  const savings = isSale ? (Number(product.old_price) - product.price) : 0;
  const selectedVariantPrice = getVariantPrice(product.price, variantPrices, selectedVariant);
  const points = Math.floor(selectedVariantPrice * orderEarnPercent / 100);

  const activeBundleItems = [product, ...bundleProducts].filter(p => boughtTogether.includes(p.id));
  const getBundleVariant = (item: Product) => item.id === product.id ? selectedVariant : item.sizes?.[0] || 'Standard';
  const bundleTotal = activeBundleItems.reduce(
    (sum, item) => sum + getVariantPrice(item.price, getStoredVariantPrices(item.variant_prices, item.beverage_specs), getBundleVariant(item)),
    0
  );

  const handleAddToCart = () => {
    setIsAdding(true);
    const selectedAddons = foodAddons.filter(addon => selectedFoodAddonIds.includes(addon.id));
    const addonTotal = selectedAddons.reduce((sum, addon) => sum + Number(addon.price), 0);
    addToCart({
      id: product.id,
      name: product.name,
      price: selectedVariantPrice + addonTotal,
      base_price: selectedVariantPrice,
      image: normalizeImage(product.image || product.image_url),
      quantity: quantity,
      category: product.category,
      size: selectedVariant,
      wholesale_price: product.wholesale_price,
      wholesale_min_qty: product.wholesale_min_qty,
      addons: selectedAddons.map(addon => ({ ...addon, price: Number(addon.price) }))
    });

    setTimeout(() => {
        setIsAdding(false);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2000);
    }, 500);
  };

  const handleWhatsAppOrder = () => {
    trackClick('whatsapp-order-btn', 'WhatsApp Order', { productId: product.id });
    const selectedAddons = foodAddons.filter(addon => selectedFoodAddonIds.includes(addon.id));
    const addonTotal = selectedAddons.reduce((sum, addon) => sum + Number(addon.price), 0);
    const addonSummary = selectedAddons.length ? `\n*Extras:* ${selectedAddons.map(addon => addon.name).join(', ')}` : '';
    const message = `Hello Online Bar Nairobi! I want to order:\n\n*Product:* ${product.name}\n*Variant:* ${selectedVariant}\n*Quantity:* ${quantity}${addonSummary}\n*Price:* ${formatPrice((selectedVariantPrice + addonTotal) * quantity)}\n\nIs this available?`;
    window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const getTrackedShareUrl = (source: string) => {
    const url = new URL(`/shop/${product.id}`, window.location.origin);
    const inboundReferral = new URLSearchParams(window.location.search).get('ref')
      || sessionStorage.getItem('ob_referral_code');
    const referral = referralCode || inboundReferral;
    if (referral) url.searchParams.set('ref', referral);
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', 'product-share');
    url.searchParams.set('utm_content', `product-${product.id}`);
    return url.toString();
  };

  const copyShareUrl = async (url: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!copied) throw new Error('The browser could not copy the link.');
      }
      setShareFeedback('Tracked product link copied. Paste it into your post or story.');
    } catch (error) {
      console.error('Could not copy product share link:', error);
      setShareFeedback('Copy was blocked by the browser. Select and copy the link below.');
    }
  };

  const shareProduct = async (channel: 'native' | 'whatsapp' | 'facebook' | 'x' | 'instagram' | 'copy') => {
    const url = getTrackedShareUrl(channel === 'native' ? 'share' : channel);
    const text = `Check out ${product.name} at Online Bar`;
    void trackClick('product-share-channel', 'Share Product', { productId: product.id, channel });
    void OB_OS.track('CAMPAIGN_CLICKED', {
      productId: product.id,
      details: { campaign: 'product-share', source: channel, url }
    });

    if (channel === 'native' && navigator.share) {
      try {
        await navigator.share({ title: product.name, text, url });
        setIsShareOpen(false);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Native product sharing failed:', error);
          setShareFeedback('Native sharing is unavailable. Choose a destination below.');
        }
      }
      return;
    }
    if (channel === 'native') {
      setShareFeedback('Your browser does not support the system share menu. Choose a destination below.');
      return;
    }
    if (channel === 'copy' || channel === 'instagram') {
      await copyShareUrl(url);
      return;
    }

    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);
    const targets: Record<'whatsapp' | 'facebook' | 'x', string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    };
    window.open(targets[channel], '_blank', 'noopener,noreferrer');
    setIsShareOpen(false);
  };

  const handleShare = () => {
    setShareFeedback('');
    setIsShareOpen(true);
    void trackClick('share-btn', 'Open Product Share Options', { productId: product.id });
  };

  const toggleLightbox = (open: boolean) => {
      setIsLightboxOpen(open);
      if (open) OB_OS.track('GALLERY_OPENED', { productId: product.id });
  };

  return (
    <div className="bg-background min-h-screen pt-4 sm:pt-10 pb-24 px-2 sm:px-6 flex flex-col items-center gap-12 text-left selection:bg-brand-red/10 animate-in fade-in duration-700 font-sans antialiased">

      {/* 🏛️ ELITE PRODUCT GRID STAGE (Oaks Style) */}
      <Card className="max-w-6xl w-full min-w-0 bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden relative flex flex-col lg:flex-row min-h-[90dvh] border-none">

        <div className="absolute top-4 left-4 sm:top-8 sm:left-10 z-50">
            <Link href="/" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-red transition-colors group">
                <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Full Store ↗
            </Link>
        </div>
        <button
            onClick={() => router.back()}
            className="absolute top-4 right-4 sm:top-8 sm:right-10 z-50 h-10 w-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-brand-red transition-all shadow-sm"
        >
            <X size={20} />
        </button>

        {/* LEFT: VISUAL GALLERY HUB */}
        <div className="w-full min-w-0 lg:w-[58%] p-4 pt-20 sm:p-8 sm:pt-24 lg:p-12 xl:p-20 border-r border-slate-50 relative bg-white">
            {isSale && (
                <div className="absolute top-24 left-4 sm:left-10 z-40 bg-brand-red text-white h-12 w-12 sm:h-16 sm:w-16 rounded-full flex items-center justify-center font-black text-sm shadow-xl shadow-brand-red/30 animate-bounce">
                    -{discountPercent}%
                </div>
            )}

            {!isFoodProduct && is3DMode && product.beverage_specs?.model_3d_url ? (
                <div className="animate-in zoom-in-95 duration-500 relative aspect-square">
                    <Product3DViewer
                        modelUrl={product.beverage_specs.model_3d_url}
                        productName={product.name}
                        onClose={() => setIs3DMode(false)}
                    />
                </div>
            ) : (
                <div className="group relative aspect-square w-full min-w-0 transform overflow-hidden rounded-[2rem] border border-amber-100/70 bg-gradient-to-br from-amber-50 via-white to-rose-50 transition-transform duration-700 ease-out hover:scale-[1.02] sm:rounded-[2.5rem]">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-[16%] rounded-full bg-white/90 blur-3xl" />
                    {!isFoodProduct && product.beverage_specs?.model_3d_url && (
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
                        src={allImages[activeImageIndex] || '/images/NoImage.avif'}
                        alt={product.name}
                        fill
                        className="z-10 object-contain scale-[1.15] drop-shadow-[0_24px_22px_rgba(15,23,42,0.22)] transition-transform duration-1000 group-hover:scale-[1.2] sm:scale-125 sm:group-hover:scale-[1.3]"
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

            {isFoodProduct ? (
                <div className="mt-12 space-y-6 sm:mt-16">
                    <Card className="relative overflow-hidden rounded-[2rem] border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-lg sm:rounded-[2.5rem] sm:p-10">
                        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-200/40 blur-3xl" />
                        <div className="relative space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                                    <Utensils size={22} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-700">Made for your appetite</p>
                                    <h3 className="mt-1 text-2xl font-black uppercase leading-tight tracking-tight text-slate-950 sm:text-3xl">
                                        Make it your own
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                                        {product.description || 'Choose your favourite extras and build your meal just the way you like it.'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-orange-200 bg-white/80 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-orange-800">
                                    {product.category || (product.is_snack ? 'Snack' : 'Street food')}
                                </span>
                                {typeof product.prep_time === 'number' && product.prep_time > 0 && (
                                    <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-amber-800">
                                        <Flame size={12} /> Ready in about {product.prep_time} min
                                    </span>
                                )}
                            </div>

                            {product.ingredients && product.ingredients.length > 0 && (
                                <div className="border-t border-orange-100 pt-5">
                                    <p className="mb-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">What goes into it</p>
                                    <div className="flex flex-wrap gap-2">
                                        {product.ingredients.map(ingredient => (
                                            <span key={ingredient} className="rounded-full border border-white bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-sm">
                                                {ingredient}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-2xl border border-orange-100 bg-white/80 p-4 sm:p-5">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Your custom extras</p>
                                {selectedFoodAddonIds.length > 0 ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {foodAddons
                                            .filter(addon => selectedFoodAddonIds.includes(addon.id))
                                            .map(addon => (
                                                <span key={addon.id} className="rounded-full bg-orange-100 px-3 py-1.5 text-[10px] font-black text-orange-800">
                                                    {addon.name}
                                                </span>
                                            ))}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm font-medium text-slate-600">
                                        Pick sauces, toppings, and other meal extras in the order panel.
                                    </p>
                                )}
                            </div>
                        </div>
                    </Card>
                </div>
            ) : (
            <div className="mt-24 space-y-16">
                <div className="bg-white p-10 sm:p-12 rounded-[3rem] space-y-8 relative overflow-hidden border border-slate-200/80 shadow-xl">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary flex items-center gap-3">
                        <span className="h-px w-8 bg-primary/30" /> TASTING NOTE &bull; BY ONLINE BAR CELLAR
                    </p>
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none italic">Tasting Notes</h3>
                        </div>
                        <p className="text-slate-600 font-medium leading-relaxed italic text-lg pr-4">
                            {dossier?.origin_story || product.description || 'Explore the recorded sensory profile for this drink.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-8 border-t border-slate-100">
                        {[
                            { label: 'Body', key: 'body' as const },
                            { label: 'Sweetness', key: 'sweetness' as const },
                            { label: 'Smoke', key: 'smoke' as const },
                            { label: 'Intensity', key: 'intensity' as const },
                        ].map(trait => {
                            const val = sensoryDNA[trait.key];
                            const activeCount = typeof val === 'number' ? Math.min(5, Math.max(0, Math.round(val / 20))) : 0;
                            return (
                                <div key={trait.label} className="flex items-center justify-between gap-4">
                                    <span className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em]">{trait.label}</span>
                                    {typeof val === 'number' ? (
                                        <div className="flex gap-2" aria-label={`${trait.label}: ${Math.round(val)} out of 100`}>
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "h-3.5 w-3.5 rounded-full transition-all duration-700",
                                                        i < activeCount
                                                            ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)] scale-110"
                                                            : "bg-slate-200/80"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Not scored</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-8 min-w-0">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 ml-4">The Technical Protocol</h3>
                    <div className="grid grid-cols-2 bg-slate-50 rounded-[3rem] border border-slate-100 overflow-hidden shadow-inner">
                        {(() => {
                            const bevSpecs = product.beverage_specs as Record<string, string> | undefined;
                            return [
                                { k: 'Type', v: product.category || 'Premium Selection' },
                                { k: 'Brand', v: product.brand || 'Reserve' },
                                { k: 'Region', v: bevSpecs?.region || product.region || dossier?.region_of_origin || 'Imported' },
                                { k: 'Country', v: product.origin || bevSpecs?.origin || dossier?.country_of_origin || 'Global' },
                                { k: 'Body', v: bevSpecs?.body || product.body || 'Medium' },
                                { k: 'Sweetness', v: bevSpecs?.sweetness || product.sweetness || 'Off-Dry' },
                                { k: 'Volume', v: product.size_label || selectedVariant || (product.sizes && product.sizes[0]) || '750ml' },
                                { k: 'ABV', v: product.abv_label || bevSpecs?.abv || bevSpecs?.abv_label || dossier?.abv_actual || '40%' },
                            ];
                        })().map((row, i) => (
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
                        <Utensils size={14} className="text-brand-red" /> Goes Well With
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {(product.pairing_suggestions || []).map(chip => (
                            <span key={chip} className="px-5 py-2.5 bg-white border border-slate-100 rounded-full text-[11px] font-black text-slate-600 uppercase shadow-sm hover:border-brand-red transition-colors cursor-default">{chip}</span>
                        ))}
                        {(!product.pairing_suggestions || product.pairing_suggestions.length === 0) && (
                            <p className="text-xs font-medium text-slate-400">Pairing suggestions are unavailable for this product.</p>
                        )}
                    </div>
                </div>
            </div>
            )}
        </div>

        {/* RIGHT: STICKY PURCHASE TERMINAL */}
        <div className="w-full min-w-0 lg:w-[42%] bg-slate-50/50">
            <div className="p-8 sm:p-14 space-y-12 sticky top-0">
                <div className="space-y-4 min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-red truncate">{product.category}</p>
                    <h1 className="text-4xl sm:text-5xl font-black text-foreground tracking-tighter leading-[1] uppercase italic break-words">{product.name}</h1>
                    <Link href="#customer-reviews" className="inline-flex flex-wrap items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <div className="flex text-amber-400 text-sm tracking-tighter shrink-0 gap-0.5">
                            {reviewStats.count > 0 ? (
                                <>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Star key={i} size={14} className={cn(i < Math.round(reviewStats.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-100")} />
                                    ))}
                                </>
                            ) : <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Be the first to rate this {isFoodProduct ? 'meal' : 'drink'}</span>}
                        </div>
                        {reviewStats.count > 0 && (
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {reviewStats.rating} ({reviewStats.count} reviews)
                            </span>
                        )}
                    </Link>
                </div>

                <div className="space-y-3 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-4">
                        <span className="text-5xl font-black text-foreground tracking-tighter shrink-0">{formatPrice(selectedVariantPrice)}</span>
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
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 ml-1 italic">{isFoodProduct ? 'Choose your portion' : 'Select Configuration'}</label>
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
                                    <span className={cn("text-base font-black tracking-tight", isSelected ? "text-foreground" : "text-slate-500")}>{formatPrice(getVariantPrice(product.price, variantPrices, size))}</span>
                                    {isSelected && <Check size={14} className="absolute top-4 right-4 text-brand-red" />}
                                </button>
                            );
                        }) || (
                            <button className="p-6 rounded-[2rem] border-2 border-brand-red bg-rose-50 shadow-xl text-left flex flex-col gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-brand-red">{product.size_label || 'Standard'}</span>
                                <span className="text-base font-black tracking-tight">{formatPrice(selectedVariantPrice)}</span>
                            </button>
                        )}
                    </div>
                </div>

                {isFoodProduct && (
                    <div className="overflow-hidden rounded-[2rem] border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-5 shadow-sm sm:p-6">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/20">
                                    <Utensils size={18} />
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-orange-700">Make it yours</p>
                                    <h2 className="mt-1 text-lg font-black uppercase tracking-tight text-slate-950">Add your extras</h2>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-600">Pick sauces and toppings for your meal.</p>
                                </div>
                            </div>
                            {selectedFoodAddonIds.length > 0 && (
                                <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1.5 text-[9px] font-black uppercase text-orange-800">
                                    {selectedFoodAddonIds.length} picked
                                </span>
                            )}
                        </div>
                        {foodAddonError && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">{foodAddonError}</p>}
                        {foodAddonsLoading ? (
                            <div role="status" className="flex items-center gap-2 rounded-2xl bg-white/80 p-4 text-sm font-medium text-slate-600">
                                <Loader2 size={16} className="animate-spin text-orange-600" /> Loading today&apos;s extras…
                            </div>
                        ) : foodAddons.length === 0 ? (
                            <p className="rounded-2xl border border-white bg-white/80 p-4 text-sm leading-relaxed text-slate-600">
                                No extras are on the menu right now. You can order this meal just as it is.
                            </p>
                        ) : (
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                {foodAddons.map(addon => {
                                    const selected = selectedFoodAddonIds.includes(addon.id);
                                    return (
                                        <button
                                            key={addon.id}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => setSelectedFoodAddonIds(current => selected ? current.filter(id => id !== addon.id) : [...current, addon.id])}
                                            className={cn(
                                                'flex min-h-16 items-center justify-between gap-3 rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.98]',
                                                selected ? 'border-orange-400 bg-white shadow-md shadow-orange-900/5' : 'border-white bg-white/75 hover:border-orange-200 hover:bg-white'
                                            )}
                                        >
                                            <span className="flex min-w-0 items-center gap-2.5 text-xs font-black uppercase">
                                                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px]', selected ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 bg-white text-transparent')}>
                                                    <Check size={14} strokeWidth={3} />
                                                </span>
                                                <span className="truncate">{addon.name}</span>
                                            </span>
                                            <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-black text-orange-800">
                                                +{formatPrice(Number(addon.price))}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {selectedFoodAddonIds.length > 0 && (
                            <p className="mt-4 border-t border-orange-100 pt-3 text-right text-xs font-bold text-orange-900">
                                Extras added: {formatPrice(foodAddons
                                    .filter(addon => selectedFoodAddonIds.includes(addon.id))
                                    .reduce((sum, addon) => sum + Number(addon.price), 0))}
                            </p>
                        )}
                    </div>
                )}

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
                            disabled={isAdding || ((product.is_bite || product.is_snack) && foodAddonsLoading) || (product.stock !== undefined && product.stock === 0)}
                            className="flex-1 h-24 rounded-[2.5rem] bg-primary text-white font-black uppercase tracking-[0.3em] text-sm shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all group border-none"
                        >
                            {isAdding ? <Loader2 className="animate-spin" /> : justAdded ? <><Check size={20} className="mr-2" /> In Bag</> : <>Add {quantity} &bull; {formatPrice((selectedVariantPrice + foodAddons.filter(addon => selectedFoodAddonIds.includes(addon.id)).reduce((sum, addon) => sum + Number(addon.price), 0)) * quantity)}</>}
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

                <div className="space-y-3 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm sm:p-5">
                    <p className="flex items-start gap-3 text-sm leading-relaxed text-slate-800">
                        <Zap size={18} className="mt-0.5 shrink-0 fill-amber-500 text-amber-500" />
                        <span><strong>Fast delivery in Nairobi</strong> · 30 minutes for most areas, or next-day countrywide.</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                        <span className="mr-1">We accept</span>
                        <span className="rounded-lg border border-emerald-200 bg-emerald-600 px-2.5 py-1 text-white">M-PESA</span>
                        <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 italic text-blue-900">VISA</span>
                        <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-rose-600">Mastercard</span>
                        <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">Cash</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-600">
                        <span className="inline-flex items-center gap-1.5"><Lock size={13} className="text-emerald-600" /> Secure checkout</span>
                        <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-600" /> 100% genuine</span>
                        <span className="inline-flex items-center gap-1.5"><Globe size={13} className="text-rose-600" /> Over 18s only</span>
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
                                            price: getVariantPrice(p.price, getStoredVariantPrices(p.variant_prices, p.beverage_specs), getBundleVariant(p)),
                                            base_price: getVariantPrice(p.price, getStoredVariantPrices(p.variant_prices, p.beverage_specs), getBundleVariant(p)),
                                            image: normalizeImage(p.image || p.image_url),
                                            quantity: 1,
                                            category: p.category,
                                            size: getBundleVariant(p)
                                        })));
                                        alert("Bundle established in your bag!");
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

      {!isFoodProduct && <div className="max-w-6xl w-full grid lg:grid-cols-12 gap-10 items-stretch px-4">
            <div className="lg:col-span-4 h-full flex flex-col gap-10">
                {sensoryProfile ? (
                    <ProductDNACard
                        dna={sensoryProfile}
                        origin={dossier?.country_of_origin || product.origin || product.beverage_specs?.origin || 'Unavailable'}
                        style={product.category || 'Unavailable'}
                        abv={dossier?.abv_actual || product.abv_label || product.beverage_specs?.abv || 'Unavailable'}
                        verification={dossier?.source_verification || {}}
                    />
                ) : (
                    <Card className="p-8 rounded-[3rem] bg-amber-50 border border-amber-200 shadow-sm text-left">
                        <h3 className="text-lg font-black uppercase tracking-tight text-amber-950">Sensory profile unavailable</h3>
                        <p className="mt-2 text-xs font-medium leading-relaxed text-amber-900">A complete sensory profile has not been recorded for this product yet, so we won&apos;t show estimated values.</p>
                    </Card>
                )}
                <AuthenticitySentinel
                    productName={product.name}
                    origin={product.origin || product.beverage_specs?.origin || dossier?.country_of_origin || 'Unavailable'}
                    abv={product.abv_label || product.beverage_specs?.abv || dossier?.abv_actual || 'Unavailable'}
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
        </div>}

      {!isFoodProduct && <div className="max-w-6xl w-full mt-16 space-y-10 px-4">
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
      </div>}

        {isLightboxOpen && (
            <div className="fixed inset-0 z-[5000] bg-white/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-300">
                <div className="p-3 sm:p-8 flex justify-between items-center gap-3 border-b border-slate-100">
                    <div className="min-w-0">
                        <h4 className="text-base sm:text-xl font-black uppercase text-foreground tracking-tighter break-words">{product.name}</h4>
                        <p className="text-[10px] font-black text-brand-red uppercase tracking-[0.3em] mt-1">High-Resolution Payload View</p>
                    </div>
                    <button onClick={() => toggleLightbox(false)} className="h-11 w-11 sm:h-14 sm:w-14 shrink-0 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-brand-red transition-all border border-slate-100 shadow-sm"><X size={24} /></button>
                </div>
                <div className="flex-1 min-h-0 relative flex items-center justify-center p-3 sm:p-12">
                    <div className="relative w-full h-full max-w-5xl">
                        <Image
                            src={allImages[activeImageIndex] || '/images/NoImage.avif'}
                            alt={product.name}
                            fill
                            className="object-contain animate-in zoom-in-95 duration-500"
                            sizes="90vw"
                        />
                    </div>

                    {allImages.length > 1 && (
                        <div className="absolute inset-x-3 sm:inset-x-12 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
                            <button
                                onClick={() => setActiveImageIndex(i => i === 0 ? allImages.length - 1 : i - 1)}
                                className="h-11 w-11 sm:h-16 sm:w-16 rounded-full bg-white/50 backdrop-blur shadow-2xl flex items-center justify-center text-foreground hover:bg-white transition-all pointer-events-auto border border-white/20"
                            >
                                <ChevronLeft size={32} />
                            </button>
                            <button
                                onClick={() => setActiveImageIndex(i => i === allImages.length - 1 ? 0 : i + 1)}
                                className="h-11 w-11 sm:h-16 sm:w-16 rounded-full bg-white/50 backdrop-blur shadow-2xl flex items-center justify-center text-foreground hover:bg-white transition-all pointer-events-auto border border-white/20"
                            >
                                <ChevronRight size={32} />
                            </button>
                        </div>
                    )}
                </div>
                <div className="p-3 sm:p-8 border-t border-slate-100 flex justify-center gap-2 sm:gap-4 bg-slate-50/30 overflow-x-auto no-scrollbar">
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
                    <Image src={normalizeImage(item.image || item.image_url)} alt={item.name} fill className="object-contain p-3 transform scale-110 group-hover:scale-125 transition-transform duration-500" />
                  </div>
                  <h3 className="text-[13px] font-black text-foreground uppercase tracking-widest truncate group-hover:text-brand-red transition-colors italic">{item.name}</h3>
                  <p className="text-sm font-black text-slate-400 mt-2">{formatPrice(item.price)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
        {isShareOpen && (
          <div
            className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsShareOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-product-title"
              className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl sm:p-8"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 id="share-product-title" className="text-xl font-black uppercase tracking-tight text-slate-900">Share this {isFoodProduct ? 'meal' : 'drink'}</h2>
                  <p className="mt-1 text-sm text-slate-500">Share a trackable product link with your friends.</p>
                </div>
                <button
                  type="button"
                  aria-label="Close sharing options"
                  onClick={() => setIsShareOpen(false)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => void shareProduct('native')} className="col-span-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700">
                  More apps &amp; devices
                </button>
                <button type="button" onClick={() => void shareProduct('whatsapp')} className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
                  WhatsApp
                </button>
                <button type="button" onClick={() => void shareProduct('facebook')} className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 hover:bg-blue-100">
                  Facebook
                </button>
                <button type="button" onClick={() => void shareProduct('x')} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-200">
                  Share to X
                </button>
                <button type="button" onClick={() => void shareProduct('instagram')} className="rounded-xl bg-pink-50 px-4 py-3 text-sm font-bold text-pink-800 hover:bg-pink-100">
                  Copy link for Instagram
                </button>
                <button type="button" onClick={() => void shareProduct('copy')} className="col-span-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <Copy size={16} className="mr-2 inline" /> Copy tracked product link
                </button>
              </div>
              {shareFeedback && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-medium leading-relaxed text-amber-900">{shareFeedback}</p>}
              <p className="mt-4 break-all rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">
                {getTrackedShareUrl('share')}
              </p>
            </section>
          </div>
        )}
    </div>
  );
}
