'use client';

import Image from 'next/image';
import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createDefaultGameBreakAdConfig,
  parseGameBreakAdConfig,
  type GameBreakAdConfig
} from '@/lib/gameBreakAd';
import { isClearlyNonAlcoholicProduct } from '@/lib/nonAlcoholicProducts';

type CatalogProduct = {
  id: number;
  name: string;
  price: number;
  image_url: string;
  category: string | null;
  sub_category: string | null;
  brand: string | null;
  stock: number;
  status: string;
};

function isCatalogProduct(value: unknown): value is CatalogProduct {
  if (!value || typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  return Number.isSafeInteger(product.id)
    && typeof product.name === 'string'
    && typeof product.price === 'number'
    && Number.isFinite(product.price)
    && typeof product.image_url === 'string'
    && typeof product.stock === 'number'
    && product.stock > 0
    && product.status === 'Live'
    && [product.category, product.sub_category, product.brand]
      .every(part => part === null || typeof part === 'string')
    && isClearlyNonAlcoholicProduct(value);
}

function canPreviewImage(imageUrl: string) {
  return imageUrl.startsWith('https://')
    || (imageUrl.startsWith('/') && !imageUrl.startsWith('//'));
}

export default function GameBreakAdControl() {
  const [config, setConfig] = useState<GameBreakAdConfig>(() => createDefaultGameBreakAdConfig());
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [settingsResponse, productsResponse] = await Promise.all([
          fetch('/api/admin/game-break-ad', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/catalog/products?in_stock=true&limit=500', { cache: 'no-store', signal: controller.signal })
        ]);
        const [settingsResult, productsResult] = await Promise.all([
          settingsResponse.json() as Promise<{ config?: unknown; error?: string }>,
          productsResponse.json() as Promise<{ products?: unknown; error?: string }>
        ]);
        if (!settingsResponse.ok) throw new Error(settingsResult.error || 'Game ad settings could not be loaded.');
        if (!productsResponse.ok) throw new Error(productsResult.error || 'The in-stock product catalog could not be loaded.');
        const savedConfig = parseGameBreakAdConfig(settingsResult.config);
        if (!savedConfig) throw new Error('The saved game ad configuration is invalid.');
        if (!Array.isArray(productsResult.products)) throw new Error('The product catalog response is invalid.');
        setConfig(savedConfig);
        setProducts(productsResult.products.filter(isCatalogProduct));
        setLoaded(true);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error('Game break ad settings could not be loaded:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Game ad settings could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  const selectedProduct = products.find(product => product.id === config.productId) || null;
  const previewImage = config.showImage
    ? config.imageUrl || selectedProduct?.image_url || ''
    : '';

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (config.enabled && (!config.productId || (!config.placements['do-or-drink'] && !config.placements['hot-seat']))) {
      setError('Choose an in-stock alcohol-free product and at least one game before enabling the ad.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/game-break-ad', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const result = await response.json() as { config?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error || 'Game ad settings could not be saved.');
      const savedConfig = parseGameBreakAdConfig(result.config);
      if (!savedConfig) throw new Error('The saved game ad response is invalid.');
      setConfig(savedConfig);
      setNotice(savedConfig.enabled
        ? 'Game break ad saved and published to the selected games.'
        : 'Game break ad saved as off. No ad will appear in the games.');
    } catch (saveError) {
      console.error('Game break ad settings could not be saved:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Game ad settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 text-slate-900 sm:p-8">
      <header className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Marketing control</p>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Game break ad control</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Choose the exact in-stock alcohol-free drink, copy, image, price visibility, button text, and game placements.
          Sponsored ads appear only when enabled. You can separately turn the fallback catalog suggestion on or off.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{notice}</p>}

      {loading ? (
        <p role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600">Loading game ad settings and eligible products…</p>
      ) : !loaded ? (
        <Card className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">Controls are unavailable until settings load successfully. Nothing has been changed.</p>
          <Button type="button" variant="outline" onClick={() => window.location.reload()} className="h-10 rounded-xl">Retry</Button>
        </Card>
      ) : (
        <form onSubmit={saveSettings} className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
          <Card className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={event => setConfig({ ...config, enabled: event.target.checked })}
                className="mt-1 h-5 w-5 accent-primary"
              />
              <span>
                <span className="block font-bold">Enable this game break ad</span>
                <span className="mt-1 block text-sm text-slate-600">When off, no sponsored ad is shown. The separate catalog suggestion setting still applies.</span>
              </span>
            </label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-bold">Show this ad in</legend>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={config.placements['do-or-drink']}
                  onChange={event => setConfig({
                    ...config,
                    placements: { ...config.placements, 'do-or-drink': event.target.checked }
                  })}
                  className="h-4 w-4 accent-primary"
                />
                Do or Drink water breaks
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={config.placements['hot-seat']}
                  onChange={event => setConfig({
                    ...config,
                    placements: { ...config.placements, 'hot-seat': event.target.checked }
                  })}
                  className="h-4 w-4 accent-primary"
                />
                Hot Seat water breaks
              </label>
              <p className="text-xs leading-5 text-slate-500">Players are anonymous in these games, so customer audience segments cannot be applied. Choose the game placements here.</p>
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="game-break-product" className="text-sm font-bold">Exact drink to promote</label>
              <select
                id="game-break-product"
                value={config.productId ?? ''}
                onChange={event => setConfig({ ...config, productId: event.target.value ? Number(event.target.value) : null })}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Choose an in-stock alcohol-free drink</option>
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name} · KES {product.price.toLocaleString()} · {product.stock} in stock
                  </option>
                ))}
              </select>
              {config.productId !== null && !selectedProduct && (
                <p className="text-sm text-amber-700">The saved drink is no longer available for promotion. Select a current in-stock alcohol-free product.</p>
              )}
              {products.length === 0 && (
                <p className="text-sm text-slate-500">No clearly alcohol-free, in-stock items are currently listed in the catalog.</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="game-break-headline" className="text-sm font-bold">Ad headline</label>
                <Input
                  id="game-break-headline"
                  maxLength={120}
                  value={config.headline}
                  onChange={event => setConfig({ ...config, headline: event.target.value })}
                  placeholder="Hydration break pick"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="game-break-button" className="text-sm font-bold">Button text</label>
                <Input
                  id="game-break-button"
                  maxLength={40}
                  value={config.ctaLabel}
                  onChange={event => setConfig({ ...config, ctaLabel: event.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="game-break-message" className="text-sm font-bold">Ad message</label>
              <Textarea
                id="game-break-message"
                maxLength={500}
                value={config.message}
                onChange={event => setConfig({ ...config, message: event.target.value })}
                placeholder="Write the short copy players will see."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="game-break-image" className="text-sm font-bold">Custom image URL (optional)</label>
              <Input
                id="game-break-image"
                maxLength={2000}
                value={config.imageUrl || ''}
                onChange={event => setConfig({ ...config, imageUrl: event.target.value || null })}
                placeholder="https://... or /images/campaign.jpg"
              />
              <p className="text-xs text-slate-500">Use a public HTTPS URL or a site-relative image path. Leave blank to use the selected product photo.</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-bold">Show in the break card</legend>
              {([
                ['showImage', 'Image'],
                ['showProductName', 'Product name'],
                ['showPrice', 'Current catalog price']
              ] as const).map(([field, label]) => (
                <label key={field} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={config[field]}
                    onChange={event => setConfig({ ...config, [field]: event.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={config.showCatalogSuggestion}
                onChange={event => setConfig({ ...config, showCatalogSuggestion: event.target.checked })}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-bold">Show a random catalog suggestion when no sponsored ad is active</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">Suggestions are labeled separately from ads and use only in-stock products clearly marked alcohol-free. Turn this off for water-only breaks unless an ad is published.</span>
              </span>
            </label>

            <Button type="submit" disabled={saving} className="h-12 w-full rounded-xl font-bold">
              <Save size={16} />
              {saving ? 'Saving…' : 'Save game ad controls'}
            </Button>
          </Card>

          <Card className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="text-lg font-black">Live preview</h2>
            {previewImage && canPreviewImage(previewImage) && (
              <div className="relative h-44 overflow-hidden rounded-xl bg-slate-100">
                <Image src={previewImage} alt="" fill unoptimized className="object-cover" />
              </div>
            )}
            {config.headline && <h3 className="font-bold">{config.headline}</h3>}
            {config.showProductName && <p className="font-semibold">{selectedProduct?.name || 'Selected drink'}</p>}
            {config.message && <p className="whitespace-pre-wrap text-sm text-slate-600">{config.message}</p>}
            {config.showPrice && selectedProduct && <p className="text-sm font-semibold">KES {selectedProduct.price.toLocaleString()}</p>}
            <p className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-white">{config.ctaLabel || 'Button text'}</p>
            <p className="text-xs leading-5 text-slate-500">Water remains the break prompt. This optional ad appears only in the games you select and only while enabled.</p>
          </Card>
        </form>
      )}
    </div>
  );
}
