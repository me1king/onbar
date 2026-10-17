'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from './ProductCard';
import { OB_OS } from '@/lib/onlineBarOS';
import {
  LayoutGrid,
  Wine,
  Beer,
  GlassWater,
  Cookie,
  Search,
  ArrowUpDown,
  Filter,
  CheckSquare,
  Square,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Product as CatalogProduct } from '@/types/product';
import { getStartingPrice, getStoredVariantPrices } from '@/lib/productPricing';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { isAllowed } from '@/lib/consentService';

type Product = CatalogProduct;

const CATEGORIES = [
    { id: 'all', label: 'All Menu', icon: LayoutGrid },
    { id: 'wine', label: 'Vintages', icon: Wine },
    { id: 'whiskey', label: 'Whiskey', icon: GlassWater },
    { id: 'beer', label: 'Chilled Beers', icon: Beer },
    { id: 'snacks', label: 'Snacks', icon: Cookie },
    { id: 'mixers', label: 'Mixers', icon: Zap },
];

export default function ProductList({ initialProducts }: { initialProducts?: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [loading, setLoading] = useState(!initialProducts);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [userTier, setUserTier] = useState('Explorer');

  // New Pro Filters
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState('all');

  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const lastTrackedSearchRef = useRef<string | null>(null);

  useEffect(() => {
    async function fetchInitialData() {
      try {
        if (!supabase) {
          setError('The product catalog is unavailable because Supabase is not configured.');
          setProducts([]);
          setLoading(false);
          return;
        }

        const [prodRes, tierRes] = await Promise.all([
            supabase.from('products').select('*').order('created_at', { ascending: false }),
            supabase.auth.getSession().then(async ({ data: { session } }) => {
                if (!session || !supabase) return { data: null };
                try {
                    return await supabase.from('profiles').select('loyalty_points').eq('id', session.user.id).maybeSingle();
                } catch {
                    return { data: null };
                }
            })
        ]);

        if (prodRes.error) {
          console.error('Supabase fetch error:', prodRes.error.message);
          setError(`The product catalog could not be loaded: ${prodRes.error.message}`);
          setProducts([]);
        } else {
          setError(null);
          setProducts((prodRes.data as Product[] || []).filter(isStorefrontProductVisible));
        }

        if (tierRes?.data) {
            const pts = (tierRes.data as { loyalty_points?: number }).loyalty_points || 0;
            if (pts >= 5000) setUserTier('Legend');
            else if (pts >= 2000) setUserTier('Diamond');
            else if (pts >= 1000) setUserTier('Gold');
            else if (pts >= 500) setUserTier('Silver');
        }
      } catch (err) {
        console.error('Error fetching products:', err);
        setError('Failed to load products');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    if (!initialProducts || initialProducts.length === 0) {
        fetchInitialData();
    }

    if (!supabase) return;
    const channel = supabase
      .channel('realtime_storefront_product_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchInitialData();
      })
      .subscribe();
    return () => {
      if (supabase) void supabase.removeChannel(channel);
    };
  }, [initialProducts]);

  // Listen for Global Search Event & URL Params
  useEffect(() => {
    // 1. Check URL Params on load
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const term = params.get('search');
        if (term) {
            setSearchQuery(term);
            setActiveCategory('all');
            setSelectedBrand('all');
        }
    }

    // 2. Listen for custom events (TOTAL FILTER RESET)
    const handleProductSearch = (e: Event) => {
        const customEvent = e as CustomEvent<{ query?: string }>;
        const query = customEvent.detail?.query || '';
        setSearchQuery(query);
        setActiveCategory('all');
        setSelectedBrand('all');
        setMinPrice('');
        setMaxPrice('');
        setInStockOnly(false);
    };

    window.addEventListener('ob-search', handleProductSearch);
    return () => window.removeEventListener('ob-search', handleProductSearch);
  }, []);

  const filteredProducts = useMemo(() => {
      let filtered = products.filter(isStorefrontProductVisible);

      // 1. Category Filter
      if (activeCategory !== 'all') {
          filtered = filtered.filter(p => (p.category || '').toLowerCase() === (activeCategory || '').toLowerCase());
      }

      // 2. Search Filter
      if ((searchQuery || '').trim()) {
          const query = (searchQuery || '').toLowerCase();
          filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(query) ||
            (p.brand || '').toLowerCase().includes(query) ||
            (p.description || '').toLowerCase().includes(query) ||
            (p.category || '').toLowerCase().includes(query) ||
            (p.sub_category || '').toLowerCase().includes(query)
          );
      }

      // 3. Price Range Filter
      if (minPrice) {
          filtered = filtered.filter(p => getStartingPrice(p.price, getStoredVariantPrices(p.variant_prices, p.beverage_specs), p.sizes) >= Number(minPrice));
      }
      if (maxPrice) {
          filtered = filtered.filter(p => getStartingPrice(p.price, getStoredVariantPrices(p.variant_prices, p.beverage_specs), p.sizes) <= Number(maxPrice));
      }

      // 4. Stock Filter
      if (inStockOnly) {
          filtered = filtered.filter(p => (p.stock || 0) > 0);
      }

      // 5. Brand Filter
      if (selectedBrand !== 'all') {
          filtered = filtered.filter(p =>
            (p.brand?.trim() || (p.name || '').trim().split(' ')[0]).toLowerCase() === selectedBrand.toLowerCase()
          );
      }

      // 6. Sorting
      filtered.sort((a, b) => {
          const aPrice = getStartingPrice(a.price, getStoredVariantPrices(a.variant_prices, a.beverage_specs), a.sizes);
          const bPrice = getStartingPrice(b.price, getStoredVariantPrices(b.variant_prices, b.beverage_specs), b.sizes);
          if (sortBy === 'low-to-high') return aPrice - bPrice;
          if (sortBy === 'high-to-low') return bPrice - aPrice;
          return (b.created_at ? new Date(b.created_at).getTime() : b.id)
            - (a.created_at ? new Date(a.created_at).getTime() : a.id);
      });

      return filtered;
  }, [products, activeCategory, searchQuery, sortBy, minPrice, maxPrice, inStockOnly, selectedBrand]);

  // Extract unique brands (first word of product name)
  const brands = useMemo(() => {
      // Logic: Only show brands that exist in the active category
      const storefrontProducts = products.filter(isStorefrontProductVisible);
      const currentCategoryProds = activeCategory === 'all'
        ? storefrontProducts
        : storefrontProducts.filter(p => (p.category || '').toLowerCase() === activeCategory.toLowerCase());

      const allBrands = currentCategoryProds
        .map(p => p.brand?.trim() || (p.name || '').trim().split(' ')[0])
        .filter(Boolean);
      return ['all', ...Array.from(new Set(allBrands)).sort((a, b) => a.localeCompare(b))];
  }, [products, activeCategory]);

  useEffect(() => {
    setVisibleCount(24);
  }, [activeCategory, searchQuery, sortBy, minPrice, maxPrice, inStockOnly, selectedBrand]);

  // 3. 🚀 [MASTER_OS] Track Search & Discovery
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
        const query = searchQuery.trim().replace(/\s+/g, ' ').slice(0, 80);
        if (!supabase || !isAllowed('analytics')) return;
        if (query.length < 2 || query.includes('@') || /^[+0-9() .-]{7,}$/.test(query)) {
          lastTrackedSearchRef.current = null;
          return;
        }
        if (lastTrackedSearchRef.current === query) return;
        const { data: { session } } = await supabase.auth.getSession();
        let anonId: string | null = null;
        try {
            anonId = localStorage.getItem('ob_anonymous_id');
        } catch (error) {
            console.warn('[SearchAnalytics] Could not read anonymous analytics ID:', error);
        }

        const resultsCount = filteredProducts.length;
        lastTrackedSearchRef.current = query;

        await OB_OS.track('SEARCH_SUBMITTED', {
            userId: session?.user?.id,
            anonymousId: anonId || undefined,
            details: {
                query,
                analytics_consent: true,
                category: activeCategory,
                brand: selectedBrand,
                results_count: resultsCount
            }
        });

        if (resultsCount === 0 && query.length >= 3) {
            await OB_OS.track('ZERO_RESULTS', {
                userId: session?.user?.id,
                anonymousId: anonId || undefined,
                details: { query, path: window.location.pathname, analytics_consent: true }
            });
        }
    }, 1000); // 1s debounce to avoid spamming the log

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, activeCategory, selectedBrand, filteredProducts.length]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center gap-4 px-4 py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Syncing Catalog...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-3 pb-24 pt-6 text-left scroll-mt-32 sm:px-6" id="catalog-start">

    <header className="mb-8 space-y-2 px-2 sm:mb-10">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">Browse the live menu</p>
      <h2 className="break-words text-3xl font-black uppercase leading-tight tracking-tight text-slate-950 sm:text-4xl">Pick your pour</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">Explore available products, compare prices, and find something for your occasion.</p>
    </header>

      {/* 1. Category Tabs & Quick Munchies */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 px-4">
          <div className="flex overflow-x-auto pb-2 gap-2.5 sm:gap-4 scrollbar-hide no-scrollbar -mx-4 px-4 flex-1">
              {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                        setActiveCategory(cat.id);
                        setSearchQuery(''); // Reset search when switching categories
                        setSelectedBrand('all'); // Reset brand
                    }}
                    className={cn(
                        "flex items-center gap-2.5 px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all duration-300 shrink-0 border whitespace-nowrap",
                        activeCategory === cat.id
                            ? "bg-primary text-white border-primary shadow-xl shadow-primary/20 scale-105"
                            : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                    )}
                  >
                      <cat.icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", activeCategory === cat.id ? "text-white" : "text-slate-300")} />
                      {cat.label}
                  </button>
              ))}
          </div>
      </div>

      {/* 2. Pro Filters Bar */}
      <div className="space-y-6 mb-12 animate-in fade-in slide-in-from-top-4 duration-700">

          <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search whiskey, wine, beer, mixers..."
                    className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 pl-12 text-sm font-medium"
                  />
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
              </div>

              {/* Price Range */}
              <div className="flex items-center gap-2">
                  <div className="relative w-32">
                      <Input
                        type="number"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        placeholder="Min Ksh"
                        className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 text-xs font-bold"
                      />
                  </div>
                  <span className="text-slate-300">—</span>
                  <div className="relative w-32">
                      <Input
                        type="number"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        placeholder="Max Ksh"
                        className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 text-xs font-bold"
                      />
                  </div>
              </div>

              {/* Sort */}
              <div className="relative w-full lg:w-auto">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ArrowUpDown className="h-4 w-4 text-slate-400" />
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-14 w-full lg:w-64 pl-12 pr-6 rounded-2xl border border-slate-100 bg-slate-50/50 text-xs font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                  >
                      <option value="newest">Sort: Newest First</option>
                      <option value="low-to-high">Price: Low to High</option>
                      <option value="high-to-low">Price: High to Low</option>
                  </select>
              </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-6 pt-4 border-t border-slate-50">
              {/* Brand Filter */}
              <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1 shrink-0">
                      <Filter className="h-3 w-3" /> Brands:
                  </span>
                  {brands.map(brand => (
                      <button
                        key={brand}
                        onClick={() => setSelectedBrand(brand)}
                        className={cn(
                            "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                            selectedBrand === brand
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-slate-50 text-slate-400 border border-transparent hover:border-slate-100"
                        )}
                      >
                          {brand}
                      </button>
                  ))}
              </div>

              {/* Availability Toggle */}
              <button
                onClick={() => setInStockOnly(!inStockOnly)}
                className="flex items-center gap-2 group"
              >
                  <div className={cn(
                      "transition-colors",
                      inStockOnly ? "text-primary" : "text-slate-300 group-hover:text-slate-400"
                  )}>
                      {inStockOnly ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">In Stock Only</span>
              </button>
          </div>
      </div>

      {filteredProducts.length > 0 ? (
        <div className="space-y-12">
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredProducts.slice(0, visibleCount).map((product) => (
              <ProductCard key={product.id} product={product} userTier={userTier} />
            ))}
          </div>

          {filteredProducts.length > visibleCount && (
            <div className="flex justify-center pt-8">
              <button
                onClick={() => setVisibleCount(v => v + 24)}
                className="px-10 py-4 rounded-2xl bg-white border border-slate-200/80 text-foreground font-black uppercase tracking-widest text-[10px] hover:bg-primary hover:text-white transition-all shadow-md active:scale-95 flex items-center gap-2"
              >
                Load More Beverages ({filteredProducts.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-40 text-center bg-white rounded-[4rem] border-4 border-dashed border-slate-100 shadow-inner relative overflow-hidden group">
          <div className="relative z-10 space-y-6">
              <div className="h-32 w-32 rounded-full bg-slate-50 flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform duration-700">
                <LayoutGrid className="h-12 w-12 text-slate-200" />
              </div>
              <div className="space-y-2 text-left sm:text-center px-6">
                  <h3 className="text-2xl font-black text-foreground uppercase tracking-tighter">
                    {error ? 'Menu unavailable' : searchQuery || activeCategory !== 'all' ? 'No matching products' : 'No products listed yet'}
                  </h3>
                  <p className="text-slate-400 text-sm font-medium italic max-w-xs mx-auto">
                    {error
                      ? 'The catalog could not be loaded. Please try again later.'
                      : searchQuery || activeCategory !== 'all'
                        ? 'Try changing your search or clearing the filters.'
                        : 'There are currently no products available to display.'}
                  </p>
              </div>
              {!error && (searchQuery || activeCategory !== 'all' || minPrice || maxPrice || inStockOnly || selectedBrand !== 'all') && <button
                onClick={() => {
                    setActiveCategory('all');
                    setSearchQuery('');
                    setMinPrice('');
                    setMaxPrice('');
                    setInStockOnly(false);
                    setSelectedBrand('all');
                }}
                className="mt-8 px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95"
              >
                  Clear All Filters
              </button>}
          </div>
          {/* Background Decorative Zap */}
          <Zap className="absolute -bottom-10 -right-10 h-64 w-64 text-slate-50/50 rotate-12 -z-0" />
        </div>
      )}

      {error && (
        <div className="mt-12 bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-700 font-bold text-xs text-center">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
