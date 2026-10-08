'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react';
import ProductCard from '@/components/home/ProductCard';
import { Product } from '@/types/product';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { getStartingPrice } from '@/lib/productPricing';

type SortOrder = 'recommended' | 'price-ascending' | 'price-descending';

export default function CategoryCatalog({
  title,
  products,
  error
}: {
  title: string;
  products: Product[];
  error: string | null;
}) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [typesOpen, setTypesOpen] = useState(true);
  const [selectedType, setSelectedType] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recommended');

  const types = useMemo(
    () => Array.from(new Set(products
      .filter(isStorefrontProductVisible)
      .map(product => product.sub_category?.trim())
      .filter((type): type is string => Boolean(type))))
      .sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const visibleProducts = useMemo(() => {
    const availableProducts = products.filter(isStorefrontProductVisible);
    const filtered = selectedType
      ? availableProducts.filter(product => product.sub_category?.trim() === selectedType)
      : [...availableProducts];

    if (sortOrder === 'price-ascending') {
      filtered.sort((a, b) => getStartingPrice(a.price, a.variant_prices, a.sizes) - getStartingPrice(b.price, b.variant_prices, b.sizes));
    } else if (sortOrder === 'price-descending') {
      filtered.sort((a, b) => getStartingPrice(b.price, b.variant_prices, b.sizes) - getStartingPrice(a.price, a.variant_prices, a.sizes));
    }
    return filtered;
  }, [products, selectedType, sortOrder]);

  return (
    <main className="min-h-screen bg-[#edf5fc] pb-24 text-foreground">
      <section className="mx-2 mt-2 flex min-h-56 items-center justify-center rounded-2xl bg-white px-4 py-12 text-center sm:min-h-56 sm:rounded-3xl">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            {title} <span className="bg-gradient-to-r from-slate-900 to-rose-700 bg-clip-text text-transparent">delivery Nairobi</span>
          </h1>
        </div>
      </section>

      <nav aria-label="Breadcrumb" className="mx-auto flex max-w-none items-center gap-2 px-2 py-1 text-sm text-slate-500 sm:px-3">
        <Link href="/" className="hover:text-primary">Home</Link>
        <ChevronRight aria-hidden="true" size={15} />
        <span aria-current="page" className="capitalize">{title}</span>
      </nav>

      <section className="mx-auto max-w-none px-2 pt-6 sm:px-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300/70 py-4">
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(open => !open)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold uppercase tracking-wide text-slate-800 hover:bg-white/70"
          >
            <SlidersHorizontal aria-hidden="true" size={18} />
            Filter
            <ChevronDown aria-hidden="true" size={16} className={filtersOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}
            </span>
            <label className="sr-only" htmlFor="category-sort">Sort products</label>
            <select
              id="category-sort"
              value={sortOrder}
              onChange={event => setSortOrder(event.target.value as SortOrder)}
              className="min-h-11 max-w-[180px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-primary"
            >
              <option value="recommended">Recommended</option>
              <option value="price-ascending">Price: low to high</option>
              <option value="price-descending">Price: high to low</option>
            </select>
          </div>
        </div>

        {filtersOpen && types.length > 0 && (
          <div className="border-b border-slate-300/70 py-4">
            <button
              type="button"
              aria-expanded={typesOpen}
              onClick={() => setTypesOpen(open => !open)}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-800"
            >
              Types of {title}
              <ChevronDown aria-hidden="true" size={16} className={typesOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {typesOpen && (
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3 md:grid-cols-4">
                <button
                  type="button"
                  aria-pressed={!selectedType}
                  onClick={() => setSelectedType('')}
                  className={`min-h-10 px-2 text-left text-sm transition-colors ${!selectedType ? 'font-semibold text-rose-700' : 'text-rose-600 hover:text-rose-800'}`}
                >
                  All types
                </button>
                {types.map(type => (
                  <button
                    type="button"
                    key={type}
                    aria-pressed={selectedType === type}
                    onClick={() => setSelectedType(current => current === type ? '' : type)}
                    className={`min-h-10 px-2 text-left text-sm transition-colors ${selectedType === type ? 'font-semibold text-rose-700' : 'text-rose-600 hover:text-rose-800'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error ? (
          <div role="alert" className="my-10 rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : visibleProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 py-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map(product => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="my-10 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
            <p className="text-lg font-bold text-slate-800">
              {selectedType ? `No products found for ${selectedType}.` : `No ${title.toLowerCase()} products are currently available.`}
            </p>
            {selectedType && (
              <button type="button" onClick={() => setSelectedType('')} className="mt-4 font-semibold text-primary underline underline-offset-4">
                Clear type filter
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
