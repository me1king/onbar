'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Archive, ArrowLeft, ImagePlus, Package, Pencil, Store } from 'lucide-react';
import { marketSupabase } from '@/lib/marketSupabaseClient';

type Category = { name: string; slug: string };
type ProductReviewEvent = {
  event_type: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};
type InventoryMovement = {
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  note: string;
  created_at: string;
};
type MerchantProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: Category | null;
  status: string;
  review_note: string | null;
  created_at: string;
  review_events: ProductReviewEvent[];
  inventory_movements: InventoryMovement[];
  variants: Array<{
    price_minor: number;
    currency: string;
    size: string | null;
    color: string | null;
    inventory: { quantity_available: number; quantity_reserved: number } | null;
  }>;
  images: Array<{ url: string; alt: string }>;
};
type MerchantOffer = {
  id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  listed_price_minor: number;
  latest_amount_minor: number;
  accepted_amount_minor: number | null;
  status: string;
  product: { name: string; slug: string };
  variant: { size: string | null; color: string | null };
  messages: Array<{ actor: string; action: string; amount_minor: number | null; message: string | null; created_at: string }>;
};
type Application = { status: string; review_note: string | null; business_name: string };

const blankForm = { name: '', description: '', category: '', price: '', stock: '', size: '', color: '' };

