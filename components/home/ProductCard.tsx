"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCart } from "@/context/CartContext";
import { cn, formatPrice, normalizeImage } from "@/lib/utils";
import {
    Check,
    Heart,
    X,
    Loader2,
    Plus,
    ImageIcon,
    MessageSquare,
    Globe,
    Info,
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
  const [showQuickView, setShowQuickView] = useState(false);

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
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <span className="truncate max-w-[70px]">{product.origin || 'Imported'}</span>
                    <div className="h-1 w-1 rounded-full bg-slate-200 shrink-0" />
                    <span className="shrink-0">{product.size_label || 'Standard'}</span>
                    {product.abv_label && (
                        <>
                            <div className="h-1 w-1 rounded-full bg-slate-200 shrink-0" />
                            <span className="shrink-0">{product.abv_label} ABV</span>
                        </>
                    )}
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
                <button
                    onClick={() => setShowQuickView(true)}
                    className="flex-1 h-10 rounded-xl bg-slate-50 text-[8px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100"
                >
                    Quick Look
                </button>
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

      {/* Quick View Modal (High-Fidelity Restoration) */}
      {showQuickView && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/10 backdrop-blur-md p-4" onClick={() => setShowQuickView(false)}>
          <Card className="max-w-4xl w-full bg-white max-h-[90dvh] overflow-y-auto rounded-[3rem] border-none shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-8 border-b border-slate-50">
              <div className="flex items-center gap-3 text-slate-400">
                <Globe size={16} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Product Intelligence Preview</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full hover:bg-slate-100"
                onClick={() => setShowQuickView(false)}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <CardContent className="p-10 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-left">
                {/* Product Image Stage */}
                <div className="aspect-square overflow-hidden rounded-[2.5rem] bg-slate-50 flex items-center justify-center p-10 border border-slate-100 relative group/stage shadow-inner">
                  {!imageError ? (
                    <Image
                      src={imageUrl}
                      alt={product.name}
                      fill
                      className="object-contain hover:scale-110 transition-transform duration-700 p-10"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-200"><ImageIcon size={64} /></div>
                  )}

                  {/* Manufacturer Badge */}
                  {product.manufacturer && (
                    <div className="absolute bottom-6 left-6 bg-white/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 shadow-sm">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Manufacturer</p>
                        <p className="text-[10px] font-black text-foreground uppercase">{product.manufacturer}</p>
                    </div>
                  )}
                </div>

                {/* Content Node */}
                <div className="space-y-8 flex flex-col">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {product.category && <span className="bg-primary/10 text-primary text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{product.category}</span>}
                        {product.is_bite && <span className="bg-rose-50 text-rose-500 text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest">🥘 NIGHT BITE</span>}
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tight leading-none italic">
                      {product.name}
                    </h1>
                    <div className="flex items-baseline gap-4">
                      <p className="text-4xl font-black text-primary tracking-tighter">
                          {formatPrice(product.price)}
                      </p>
                      {isSale && <p className="text-xl font-bold text-slate-300 line-through tracking-tight">{formatPrice(Number(product.old_price))}</p>}
                    </div>
                  </div>

                  {/* High Fidelity Specs */}
                  <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">ABV Content</p>
                          <p className="text-sm font-black text-foreground uppercase">{product.abv_label || 'Standard'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Volume</p>
                          <p className="text-sm font-black text-foreground uppercase">{product.size_label || '750ml'}</p>
                      </div>
                  </div>

                  {/* Description Node */}
                  {product.description && (
                    <div className="flex gap-4 p-6 bg-slate-50/50 rounded-3xl border border-slate-100 italic">
                        <Info size={20} className="text-primary shrink-0" />
                        <p className="text-slate-500 text-sm font-medium leading-relaxed">
                            {product.description}
                        </p>
                    </div>
                  )}

                  {/* Ingredients Node (High-Fidelity) */}
                  {product.ingredients && Array.isArray(product.ingredients) && product.ingredients.length > 0 && (
                    <div className="space-y-4">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Component Profile (Ingredients)</p>
                        <div className="flex flex-wrap gap-2">
                            {product.ingredients.map((ing: string, i: number) => (
                                <span key={i} className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600 uppercase shadow-sm">{ing}</span>
                            ))}
                        </div>
                    </div>
                  )}

                  {/* Action Terminal */}
                  <div className="mt-auto pt-8 border-t border-slate-50 flex gap-4">
                    <Button
                      className={cn(
                        'flex-1 h-16 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl active:scale-95 transition-all',
                        justAdded
                          ? 'bg-emerald-500 text-white'
                          : 'bg-primary text-white shadow-primary/20 hover:bg-primary/90'
                      )}
                      onClick={handleAddToCart}
                      disabled={isAdding || (product.stock !== undefined && product.stock === 0)}
                    >
                      {isAdding ? <Loader2 className="animate-spin" /> : justAdded ? 'Added to Grid!' : 'Add to Selection'}
                    </Button>

                    <button
                        onClick={handleToggleLike}
                        className={cn(
                            "h-16 w-16 rounded-2xl border flex items-center justify-center transition-all",
                            isInWishlist(product.id) ? "bg-rose-50 border-rose-100 text-rose-500" : "bg-white border-slate-100 text-slate-300 hover:text-rose-500"
                        )}
                    >
                        <Heart size={24} fill={isInWishlist(product.id) ? "currentColor" : "none"} />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
