'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from '@/components/home/ProductCard';
import { Cookie, ArrowRight, Utensils } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

interface Product {
  id: number;
  name: string;
  price: number;
  description?: string;
  image_url?: string;
  stock?: number;
  sizes?: string[];
}

export default function AllProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInventory() {
      setLoading(true);

      if (!supabase) {
          setProducts([]);
          setLoading(false);
          return;
      }

      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Unable to load products from Supabase:', error.message);
          // Fallback handled below
        }

        if (data && data.length > 0) {
          setProducts((data as Product[]).filter(isStorefrontProductVisible));
        } else {
          setProducts([]);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }
    loadInventory();

    if (!supabase) return;
    const channel = supabase
      .channel('realtime_storefront_shop')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadInventory();
      })
      .subscribe();
    return () => {
      if (supabase) void supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Loading Catalog...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-16 px-4 sm:px-6 lg:px-8 text-left">
      <div className="mx-auto max-w-screen-2xl">
        <header className="mb-16 border-b border-slate-100 pb-10 flex flex-col md:flex-row justify-between items-end gap-6">
          <div>
            <h1 className="text-5xl font-black tracking-tighter text-foreground uppercase">The Bar Menu</h1>
            <p className="text-slate-500 mt-2 font-medium text-lg">Premium beverages and authentic snacks for every celebration.</p>
          </div>
          <div className="text-right">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                  {products.length} Items Available
              </span>
          </div>
        </header>

        {/* Quick access to separately managed food and snack menus. */}
        <section className="mb-12 animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className="bg-slate-50 rounded-[2.5rem] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm border border-slate-100 relative overflow-hidden group">
                <div className="relative z-10 flex items-center gap-6">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/10 group-hover:rotate-6 transition-transform">
                        <Utensils size={28} />
                    </div>
                    <div className="text-left">
                        <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter leading-none">Food & Munchies</h2>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Street-food meals and snacks, in separate menus.</p>
                    </div>
                </div>
                <div className="relative z-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <Link href="/bites" data-behavior-id="shop.street_food_banner">
                        <Button className="h-12 w-full rounded-2xl bg-slate-900 px-6 text-white font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-slate-800 sm:w-auto">
                            Order Street Food <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    <Link href="/shop/snacks" data-behavior-id="shop.munchie_banner">
                        <Button variant="outline" className="h-12 w-full rounded-2xl border-slate-200 bg-white px-6 text-foreground font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 sm:w-auto">
                            Explore Snacks <Cookie className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </div>
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-primary/10 transition-colors"></div>
            </div>
        </section>

        {products.length === 0 ? (
          <div className="text-center py-32 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-inner">
            <p className="text-slate-400 font-black uppercase tracking-[0.2em]">The cellar is currently empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {products.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
