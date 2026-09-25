"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useCart } from "@/context/CartContext";
import { cn, formatPrice, normalizeImage } from "@/lib/utils";
import {
    Check,
    Heart,
    Loader2,
    Plus,
    ImageIcon,
    MessageSquare,
    TrendingUp,
    Lock,
    Utensils
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useWishlist } from "@/context/WishlistContext";
import { useSettings } from "@/lib/useSettings";
import { OB_OS } from "@/lib/onlineBarOS";
import { Product } from "@/types/product";

const TIER_RANK: Record<string, number> = {
    'Explorer': 0,
    'Silver': 1,
    'Gold': 2,
    'Diamond': 3,
    'Legend': 4
};

export default function ProductCard({ product, userTier = 'Explorer' }: { product: Product, userTier?: string }) {
  const [imageError, setImageError] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const { addToCart } = useCart();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const { settings } = useSettings();

  const imageUrl = normalizeImage(product.image || product.image_url);
  const isSale = product.old_price && Number(product.old_price) > Number(product.price);
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

  // ▮▮ Stock Logic
  const getStockStatus = () => {
      if (product.stock === undefined || product.stock === null) return { label: 'Status Unknown', color: 'text-slate-300', bar: 'bg-slate-100' };
      if (product.stock === 0) return { label: 'Out of stock', color: 'text-rose-500', bar: 'bg-rose-100' };
      if (product.stock <= (product.stock_threshold_critical || 2)) return { label: `Only ${product.stock} left`, color: 'text-rose-600', bar: 'bg-rose-500' };
      if (product.stock <= (product.stock_threshold_low || 5)) return { label: `Only ${product.stock} left`, color: 'text-amber-600', bar: 'bg-amber-500' };
      return { label: 'Many in stock', color: 'text-emerald-600', bar: 'bg-emerald-500' };
  };
  const stockStatus = getStockStatus();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLocked || !isBiteOpen) return;

    // Standardize variant selection for quick add
    const variant = (product.sizes && product.sizes.length > 0) ? product.sizes[0] : 'Standard';

    setIsAdding(true);
    OB_OS.track('ADD_TO_CART', {
        productId: product.id,
        amount: product.price,
        details: { name: product.name, category: product.category, size: variant }
    });
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      base_price: product.price,
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
      <Card className="group flex flex-col bg-white border-none shadow-sm hover:shadow-2xl transition-all duration-500 rounded-[2.5rem] overflow-hidden text-left relative min-h-[420px]">
        {/* Visual Container */}
        <div className="relative aspect-square bg-slate-50 flex items-center justify-center p-6 overflow-hidden">

            {/* Premium Locked Overlay */}
            {isLocked && (
                <div className="absolute inset-0 z-30 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 shadow-sm animate-bounce">
                        <Lock size={24} />
                    </div>
                    <p className="text-[10px] font-black uppercase text-foreground tracking-widest leading-none">Bar VIP Exclusive</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2">Required: {minTier} Rank</p>
                </div>
            )}

            {/* Badges */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                {product.badge_override ? (
                    <span className="bg-slate-900 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{product.badge_override}</span>
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

            {/* Floating +Add Control */}
            {!isLocked && isBiteOpen && (product.stock || 0) > 0 && (
                <button
                    onClick={handleAddToCart}
                    disabled={isAdding}
                    className={cn(
                        "absolute top-4 right-4 z-30 h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 transition-all duration-300 shadow-xl",
                        justAdded ? "bg-emerald-500 text-white" : "bg-white text-foreground hover:bg-primary hover:text-white opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
                    )}
                >
                    {isAdding ? <Loader2 size={12} className="animate-spin" /> : justAdded ? <Check size={12} /> : <Plus size={12} />}
                    {justAdded ? 'Added' : 'Add'}
                </button>
            )}

            <Link href={`/shop/${product.id}`} className="block w-full h-full relative">
                {!imageError ? (
                  <Image
                    src={imageUrl}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-contain transition-transform duration-700 group-hover:scale-110 p-4"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-200"><ImageIcon size={48} /></div>
                )}
            </Link>
        </div>

        {/* Content Node */}
        <CardContent className="p-6 pt-8 space-y-4 flex-1 flex flex-col min-w-0">
            {/* Price Line */}
            <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="bg-primary text-white px-3 py-1 rounded-full text-sm font-black tracking-tight shadow-lg shadow-primary/20 shrink-0">
                        {formatPrice(product.price)}
                    </div>
                    {isSale && (
                        <span className="text-xs font-bold text-slate-300 line-through shrink-0">
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
                <h2 className="text-sm sm:text-base font-black text-foreground uppercase tracking-tight leading-tight line-clamp-2 transition-colors group-hover/link:text-primary break-words">
                    {product.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    {(() => {
                        const bevSpecs = product.beverage_specs as Record<string, string> | undefined;
                        const abvDisplay = product.abv_label || bevSpecs?.abv || bevSpecs?.abv_label;
                        const originDisplay = product.origin || bevSpecs?.origin || 'Imported';

                        return (
                            <>
                                <span className="truncate max-w-[90px] text-slate-700 font-extrabold">{originDisplay}</span>
                                <div className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                                <span className="shrink-0 font-extrabold text-slate-700">{product.size_label || (product.sizes && product.sizes[0]) || '750ml'}</span>
                                {abvDisplay && (
                                    <>
                                        <div className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                                        <span className="shrink-0 font-extrabold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80">
                                            {abvDisplay}
                                        </span>
                                    </>
                                )}
                            </>
                        );
                    })()}
                </div>
            </Link>

            {/* Stock Indicator */}
            <div className="pt-2 flex items-center gap-3">
                <div className="flex gap-0.5 shrink-0">
                    <div className={cn("h-3 w-1.5 rounded-full", stockStatus.bar)} />
                    <div className={cn("h-3 w-1.5 rounded-full opacity-40", stockStatus.bar)} />
                </div>
                <span className={cn("text-[10px] font-black uppercase tracking-widest truncate", stockStatus.color)}>
                    {stockStatus.label}
                </span>
            </div>

            {/* Quick Actions Hidden by Default */}
            <div className="mt-auto pt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <Link
                    href={`/shop/${product.id}`}
                    className="flex-1 h-10 rounded-xl bg-slate-50 text-[8px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100 flex items-center justify-center text-foreground"
                >
                    Take a Look
                </Link>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        const message = `Hello Online Bar! I want to order:\n\n*Product:* ${product.name}\n*Price:* ${formatPrice(product.price)}\n\nIs this available for dispatch?`;
                        window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
                    }}
                    className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-primary hover:bg-primary/5 transition-all border border-slate-100"
                >
                    <MessageSquare size={16} />
                </button>
                <button onClick={handleToggleLike} className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-all border border-slate-100", isInWishlist(product.id) ? "bg-rose-50 text-rose-500 border-rose-100" : "bg-slate-50 text-slate-300 hover:text-rose-500")}><Heart size={16} fill={isInWishlist(product.id) ? "currentColor" : "none"} /></button>
            </div>
        </CardContent>
      </Card>
    </>
  );
}
