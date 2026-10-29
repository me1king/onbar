'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Compass, Heart, RotateCcw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from './ProductCard';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/lib/useSettings';
import { isAllowed } from '@/lib/consentService';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import type { Product } from '@/types/product';

const ALCOHOL_PATTERN = /(alcohol|spirit|wine|beer|whisk|whiskey|gin|vodka|tequila|rum|brandy|liqueur|champagne|cognac)/i;

function normalizeProducts(rows: Product[]) {
  return rows.map(product => ({ ...product, image_url: product.image_url || '' }));
}

function isNonAlcoholicRecommendation(product: Product) {
  return !ALCOHOL_PATTERN.test([
    product.name,
    product.category,
    product.sub_category,
    product.brand
  ].filter(Boolean).join(' '));
}

async function loadAvailableProducts(categories?: string[], limit = 80) {
  const database = supabase;
  if (!database) throw new Error('Recommendations are temporarily unavailable.');
  let query = database.from('products').select('*')
    .gt('stock', 0).order('created_at', { ascending: false }).limit(limit);
  if (categories?.length) query = query.in('category', categories);
  const result = await query;
  if (result.error) throw result.error;
  return normalizeProducts((result.data || []) as Product[])
    .filter(product =>
      isStorefrontProductVisible(product)
      && Number(product.stock) > 0
      && isNonAlcoholicRecommendation(product)
    );
}

const TASTE_STORAGE_KEY = 'ob_taste_categories';

function readSavedCategories(allowedCategories: Set<string>) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(TASTE_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.filter((value): value is string =>
      typeof value === 'string' && allowedCategories.has(value)
    ))];
  } catch (error) {
    console.warn('[PersonalizedFeed] Saved taste preferences could not be read:', error);
    return [];
  }
}

function readViewedIds() {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('ob_history') || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((value): value is number => Number.isSafeInteger(value) && value > 0).slice(0, 20);
  } catch (error) {
    console.warn('[PersonalizedFeed] Recent browsing history could not be read:', error);
    return [];
  }
}

