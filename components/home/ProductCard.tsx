"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useCart } from "@/context/CartContext";
import { cn, formatPrice, normalizeImage } from "@/lib/utils";
import {
    Check,
    Heart,
    Loader2,
    ImageIcon,
    MessageSquare,
    Star,
    TrendingUp,
    Lock,
    Utensils,
    ShoppingCart
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { useWishlist } from "@/context/WishlistContext";
import { useSettings } from "@/lib/useSettings";
import { Product } from "@/types/product";
import { getStartingPrice, getStoredVariantPrices, getVariantPrice } from "@/lib/productPricing";
import { isStorefrontProductVisible } from "@/lib/productVisibility";

const TIER_RANK: Record<string, number> = {
    'Explorer': 0,
    'Silver': 1,
    'Gold': 2,
    'Diamond': 3,
    'Legend': 4
};

export default function ProductCard({ product, userTier = 'Explorer', allowUnpublishedPreview = false }: { product: Product, userTier?: string; allowUnpublishedPreview?: boolean }) {
  const router = useRouter();
  const [imageError, setImageError] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const { addToCart } = useCart();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const { settings } = useSettings();

  const imageUrl = normalizeImage(product.image || product.image_url);
  const variantPrices = getStoredVariantPrices(product.variant_prices, product.beverage_specs);
  const isSale = !variantPrices || Object.keys(variantPrices).length === 0
    ? product.old_price && Number(product.old_price) > Number(product.price)
    : false;
  const discountPercent = isSale ? Math.round((1 - (product.price / Number(product.old_price))) * 100) : 0;

  const minTier = product.min_loyalty_tier || 'Explorer';
  const isLocked = TIER_RANK[userTier] < TIER_RANK[minTier];

  // 🥘 BITE COMMAND: Availability Logic
  const checkIsBiteOpen = () => {
    if (!product.is_bite) return true;
    if (!product.is_available_now) return false;
    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const start = parseInt((product.operating_hours?.start || "18:00").replace(':', ''));
    const end = parseInt((product.operating_hours?.end || "02:00").replace(':', ''));
    if (start > end) return currentTime >= start || currentTime < end;
    return currentTime >= start && currentTime < end;
  };

  const isBiteOpen = checkIsBiteOpen();
  const canPurchase = !isLocked && isBiteOpen && (product.stock || 0) > 0;
  if (!allowUnpublishedPreview && !isStorefrontProductVisible(product)) return null;
  const beverageSpecs = product.beverage_specs;
  const abvDisplay = product.abv_label || beverageSpecs?.abv;
  const originDisplay = product.origin || beverageSpecs?.origin;
  const regionDisplay = product.region || beverageSpecs?.region;
  const sizeDisplay = product.size_label || product.sizes?.[0];
  const startingPrice = getStartingPrice(product.price, variantPrices, product.sizes);
  const drinkDetails = [
    { label: 'Origin', value: originDisplay },
    { label: 'Region', value: regionDisplay },
    { label: 'Size', value: sizeDisplay },
    { label: 'Alcohol', value: abvDisplay }
  ].filter((detail): detail is { label: string; value: string } =>
    typeof detail.value === 'string' && detail.value.trim().length > 0
  );

  // ▮▮ Stock Logic
  const getStockStatus = () => {
      if (product.stock === undefined || product.stock === null) return { label: 'Status Unknown', color: 'text-slate-400', bar: 'bg-slate-200' };
      if (product.stock === 0) return { label: 'Out of stock', color: 'text-rose-500', bar: 'bg-rose-100' };
      if (product.stock <= (product.stock_threshold_critical || 2)) return { label: `Only ${product.stock} left`, color: 'text-rose-600', bar: 'bg-rose-500' };
      if (product.stock <= (product.stock_threshold_low || 5)) return { label: `Only ${product.stock} left`, color: 'text-amber-600', bar: 'bg-amber-500' };
      return { label: 'Many in stock', color: 'text-emerald-600', bar: 'bg-emerald-500' };
  };
  const stockStatus = getStockStatus();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canPurchase) return;
    if (product.is_bite || product.is_snack) {
      router.push(`/shop/${product.id}`);
      return;
    }

    // Standardize variant selection for quick add
    const variant = (product.sizes && product.sizes.length > 0) ? product.sizes[0] : 'Standard';
    const variantPrice = getVariantPrice(product.price, variantPrices, variant);

    setIsAdding(true);
    addToCart({
      id: product.id,
      name: product.name,
      price: variantPrice,
      base_price: variantPrice,
      image: imageUrl,
      quantity: 1,
      category: product.category,
      size: variant,
      wholesale_price: product.wholesale_price,
      wholesale_min_qty: product.wholesale_min_qty
    });
    setIsAdding(false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const handleToggleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isInWishlist(product.id)) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: imageUrl,
        category: product.category
      });
    }
  };

  return (
    <>
      <Card className="group relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-left text-foreground shadow-md transition-all duration-500 hover:shadow-xl sm:min-h-[420px] sm:rounded-[3.5rem]">
        {/* Visual Container */}
        <div className="relative aspect-square min-w-0 overflow-hidden rounded-lg border border-amber-100/80 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-1.5 sm:m-4 sm:rounded-[2.5rem] sm:p-2">
            <div aria-hidden="true" className="pointer-events-none absolute inset-[14%] rounded-full bg-white/90 blur-2xl" />

            {/* Premium Locked Overlay */}
            {isLocked && (
                <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 shadow-sm animate-bounce">
                        <Lock size={24} />
                    </div>
                    <p className="text-[10px] font-black uppercase text-foreground tracking-widest leading-none">Bar VIP Exclusive</p>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-2">Required: {minTier} Rank</p>
                </div>
            )}

            {/* Badges */}
            <div className="absolute left-2.5 top-2.5 z-20 flex flex-col gap-2 sm:left-4 sm:top-4">
                {product.badge_override ? (
                    <span className="bg-slate-100 text-slate-800 text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-slate-200/60">{product.badge_override}</span>
                ) : (
                    <>
                        {product.is_new && <span className="bg-primary text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-primary/30">✨ NEW</span>}
                        {product.is_featured && <span className="bg-indigo-600 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-indigo-500/30">⭐ FEATURED</span>}
                        {product.order_count !== undefined && product.order_count > 10 && (
                            <span className="bg-amber-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1">
                                <TrendingUp size={10} /> TRENDING
                            </span>
                        )}
                        {product.is_bite && (
                            <span className={cn(
                                "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5",
                                isBiteOpen ? "bg-rose-500 text-white shadow-rose-500/30" : "bg-slate-200 text-slate-500"
                            )}>
                                <Utensils size={10} className="fill-current" /> {isBiteOpen ? 'Night Bite' : 'Closed'}
                            </span>
                        )}
                    </>
                )}
            </div>

            <Link href={`/shop/${product.id}`} prefetch={true} className="relative z-10 block h-full w-full">
                {!imageError ? (
                  <Image
                    src={imageUrl}
                    alt={product.name}
                    fill
                    loading="lazy"
                    quality={90}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                    className="object-contain scale-[1.15] drop-shadow-[0_18px_16px_rgba(15,23,42,0.24)] transition-transform duration-700 group-hover:scale-125"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={48} /></div>
                )}
            </Link>
        </div>

        {/* Content Node */}
        <CardContent className="flex min-w-0 flex-1 flex-col space-y-2.5 p-3 pt-2.5 sm:space-y-4 sm:p-6 sm:pt-8">
            {/* Price Line */}
            <div className="space-y-0.5 sm:space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3">
                    <div className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-black tracking-tight text-white shadow-lg shadow-primary/20 sm:px-3 sm:text-sm">
                        {product.sizes?.length ? `From ${formatPrice(startingPrice)}` : formatPrice(product.price)}
                    </div>
                    {isSale && (
                        <span className="text-xs font-bold text-slate-400 line-through shrink-0">
                            {formatPrice(Number(product.old_price))}
                        </span>
                    )}
                </div>
                {isSale && (
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1 truncate">
                        {discountPercent}% OFF
                    </p>
                )}
            </div>

            {/* Product Hierarchy */}
            <Link href={`/shop/${product.id}`} className="block group/link min-w-0">
                <h2 className="break-words text-sm font-black uppercase leading-snug tracking-normal text-foreground line-clamp-2 transition-colors group-hover/link:text-primary sm:text-base sm:tracking-tight">
                    {product.name}
                </h2>
                <div className="mt-2 hidden flex-wrap items-center gap-x-1.5 gap-y-1 text-[8px] font-bold uppercase leading-relaxed tracking-[0.04em] text-slate-500 sm:flex sm:gap-2 sm:text-[9px] sm:tracking-widest">
                    {originDisplay && <span className="max-w-[90px] truncate font-extrabold text-slate-700">{originDisplay}</span>}
                    {originDisplay && sizeDisplay && <div className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />}
                    {sizeDisplay && <span className="shrink-0 font-extrabold text-slate-700">{sizeDisplay}</span>}
                    {abvDisplay && (
                        <>
                            {(originDisplay || sizeDisplay) && <div className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />}
                            <span className="shrink-0 rounded border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 font-extrabold text-amber-600">
                                {abvDisplay}
                            </span>
                        </>
                    )}
                </div>
                {drinkDetails.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2 sm:hidden">
                        {drinkDetails.map(({ label, value }) => (
                            <div key={label} className="min-w-0">
                                <dt className="text-[7px] font-bold uppercase leading-tight tracking-wider text-slate-400">{label}</dt>
                                <dd
                                    className={cn(
                                        "mt-0.5 truncate text-[9px] font-extrabold leading-tight",
                                        label === 'Alcohol' ? "text-amber-700" : "text-slate-700"
                                    )}
                                    title={value}
                                >
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
            </Link>

            <Link
                href={`/shop/${product.id}#customer-reviews`}
                className="mt-1 hidden min-h-7 items-center gap-1.5 self-start rounded-md text-[8px] font-black uppercase tracking-[0.05em] text-slate-500 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex sm:text-[9px] sm:tracking-widest"
                aria-label={`Rate ${product.name}`}
            >
                <Star size={12} className="text-amber-500" />
                Rate this drink
            </Link>

            {/* Stock Indicator */}
            <div className="flex items-center gap-1.5 pt-0.5 sm:gap-3 sm:pt-2">
                <div className="flex gap-0.5 shrink-0">
                    <div className={cn("h-3 w-1.5 rounded-full", stockStatus.bar)} />
                    <div className={cn("h-3 w-1.5 rounded-full opacity-40", stockStatus.bar)} />
                </div>
                <span className={cn("truncate text-[8px] font-black uppercase leading-tight tracking-normal sm:text-[10px] sm:tracking-widest", stockStatus.color)}>
                    {stockStatus.label}
                </span>
            </div>

            <div className="mt-auto flex gap-1 pt-1 sm:gap-2 sm:pt-4">
                <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={!canPurchase || isAdding}
                    aria-label={`${product.is_bite || product.is_snack ? 'Buy' : 'Add to cart'} ${product.name}`}
                    className={cn(
                        "flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1.5 text-[8px] font-black uppercase leading-none tracking-normal transition-all sm:h-10 sm:text-[9px] sm:tracking-widest",
                        !canPurchase
                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                            : justAdded
                                ? "bg-emerald-500 text-white"
                                : "bg-primary text-white shadow-sm hover:bg-primary/90 active:scale-95"
                    )}
                >
                    {isAdding ? <Loader2 size={12} className="animate-spin" /> : justAdded ? <Check size={12} /> : <ShoppingCart size={12} />}
                    <span className="truncate">
                        {!canPurchase
                            ? (isLocked ? 'Locked' : !isBiteOpen ? 'Closed' : 'Sold out')
                            : justAdded
                                ? 'Added'
                                : product.is_bite || product.is_snack
                                    ? 'Buy'
                                    : <><span className="sm:hidden">Buy</span><span className="hidden sm:inline">Add to cart</span></>}
                    </span>
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        const message = `Hello Online Bar! I want to order:\n\n*Product:* ${product.name}\n${product.sizes?.length ? `*Size:* ${product.sizes[0]}\n` : ''}*Price:* ${formatPrice(product.sizes?.length ? getVariantPrice(product.price, variantPrices, product.sizes[0]) : product.price)}\n\nIs this available for dispatch?`;
                        window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-primary transition-all hover:bg-primary/5 sm:h-10 sm:w-10 sm:rounded-xl"
                >
                    <MessageSquare size={16} />
                </button>
                <button onClick={handleToggleLike} className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-100 transition-all sm:h-10 sm:w-10 sm:rounded-xl", isInWishlist(product.id) ? "bg-rose-50 text-rose-500 border-rose-100" : "bg-slate-50 text-slate-300 hover:text-rose-500")}><Heart size={16} fill={isInWishlist(product.id) ? "currentColor" : "none"} /></button>
            </div>
        </CardContent>
      </Card>
    </>
  );
}