export default function MerchantDashboardPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [offers, setOffers] = useState<MerchantOffer[]>([]);
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});
  const [application, setApplication] = useState<Application | null>(null);
  const [form, setForm] = useState(blankForm);
  const [editingProduct, setEditingProduct] = useState<MerchantProduct | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [workingOfferId, setWorkingOfferId] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState([
    { id: 'tusker-500', name: 'Tusker Lager 500ml', category: 'Beer', vendorPrice: 300, customerPrice: 340, stock: 12, selected: true, reachable: true, eta: 22 },
    { id: 'smirnoff-750', name: 'Smirnoff Vodka 750ml', category: 'Spirits', vendorPrice: 560, customerPrice: 620, stock: 8, selected: true, reachable: true, eta: 28 },
    { id: 'coke-500', name: 'Coca-Cola 500ml', category: 'Mixer', vendorPrice: 120, customerPrice: 150, stock: 18, selected: true, reachable: true, eta: 18 },
    { id: 'guinness-500', name: 'Guinness 500ml', category: 'Beer', vendorPrice: 330, customerPrice: 370, stock: 5, selected: false, reachable: false, eta: 44 },
    { id: 'jack-750', name: 'Jack Daniels 750ml', category: 'Spirits', vendorPrice: 930, customerPrice: 980, stock: 4, selected: false, reachable: false, eta: 48 },
  ]);
  const [catalogFilter, setCatalogFilter] = useState<'All' | 'Beer' | 'Spirits' | 'Mixer'>('All');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [routingProfile, setRoutingProfile] = useState({
    isOpen: true,
    busyMode: false,
    maxConcurrentOrders: 8,
    maxRadiusKm: 5,
    serviceHours: '12:00 - 23:30',
    routingMode: 'smart',
    acceptsAlcohol: true,
    autoReroute: true,
    staffAlerts: true
  });

  const loadOffers = useCallback(async (token: string) => {
    const response = await fetch('/api/market/merchant-offers', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const result = await response.json() as { offers?: MerchantOffer[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not load customer offers.');
    setOffers(result.offers || []);
  }, []);

  const loadProducts = useCallback(async (token: string) => {
    const response = await fetch('/api/market/merchant-products', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const result = await response.json() as { products?: MerchantProduct[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not load your shop.');
    setProducts(result.products || []);
  }, []);

  useEffect(() => {
    try {
      const savedProfile = window.localStorage.getItem('merchant-routing-profile');
      if (savedProfile) {
        setRoutingProfile((current) => ({ ...current, ...JSON.parse(savedProfile) }));
      }
    } catch {
      // ignore local storage persistence issues in restricted browsers
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('merchant-routing-profile', JSON.stringify(routingProfile));
    } catch {
      // ignore local storage persistence issues in restricted browsers
    }
  }, [routingProfile]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const categoryResponse = await fetch('/api/market/catalog', { cache: 'no-store' });
        const categoryResult = await categoryResponse.json() as { categories?: Category[]; error?: string };
        if (!categoryResponse.ok) throw new Error(categoryResult.error || 'Could not load market categories.');
        if (active) setCategories(categoryResult.categories || []);

        if (!marketSupabase) throw new Error('Merchant Studio is not configured on this site.');
        const { data: { session } } = await marketSupabase.auth.getSession();
        if (!active) return;
        if (!session?.access_token) {
          setError('Sign in to access your seller account.');
          return;
        }
        try {
          await loadProducts(session.access_token);
          await loadOffers(session.access_token);
          if (active) setAccessToken(session.access_token);
        } catch (cause) {
          const applicationResponse = await fetch('/api/market/merchant-application', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store'
          });
          const applicationResult = await applicationResponse.json() as { application?: Application | null };
          if (applicationResponse.ok && applicationResult.application && active) {
            setApplication(applicationResult.application);
            if (applicationResult.application.status === 'approved') {
              setError(cause instanceof Error ? cause.message : 'Your merchant access is currently unavailable.');
            }
          } else {
            throw cause;
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not open Merchant Studio.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [loadOffers, loadProducts]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    setImage(event.target.files?.[0] || null);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    if (!image && !editingProduct) {
      setError('Choose a product photo before submitting the listing.');
      return;
    }
    setWorking(true);
    setError('');
    setMessage('');
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.set(key, value));
    if (image) body.set('image', image);
    if (editingProduct) body.set('productId', editingProduct.id);
    try {
      const response = await fetch('/api/market/merchant-products', {
        method: editingProduct ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body
      });
      const result = await response.json() as { product?: { id: string }; error?: string };
      if (!response.ok || !result.product) throw new Error(result.error || 'Could not create this listing.');
      setMessage(editingProduct
        ? 'Listing updated and sent for Market review. It will appear in the storefront after approval.'
        : 'Listing sent for Market review. It will appear in the storefront after approval.');
      setForm(blankForm);
      setImage(null);
      setEditingProduct(null);
      await loadProducts(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this listing.');
    } finally {
      setWorking(false);
    }
  }

  async function respondToOffer(offer: MerchantOffer, action: 'accept' | 'counter' | 'decline') {
    if (!accessToken) return;
    const amountMinor = Math.round(Number(counterAmounts[offer.id]) * 100);
    if (action === 'counter' && (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > offer.listed_price_minor)) {
      setError('Enter a counteroffer between KSh 1 and the listed price.');
      return;
    }
    setWorkingOfferId(offer.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/market/merchant-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ offerId: offer.id, action, amountMinor })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this offer.');
      setMessage(action === 'accept' ? 'The offered price was accepted.' : action === 'counter' ? 'Your counteroffer was sent.' : 'The offer was declined.');
      await loadOffers(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this offer.');
    } finally {
      setWorkingOfferId(null);
    }
  }

  function editProduct(product: MerchantProduct) {
    const variant = product.variants[0];
    if (!variant) {
      setError('This listing has no active product variant to edit.');
      return;
    }
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      category: product.category?.slug || '',
      price: String(variant.price_minor / 100),
      stock: String(variant.inventory?.quantity_available ?? 0),
      size: variant.size || '',
      color: variant.color || ''
    });
    setImage(null);
    setError('');
    setMessage('');
    document.getElementById('merchant-listing-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function archiveProduct(product: MerchantProduct) {
    if (!accessToken || !window.confirm(`Archive "${product.name}"? It will no longer be shown in the customer market.`)) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/market/merchant-products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'archive', productId: product.id })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not archive this listing.');
      setMessage(`${product.name} has been archived.`);
      if (editingProduct?.id === product.id) {
        setEditingProduct(null);
        setForm(blankForm);
        setImage(null);
      }
      await loadProducts(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive this listing.');
    } finally {
      setWorking(false);
    }
  }

  const inventorySummary = products.reduce((summary, product) => {
    const available = product.variants.reduce((total, variant) => total
      + Math.max(0, (variant.inventory?.quantity_available ?? 0) - (variant.inventory?.quantity_reserved ?? 0)), 0);
    summary.units += available;
    if (available === 0 && product.status === 'published') summary.outOfStock += 1;
    return summary;
  }, { units: 0, outOfStock: 0 });
  const publishedCount = products.filter((product) => product.status === 'published').length;
  const reviewCount = products.filter((product) => product.status === 'pending_review').length;

  return (
    <>
      <header className="mm-header">
        <Link className="mm-brand" href="/market">MIDNIGHT <span>MARKET</span></Link>
        <nav className="mm-nav"><Link href="/merchant/register">Seller application</Link></nav>
      </header>
      <main className="mm-page mm-merchant-register">
        <Link className="mm-text-link" href="/market"><ArrowLeft size={14} /> Back to Market</Link>
        <div className="mm-register-card">
          <div className="mm-eyebrow">Merchant Studio</div>
          <h1>Your boutique, in control.</h1>
          <p className="mm-register-copy">Manage listings, pricing and stock. Every new or changed listing goes through Market review before it can appear in the customer market.</p>

          {loading && <div className="mm-state">Opening Merchant Studio…</div>}
          {!loading && error && !accessToken && !application && (
            <div className="mm-state">
              {error} <Link className="mm-text-link" href="/merchant/portal/login">Sign in</Link> · <Link className="mm-text-link" href="/merchant/register">Seller application</Link>
            </div>
          )}
          {!loading && application && (
            <div className="mm-state">
              <Store size={22} />
              <strong>{application.business_name}</strong>
              <span>Seller application: {application.status.replace(/_/g, ' ')}</span>
              {application.review_note && <span>{application.review_note}</span>}
              {error && <span className="mm-error">{error}</span>}
              {application.status === 'approved'
                ? <span>Merchant access is currently unavailable. Contact Market Operations if your boutique should be active.</span>
                : <Link className="mm-text-link" href="/merchant/register">View application</Link>}
            </div>
          )}
          {!loading && accessToken && !application && (
            <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Boutique overview">
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><span className="mm-eyebrow">Listings</span><strong className="mt-2 block text-2xl">{products.length}</strong></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><span className="mm-eyebrow">Published</span><strong className="mt-2 block text-2xl">{publishedCount}</strong></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><span className="mm-eyebrow">In review</span><strong className="mt-2 block text-2xl">{reviewCount}</strong></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><span className="mm-eyebrow">Sellable units</span><strong className="mt-2 block text-2xl">{inventorySummary.units.toLocaleString('en-KE')}</strong></div>
            </div>
            {inventorySummary.outOfStock > 0 && (
              <div className="mm-state" role="status">
                <Package size={18} />
                <span>{inventorySummary.outOfStock} published {inventorySummary.outOfStock === 1 ? 'listing has' : 'listings have'} no sellable stock. Update stock or archive the listing.</span>
              </div>
            )}

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mm-eyebrow">Vendor routing controls</div>
                  <h2 className="text-xl font-semibold">Operational coverage & dispatch</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setRoutingProfile((current) => ({ ...current, isOpen: !current.isOpen }))}
                  className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] ${routingProfile.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                >
                  {routingProfile.isOpen ? 'Open for delivery' : 'Paused'}
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Max concurrent orders
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={routingProfile.maxConcurrentOrders}
                    onChange={(event) => setRoutingProfile((current) => ({ ...current, maxConcurrentOrders: Number(event.target.value) || 1 }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Delivery radius (km)
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={routingProfile.maxRadiusKm}
                    onChange={(event) => setRoutingProfile((current) => ({ ...current, maxRadiusKm: Number(event.target.value) || 1 }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Operating hours
                  <input
                    type="text"
                    value={routingProfile.serviceHours}
                    onChange={(event) => setRoutingProfile((current) => ({ ...current, serviceHours: event.target.value }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Routing mode
                  <select
                    value={routingProfile.routingMode}
                    onChange={(event) => setRoutingProfile((current) => ({ ...current, routingMode: event.target.value }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-primary"
                  >
                    <option value="nearest">Nearest</option>
                    <option value="smart">Smart</option>
                    <option value="broadcast">Broadcast</option>
                    <option value="round_robin">Round robin</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { key: 'busyMode', label: 'Busy mode', description: 'Adds prep-time buffer for high-volume periods' },
                  { key: 'acceptsAlcohol', label: 'Alcohol licence valid', description: 'Required before alcohol orders can route in' },
                  { key: 'autoReroute', label: 'Auto reroute', description: 'If the shop misses a dispatch, another vendor can take over' },
                  { key: 'staffAlerts', label: 'Staff alerts', description: 'Loud push + WhatsApp fallback for missed orders' }
                ].map((setting) => (
                  <button
                    type="button"
                    key={setting.key}
                    onClick={() => setRoutingProfile((current) => ({ ...current, [setting.key]: !current[setting.key as keyof typeof current] }))}
                    className={`rounded-2xl border p-4 text-left transition ${routingProfile[setting.key as keyof typeof routingProfile] ? 'border-primary/20 bg-primary/5' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black">{setting.label}</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">{setting.description}</p>
                      </div>
                      <span className={`h-6 w-11 rounded-full relative ${routingProfile[setting.key as keyof typeof routingProfile] ? 'bg-primary' : 'bg-slate-200'}`}>
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${routingProfile[setting.key as keyof typeof routingProfile] ? 'left-6' : 'left-1'}`} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-[#0d1630] p-5 shadow-sm text-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Merchant stock</div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Merchant stock and prices</h2>
                </div>
                <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200">
                  {catalogItems.filter(item => item.selected && item.reachable).length} visible to customers
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(['All', 'Beer', 'Spirits', 'Mixer'] as const).map((pill) => (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => setCatalogFilter(pill)}
                      className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] ${catalogFilter === pill ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                    >
                      {pill}
                    </button>
                  ))}
                </div>
                <input
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Search stock..."
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 lg:max-w-xs"
                />
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {catalogItems
                  .filter((item) => (catalogFilter === 'All' || item.category === catalogFilter) && item.name.toLowerCase().includes(catalogSearch.toLowerCase()))
                  .map((item) => (
                  <div key={item.id} className={`relative overflow-hidden rounded-[1.5rem] border ${item.selected ? 'border-emerald-400/70' : 'border-white/10'} bg-[#1b2747]`}>
                    <button
                      type="button"
                      onClick={() => setCatalogItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, selected: !entry.selected } : entry))}
                      className="relative block w-full text-left"
                    >
                      <div className={`flex min-h-[180px] items-center justify-center text-6xl ${item.selected ? 'bg-[#d8c3b7]' : item.category === 'Spirits' ? 'bg-[#cfe5ef]' : item.category === 'Beer' ? 'bg-[#d9c09d]' : 'bg-[#e6c7d8]'}`}>
                        <span aria-hidden="true">{item.category === 'Beer' ? '🍺' : item.category === 'Spirits' ? '🍸' : '🥤'}</span>
                      </div>
                      {item.selected && (
                        <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-lg text-white shadow-lg shadow-emerald-500/30">✓</span>
                      )}
                    </button>

                    <div className="space-y-3 p-4">
                      <div className="min-h-[48px]">
                        <p className="text-lg font-black text-white">{item.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">{item.category}</p>
                      </div>

                      {item.selected ? (
                        <>
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                            <button type="button" onClick={() => setCatalogItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, vendorPrice: Math.max(0, entry.vendorPrice - 10) } : entry))} className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-black text-white">−</button>
                            <div className="text-center">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">Your price</div>
                              <div className="text-2xl font-black text-white">KSh {item.vendorPrice}</div>
                            </div>
                            <button type="button" onClick={() => setCatalogItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, vendorPrice: entry.vendorPrice + 10 } : entry))} className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-black text-white">+</button>
                          </div>

                          <div className="text-[11px] text-slate-300">Typical nearby: <span className="font-bold text-slate-100">KES {Math.max(200, item.customerPrice - 30)}–{item.customerPrice + 20}</span></div>
                          <div className="rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-black text-emerald-200">You receive KES {item.vendorPrice} each</div>

                          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                            <button type="button" onClick={() => setCatalogItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, stock: Math.max(0, entry.stock - 1) } : entry))} className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-black text-white">−</button>
                            <div className="text-center">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">Stock</div>
                              <div className="text-2xl font-black text-white">{item.stock}</div>
                            </div>
                            <button type="button" onClick={() => setCatalogItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, stock: entry.stock + 1 } : entry))} className="h-9 w-9 rounded-lg bg-slate-700 text-lg font-black text-white">+</button>
                          </div>

                          {item.stock === 0 && (
                            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-2 py-2 text-[11px] font-bold text-amber-100">Out of stock: hidden from customers</div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">Tap the photo to sell this</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#101b35] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Selected items</div>
                  <div className="mt-1 text-sm text-slate-200">{catalogItems.filter(item => item.selected).length} items listed</div>
                  <div className="text-[11px] text-slate-400">{catalogItems.filter(item => item.selected && item.stock > 0).length} in stock and visible to customers</div>
                </div>
                <button type="button" onClick={() => {}} className="h-12 rounded-2xl bg-emerald-400 px-6 text-sm font-black text-slate-900 shadow-lg shadow-emerald-500/30">Save my stock</button>
              </div>
            </div>

            <form id="merchant-listing-form" className="mm-form" onSubmit={submitProduct}>
              <div className="mm-form-wide flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="mm-eyebrow">{editingProduct ? 'Edit and resubmit' : 'Product management'}</div>
                  <h2 className="text-xl font-semibold">{editingProduct ? editingProduct.name : 'Create a listing'}</h2>
                </div>
                {editingProduct && <button className="mm-text-link" type="button" onClick={() => { setEditingProduct(null); setForm(blankForm); setImage(null); setError(''); setMessage(''); }}>Cancel edit</button>}
              </div>
              <label>Product name<input required minLength={2} maxLength={180} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="">Choose a category</option>
                {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
              </select></label>
              <label>Price (KSh)<input required type="number" min="1" max="1000000" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
              <label>Stock on hand<input required type="number" min="0" max="1000000" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /><span>Includes any quantities already reserved; sellable stock is shown on each listing.</span></label>
              <label>Size (optional)<input maxLength={80} value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></label>
              <label>Colour (optional)<input maxLength={80} value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
              <label className="mm-form-wide">Description<textarea rows={4} maxLength={3000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <label className="mm-form-wide mm-upload-field">
                <span><ImagePlus size={18} /> {editingProduct ? 'Replace photo (optional)' : 'Product photo'} · JPG, PNG, WebP or AVIF, up to 4 MB</span>
                <input required={!editingProduct} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleImageChange} />
                {image && <span>{image.name}</span>}
              </label>
              {editingProduct?.review_note && <div className="mm-state mm-form-wide"><strong>Market feedback:</strong> {editingProduct.review_note}</div>}
              {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
              {message && <div className="mm-state mm-form-wide" role="status">{message}</div>}
              <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Saving listing…' : editingProduct ? 'Save changes and resubmit for review' : 'Submit listing for review'}</button>
            </form>
            </div>
          )}
        </div>

        {accessToken && !application && (
          <section className="mm-merchant-listings">
            <div className="mm-section-heading">
              <div><div className="mm-eyebrow">Customer conversations</div><h2>Price offers</h2></div>
            </div>
            {error && <div className="mm-state mm-error" role="alert">{error}</div>}
            {message && <div className="mm-state" role="status">{message}</div>}
            {offers.length === 0
              ? <div className="mm-state">No customer offers yet.</div>
              : <div className="mm-offer-cards">
                {offers.map((offer) => (
                  <article className="mm-offer-card" key={offer.id}>
                    <div className="mm-offer-card-heading">
                      <div><strong>{offer.product.name}</strong><span>{[offer.variant.size, offer.variant.color].filter(Boolean).join(' / ') || 'Standard'} · {offer.status.replace(/_/g, ' ')}</span></div>
                      <strong>KSh {(offer.latest_amount_minor / 100).toLocaleString('en-KE')}</strong>
                    </div>
                    <div className="mm-offer-contact">{offer.buyer_name} · <a href={`mailto:${encodeURIComponent(offer.buyer_email)}`}>{offer.buyer_email}</a>{offer.buyer_phone && <> · <a href={`tel:${encodeURIComponent(offer.buyer_phone)}`}>{offer.buyer_phone}</a></>}</div>
                    <ol className="mm-offer-history">
                      {offer.messages.map((item, index) => <li key={`${item.created_at}-${index}`}>
                        <strong>{item.actor === 'admin' ? 'Market Operations' : item.actor === 'buyer' ? 'Customer' : 'Boutique'} · {item.action}</strong>
                        {item.amount_minor !== null && <span>KSh {(item.amount_minor / 100).toLocaleString('en-KE')}</span>}
                        {item.message && <p>{item.message}</p>}
                      </li>)}
                    </ol>
                    {['pending_merchant', 'countered'].includes(offer.status) && (
                      <div className="mm-offer-actions">
                        <button className="mm-button" type="button" disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'accept')}>Accept</button>
                        <label>Counteroffer (KSh)<input type="number" min="1" max={offer.listed_price_minor / 100} step="1" value={counterAmounts[offer.id] || ''} onChange={(event) => setCounterAmounts({ ...counterAmounts, [offer.id]: event.target.value })} /></label>
                        <button className="mm-button mm-button-secondary" type="button" disabled={workingOfferId === offer.id || !counterAmounts[offer.id]} onClick={() => void respondToOffer(offer, 'counter')}>Counter</button>
                        <button className="mm-text-link" type="button" disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'decline')}>Decline</button>
                      </div>
                    )}
                    {offer.status === 'accepted' && <p className="mm-phase-note">Recorded as a non-binding price agreement. Contact the customer to arrange next steps; checkout is not enabled.</p>}
                  </article>
                ))}
              </div>}
          </section>
        )}

        {accessToken && !application && (
          <section className="mm-merchant-listings">
            <div className="mm-section-heading"><div><div className="mm-eyebrow">Your catalogue</div><h2>Product listings</h2></div><span>{products.length} total</span></div>
            {products.length === 0
              ? <div className="mm-state">Your product catalogue is empty. Create your first listing above.</div>
              : <div className="mm-product-grid">
              {products.map((product) => (
                <article className="mm-product-card" key={product.id}>
                  <div className="mm-product-image">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt} fill unoptimized sizes="(max-width: 800px) 50vw, 25vw" /> : <ImagePlus size={40} />}</div>
                  <h3>{product.name}</h3>
                  <div className="mm-product-meta">Status: {product.status.replace(/_/g, ' ')}</div>
                  {product.variants[0] && <div className="mm-product-price">KSh {(product.variants[0].price_minor / 100).toLocaleString('en-KE')}</div>}
                  {product.variants[0] && <div className="mm-product-meta">Sellable stock: {Math.max(0, (product.variants[0].inventory?.quantity_available ?? 0) - (product.variants[0].inventory?.quantity_reserved ?? 0))}</div>}
                  {product.review_note && <p className="mm-state mm-error">{product.review_note}</p>}
                  {(product.review_events.length > 0 || product.inventory_movements.length > 0) && (
                    <details className="mt-3 rounded-xl border border-slate-200 p-3">
                      <summary className="cursor-pointer text-xs font-semibold">Review and stock history</summary>
                      {product.review_events.length > 0 && (
                        <ol className="mt-3 grid gap-2 text-xs">
                          {[...product.review_events]
                            .sort((left, right) => right.created_at.localeCompare(left.created_at))
                            .map((event, index) => (
                              <li key={`${event.created_at}-${index}`} className="border-l-2 border-primary/30 pl-3">
                                <strong>{event.event_type.replace(/_/g, ' ')} · {event.to_status.replace(/_/g, ' ')}</strong>
                                <time className="ml-2 text-slate-500">{new Date(event.created_at).toLocaleDateString()}</time>
                                {event.note && <p className="mt-1 text-slate-600">{event.note}</p>}
                              </li>
                            ))}
                        </ol>
                      )}
                      {product.inventory_movements.length > 0 && (
                        <ol className="mt-3 grid gap-2 text-xs">
                          {[...product.inventory_movements]
                            .sort((left, right) => right.created_at.localeCompare(left.created_at))
                            .slice(0, 5)
                            .map((movement, index) => (
                              <li key={`${movement.created_at}-${index}`} className="border-l-2 border-slate-200 pl-3">
                                <strong>Stock {movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta}</strong>
                                <span className="ml-2 text-slate-500">{movement.quantity_before} → {movement.quantity_after}</span>
                                <p className="mt-1 text-slate-600">{movement.note}</p>
                              </li>
                            ))}
                        </ol>
                      )}
                    </details>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="mm-button mm-button-secondary" type="button" onClick={() => editProduct(product)}><Pencil size={14} /> Edit</button>
                    {product.status !== 'archived' && <button className="mm-text-link" type="button" disabled={working} onClick={() => void archiveProduct(product)}><Archive size={14} /> Archive</button>}
                  </div>
                </article>
              ))}
            </div>}
          </section>
        )}
      </main>
    </>
  );
}