export default function PersonalizedFeed() {
  const { settings } = useSettings();
  const categories = useMemo(() => settings.catalog.categories
    .filter(category =>
      category.id.trim()
      && category.label.trim()
      && !ALCOHOL_PATTERN.test(`${category.id} ${category.label}`)
    )
    .map(category => ({ id: category.id.toLowerCase(), label: category.label })), [settings.catalog.categories]);
  const allowedCategories = useMemo(() => new Set(categories.map(category => category.id)), [categories]);
  const behaviorBasedCategories = useMemo(() => new Set(categories.map(category => category.id)), [categories]);
  const [personalizationAllowed, setPersonalizationAllowed] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasTasteSignal, setHasTasteSignal] = useState(false);

  useEffect(() => {
    const syncConsent = () => setPersonalizationAllowed(isAllowed('personalization'));
    syncConsent();
    window.addEventListener('ob-consent-updated', syncConsent);
    return () => window.removeEventListener('ob-consent-updated', syncConsent);
  }, []);

  useEffect(() => {
    if (!personalizationAllowed) {
      setSelectedCategories([]);
      return;
    }
    setSelectedCategories(readSavedCategories(allowedCategories));
  }, [allowedCategories, personalizationAllowed]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasTasteSignal(false);
    try {
      if (!supabase) throw new Error('Recommendations are temporarily unavailable.');

      let viewedIds: number[] = [];
      let tasteCategories = personalizationAllowed ? selectedCategories : [];
      if (personalizationAllowed && tasteCategories.length === 0) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (session) {
          const { data, error: historyError } = await supabase
            .from('browsing_history')
            .select('product_id')
            .eq('user_id', session.user.id)
            .order('viewed_at', { ascending: false })
            .limit(10);
          if (historyError) throw historyError;
          viewedIds = (data || []).map(item => Number(item.product_id))
            .filter(id => Number.isSafeInteger(id) && id > 0);
        } else {
          viewedIds = readViewedIds();
        }

        if (viewedIds.length) {
          const { data, error: productError } = await supabase.from('products')
            .select('category')
            .in('id', viewedIds);
          if (productError) throw productError;
          tasteCategories = [...new Set((data || []).map(item =>
            typeof item.category === 'string' ? item.category.toLowerCase() : ''
          ).filter(category => behaviorBasedCategories.has(category)))];
        }
      }

      let candidates = await loadAvailableProducts(tasteCategories);
      setHasTasteSignal(tasteCategories.length > 0 && candidates.length > 0);

      if (viewedIds.length && personalizationAllowed) {
        candidates = candidates.filter(product => !viewedIds.includes(Number(product.id)));
      }

      if (candidates.length < 4 && tasteCategories.length) {
        const additional = await loadAvailableProducts(undefined, 40);
        const existingIds = new Set(candidates.map(product => Number(product.id)));
        candidates = [
          ...candidates,
          ...additional.filter(product =>
            !existingIds.has(Number(product.id))
          )
        ];
      }

      setSuggestedProducts(candidates.slice(0, 4));
    } catch (loadError) {
      console.error('[PersonalizedFeed] Could not load available recommendations:', loadError);
      setSuggestedProducts([]);
      setError(loadError instanceof Error ? loadError.message : 'Recommendations are temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [behaviorBasedCategories, personalizationAllowed, selectedCategories]);

  useEffect(() => { void loadFeed(); }, [loadFeed]);

  const saveTaste = () => {
    if (!personalizationAllowed) return;
    try {
      const validated = selectedCategories.filter(category => allowedCategories.has(category));
      localStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify(validated));
      setSelectedCategories(validated);
      setEditing(false);
    } catch (saveError) {
      console.error('[PersonalizedFeed] Taste preferences could not be saved:', saveError);
      setError('Your taste preferences could not be saved on this device.');
    }
  };

  const clearTaste = () => {
    if (!personalizationAllowed) return;
    try {
      localStorage.removeItem(TASTE_STORAGE_KEY);
      setSelectedCategories([]);
      setEditing(false);
    } catch (clearError) {
      console.error('[PersonalizedFeed] Taste preferences could not be cleared:', clearError);
      setError('Your saved taste preferences could not be cleared.');
    }
  };

  if (!loading && !error && suggestedProducts.length === 0) return null;

  return (
    <section className="mx-auto max-w-screen-2xl border-t border-slate-100 px-4 py-12 text-left sm:px-6 sm:py-16 lg:px-8">
      <div className="overflow-hidden rounded-[2rem] border border-amber-100 bg-gradient-to-br from-white via-white to-amber-50/70 p-5 shadow-sm sm:rounded-[2.5rem] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100/70 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-900">
              <Sparkles aria-hidden="true" size={13} /> {hasTasteSignal ? 'Picked for your preferences' : 'Available now'}
            </div>
            <h2 className="mt-4 text-2xl font-black uppercase tracking-tight text-slate-950 sm:text-3xl">
              {hasTasteSignal ? 'A little more of what you like' : 'Good finds for tonight'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {hasTasteSignal
                ? 'Your picks stay editable and use only available items.'
                : personalizationAllowed
                  ? 'A few in-stock picks to get you started. Choose categories to tailor these.'
                  : 'A few in-stock picks to get you started. Turn on personalization in Privacy settings if you want to tailor these.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {personalizationAllowed && (
              <>
                <Button type="button" variant="outline" onClick={() => setEditing(value => !value)} className="h-10 rounded-xl border-slate-200 bg-white px-4 text-xs font-bold">
                  <Heart size={15} className="mr-2" /> {editing ? 'Close preferences' : 'Edit my tastes'}
                </Button>
                {(selectedCategories.length > 0) && (
                  <Button type="button" variant="ghost" onClick={clearTaste} className="h-10 rounded-xl px-3 text-xs font-bold text-slate-500">
                    <RotateCcw size={14} className="mr-2" /> Clear
                  </Button>
                )}
              </>
            )}
            <Link href="/shop" className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-primary">
              Browse menu <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {editing && personalizationAllowed && (
          <div className="mt-6 rounded-2xl border border-amber-100 bg-white p-4 sm:p-5">
            <p className="text-sm font-bold text-slate-800">What would you like to see more of?</p>
            <p className="mt-1 text-xs text-slate-500">Saved only on this device. Change or clear this any time.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map(category => {
                const selected = selectedCategories.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedCategories(current =>
                      selected ? current.filter(item => item !== category.id) : [...current, category.id]
                    )}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      selected ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300'
                    }`}
                  >
                    {selected && <Check size={14} aria-hidden="true" />}
                    {category.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button type="button" onClick={saveTaste} className="h-10 rounded-xl px-5 text-xs font-bold">
                Save my picks
              </Button>
              <p className="text-[11px] text-slate-500">Recommendations use available products only.</p>
            </div>
          </div>
        )}

        {error && <p role="status" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

        {loading ? (
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="aspect-[0.78] animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : suggestedProducts.length > 0 ? (
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {suggestedProducts.map(product => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">
            <Compass size={18} className="mt-0.5 shrink-0 text-primary" />
            <p>There are no in-stock picks to show right now. <Link href="/shop" className="font-bold text-primary underline underline-offset-2">Explore the full menu.</Link></p>
          </div>
        )}
      </div>
    </section>
  );
}
