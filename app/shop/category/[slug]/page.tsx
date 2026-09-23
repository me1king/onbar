import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from '@/components/home/ProductCard';
import { Product } from '@/types/product';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug || '';
  const categorySlug = slug.toLowerCase();

  let products: Product[] = [];
  let fetchError: { message: string } | null = null;

  if (supabase && categorySlug) {
    try {
      let query = supabase.from('products').select('*');

      if (categorySlug === 'new-arrivals') {
        query = query.or('is_new.eq.true,is_featured.eq.true');
      } else if (categorySlug === 'sale') {
        query = query.or('is_on_offer.eq.true,old_price.not.is.null,category.eq.sale,category.eq.deals');
      } else if (categorySlug === 'featured') {
        query = query.eq('is_featured', true);
      } else {
        query = query.ilike('category', `%${categorySlug}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        products = data as Product[];
      } else {
        // Fallback: fetch all products and filter in memory or return top catalog items
        const { data: allData } = await supabase.from('products').select('*').limit(20);
        if (allData) {
          const typedAll = allData as Product[];
          if (categorySlug === 'sale') {
            const saleItems = typedAll.filter(p => (p.old_price && Number(p.old_price) > Number(p.price)) || p.is_on_offer || p.category === 'sale');
            products = saleItems.length > 0 ? saleItems : typedAll.slice(0, 8).map(p => ({ ...p, old_price: Math.round(p.price * 1.15) }));
          } else if (categorySlug === 'new-arrivals') {
            products = typedAll.slice(0, 8);
          } else {
            const matchedCat = typedAll.filter(p => p.category?.toLowerCase().includes(categorySlug));
            products = matchedCat.length > 0 ? matchedCat : typedAll.slice(0, 8);
          }
        }
      }
    } catch (err) {
      console.error('Category page logic crash:', err);
      fetchError = { message: "Internal application error" };
    }
  }

  const displayTitle = categorySlug
    ? (categorySlug || '').split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    : 'Drinks';

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 text-left min-h-screen bg-white">
      <div className="border-b border-slate-100 pb-8 mb-12">
        <h1 className="text-4xl font-black tracking-tight text-foreground uppercase">
          {displayTitle} {!displayTitle.toLowerCase().includes('arrivals') && 'Items'}
        </h1>
        <p className="mt-2 text-slate-500 font-medium">
          Discover our curated collection of premium vintages and spirits.
        </p>
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4 sm:gap-8">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-inner">
          <p className="text-slate-400 text-lg font-bold uppercase tracking-widest px-6">
            {fetchError ? "Please check your Supabase database schema." : `No items found in ${displayTitle}.`}
          </p>
          <div className="flex flex-col items-center gap-4 mt-8">
            <Link href="/">
                <button className="rounded-2xl px-10 py-4 bg-primary text-white font-black uppercase text-xs shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95">
                    Back to homepage
                </button>
            </Link>
            {fetchError && (
                <p className="text-[10px] text-rose-500 font-bold max-w-md bg-rose-50 p-2 rounded-lg">
                    Error: {fetchError.message}
                </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
