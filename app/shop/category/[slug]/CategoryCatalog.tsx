'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronRight, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import ProductCard from '@/components/home/ProductCard';
import { Product } from '@/types/product';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { getStartingPrice, getStoredVariantPrices } from '@/lib/productPricing';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recommended');

  const types = useMemo(
    () => Array.from(new Set(products
      .filter(isStorefrontProductVisible)
      .map(product => product.sub_category?.trim())
      .filter((type): type is string => Boolean(type))))
      .sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const brands = useMemo(
    () => Array.from(new Set(products
      .filter(isStorefrontProductVisible)
      .map(product => product.brand?.trim())
      .filter((brand): brand is string => Boolean(brand))))
      .sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const visibleProducts = useMemo(() => {
    const availableProducts = products.filter(isStorefrontProductVisible);
    const query = searchQuery.trim().toLowerCase();
    const filtered = availableProducts.filter(product => {
      const matchesType = !selectedType || product.sub_category?.trim() === selectedType;
      const matchesBrand = !selectedBrand || product.brand?.trim() === selectedBrand;
      const matchesSearch = !query || [
        product.name,
        product.brand,
        product.category,
        product.sub_category,
        product.description
      ].some(value => value?.toLowerCase().includes(query));
      return matchesType && matchesBrand && matchesSearch;
    });

    if (sortOrder === 'price-ascending') {
      filtered.sort((a, b) => getStartingPrice(a.price, getStoredVariantPrices(a.variant_prices, a.beverage_specs), a.sizes) - getStartingPrice(b.price, getStoredVariantPrices(b.variant_prices, b.beverage_specs), b.sizes));
    } else if (sortOrder === 'price-descending') {
      filtered.sort((a, b) => getStartingPrice(b.price, getStoredVariantPrices(b.variant_prices, b.beverage_specs), b.sizes) - getStartingPrice(a.price, getStoredVariantPrices(a.variant_prices, a.beverage_specs), a.sizes));
    }
    return filtered;
  }, [products, selectedType, selectedBrand, searchQuery, sortOrder]);

  return (
    <main className="min-h-screen bg-white pb-24 text-foreground">
      <nav aria-label="Breadcrumb" className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-4 text-sm text-slate-500 sm:px-6 lg:px-8">
        <Link href="/" className="transition-colors hover:text-primary">Home</Link>
        <ChevronRight aria-hidden="true" size={15} />
        <Link href="/shop" className="transition-colors hover:text-primary">Shop</Link>
        <ChevronRight aria-hidden="true" size={15} />
        <span aria-current="page" className="font-semibold capitalize text-slate-700">{title}</span>
      </nav>

      <section className="relative isolate overflow-hidden bg-[#fff8ec] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-amber-300/40 blur-3xl sm:h-[32rem] sm:w-[32rem]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-0 h-72 w-72 rounded-full bg-orange-200/50 blur-3xl" />
        <div className="mx-auto max-w-7xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-amber-800 shadow-sm">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-amber-500" />
            Live menu
          </div>
          <div className="mt-6 max-w-3xl">
            <h1 className="text-5xl font-black uppercase leading-[0.94] tracking-[-0.055em] text-slate-950 sm:text-6xl md:text-7xl">
              {title}
              <span className="mt-1 block text-primary">for the night.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
              Explore the live selection, compare sizes and styles, and add your favourites to the bag.
            </p>
          </div>
          <Link href="#category-catalog" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-xs font-black uppercase tracking-wider text-white transition hover:bg-primary">
            Browse {title} <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <nav aria-label="Shop by category" className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-7 sm:grid-cols-4 sm:gap-4 sm:px-6 sm:py-10 lg:px-8">
        {[
          { label: 'Spirits', href: '/shop/category/spirits' },
          { label: 'Wine', href: '/shop/category/wine' },
          { label: 'Beer', href: '/shop/category/beer' },
          { label: 'Snacks', href: '/bites' }
        ].map(category => (
          <Link key={category.label} href={category.href} className="group flex min-h-24 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg sm:min-h-28 sm:rounded-3xl sm:p-6">
            <span className="text-lg font-black uppercase leading-tight tracking-tight text-slate-900 sm:text-xl">{category.label}</span>
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange-50 text-primary transition group-hover:bg-primary group-hover:text-white">
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </nav>

      <section id="category-catalog" className="mx-auto max-w-7xl scroll-mt-28 px-4 sm:px-6 lg:px-8">
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

        <div className="flex flex-col gap-4 border-b border-slate-200 py-5 lg:flex-row">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <label htmlFor="category-search" className="sr-only">Search {title}</label>
            <input
              id="category-search"
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/60 pl-12 pr-4 text-sm font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
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

        {filtersOpen && brands.length > 0 && (
          <div className="flex items-center gap-3 overflow-x-auto border-b border-slate-200 py-4 no-scrollbar">
            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400">Brands:</span>
            <button
              type="button"
              aria-pressed={!selectedBrand}
              onClick={() => setSelectedBrand('')}
              className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest ${!selectedBrand ? 'border border-primary/20 bg-primary/10 text-primary' : 'border border-transparent bg-slate-50 text-slate-500'}`}
            >
              All
            </button>
            {brands.map(brand => (
              <button
                type="button"
                key={brand}
                aria-pressed={selectedBrand === brand}
                onClick={() => setSelectedBrand(current => current === brand ? '' : brand)}
                className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest ${selectedBrand === brand ? 'border border-primary/20 bg-primary/10 text-primary' : 'border border-transparent bg-slate-50 text-slate-500'}`}
              >
                {brand}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <div role="alert" className="my-10 rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : visibleProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 py-6 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
