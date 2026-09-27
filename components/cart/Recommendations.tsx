"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatPrice, normalizeImage } from '@/lib/utils';
import { ShoppingCart, ArrowRight, Loader2, Zap, Gift } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { useCart, CartItem } from '@/context/CartContext';

interface RecommendedProduct {
  id: number | string;
  name: string;
  price: number;
  image_url: string;
  category: string;
  is_souvenir?: boolean;
}

const DEFAULT_RECOMMENDED: RecommendedProduct[] = [
    {
        id: 301,
        name: 'BAR OS Premium Leather Hip Flask',
        price: 1200,
        category: 'Hip Flask Collection',
        image_url: 'https://images.unsplash.com/photo-1597075687490-8f673c3c175d?auto=format&fit=crop&q=80',
        is_souvenir: true
    },
    {
        id: 302,
        name: 'Engraved Crystal Shot Glass',
        price: 500,
        category: 'Shot Glass Vault',
        image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80',
        is_souvenir: true
    },
    {
        id: 303,
        name: 'Glencairn Whiskey Tasting Glass',
        price: 850,
        category: 'Whiskey Glass Collection',
        image_url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&q=80',
        is_souvenir: true
    },
    {
        id: 304,
        name: 'Tactical Stainless Bottle Opener',
        price: 450,
        category: 'Bottle Accessories',
        image_url: 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&q=80',
        is_souvenir: true
    }
];

export default function Recommendations() {
  const [products, setProducts] = useState<RecommendedProduct[]>(DEFAULT_RECOMMENDED);
  const [loading, setLoading] = useState(true);
  const { cart, addToCart } = useCart();

  useEffect(() => {
    async function fetchRecommended() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        // Smart Pairing Algorithm based on Cart Categories
        const cartCategories = cart.map(c => (c.category || '').toLowerCase());
        const hasWhiskey = cartCategories.some(c => c.includes('whiskey') || c.includes('whisky'));
        const hasWine = cartCategories.some(c => c.includes('wine') || c.includes('champagne'));
        const hasLiqueur = cartCategories.some(c => c.includes('liqueur') || c.includes('tequila') || c.includes('vodka'));

        let query = supabase.from('products').select('*');

        if (hasWhiskey) {
            query = query.or('category.ilike.%flask%,category.ilike.%whiskey glass%,is_souvenir.eq.true');
        } else if (hasWine) {
            query = query.or('category.ilike.%accessories%,category.ilike.%gift%,is_souvenir.eq.true');
        } else if (hasLiqueur) {
            query = query.or('category.ilike.%shot glass%,category.ilike.%flask%,is_souvenir.eq.true');
        } else {
            query = query.or('is_souvenir.eq.true,is_snack.eq.true').limit(4);
        }

        const { data, error } = await query.limit(4);

        if (!error && data && data.length > 0) {
            setProducts(data as unknown as RecommendedProduct[]);
        }
      } catch (err) {
        console.error("Recommendations query failed:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchRecommended();
  }, [cart]);

  if (loading) {
    return (
      <div className="mt-16 flex justify-center py-20 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <div className="mt-20 space-y-10">
      <div className="flex items-center justify-between px-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.3em]">
            <Gift size={14} /> COMPLETE THE NIGHT — MERCH & PAIRINGS
          </div>
          <h2 className="text-3xl font-black text-foreground uppercase tracking-tighter">Recommended Accessories & Souvenirs</h2>
        </div>
        <Link href="/souvenirs" className="group flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors">
          Souvenir Vault <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <Card key={String(product.id)} className="group rounded-[2.5rem] bg-white border border-slate-100 shadow-sm hover:shadow-2xl hover:border-primary/20 transition-all overflow-hidden flex flex-col">
            <div className="block aspect-square bg-slate-50 relative overflow-hidden">
                <Image
                    src={normalizeImage(product.image_url)}
                    alt={product.name}
                    fill
                    className="object-contain p-8 group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute top-4 right-4 h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
                    <Zap size={14} className="fill-current" />
                </div>
            </div>
            <CardContent className="p-6 flex-1 flex flex-col text-left">
              <div className="flex-1 space-y-1 mb-4">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">{product.category}</p>
                <h3 className="text-sm font-black text-foreground uppercase truncate group-hover:text-primary transition-colors">{product.name}</h3>
                <p className="text-lg font-black text-primary">{formatPrice(product.price)}</p>
              </div>
              <Button
                onClick={() => addToCart({
                  id: Number(product.id) || Date.now(),
                  name: product.name,
                  price: product.price,
                  base_price: product.price,
                  image: normalizeImage(product.image_url),
                  quantity: 1,
                  category: product.category || 'Merch'
                } as CartItem)}
                className="w-full h-12 rounded-2xl bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest hover:bg-primary transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={14} /> Add to Cart
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
