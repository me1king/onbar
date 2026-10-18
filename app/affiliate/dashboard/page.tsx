'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  MousePointerClick,
  PackageSearch,
  QrCode,
  Search,
  ShoppingBag,
  Sparkles,
  Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatPrice, getReferralLink, normalizeImage } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'marketplace' | 'links' | 'earnings' | 'academy' | 'support';
type AffiliateProduct = {
  id: number;
  name: string;
  price: number;
  category: string;
  imageUrl: string | null;
  inStock: boolean;
};
type AttributedOrder = {
  id: number;
  status: string;
  total: number;
  createdAt: string;
};
type AffiliatePayout = {
  id: number | string;
  amount: number;
  status: string;
  payment_method: string;
  created_at: string;
  processed_at: string | null;
  mpesa_receipt: string | null;
};
interface AffiliateData {
  application: {
    business_name: string;
    verification_status: string;
    preferred_payout_method: string;
    payout_details: string;
    primary_channels?: string[];
  };
  referralCode: string;
  stats: {
    clicks: number;
    conversions: number;
    sales: number;
    earned: number;
    available: number;
    pendingEarnings: number;
    pendingOrders: number;
    pendingSales: number;
    commissionRate: number;
  };
  payouts: AffiliatePayout[];
  products: AffiliateProduct[];
  attributedOrders: AttributedOrder[];
}
type SavedLink = { label: string; url: string; destination: string };

const NAVIGATION: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'marketplace', label: 'Product marketplace', icon: PackageSearch },
  { id: 'links', label: 'My links & QR', icon: Link2 },
  { id: 'earnings', label: 'Earnings & payouts', icon: Wallet },
  { id: 'academy', label: 'Affiliate academy', icon: BookOpen },
  { id: 'support', label: 'Support', icon: Mail }
];

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function estimateOrderCommission(order: AttributedOrder, rate: number) {
  const status = order.status.toLowerCase();
  const qualifyingStatuses = ['paid', 'dispatched', 'delivered', 'completed'];
  const pendingStatuses = ['created', 'payment pending', 'stock reserved', 'supplier confirmed', 'processing', 'packed', 'out for delivery'];
  if (qualifyingStatuses.includes(status)) return { amount: order.total * rate / 100, label: 'Estimated' };
  if (pendingStatuses.includes(status)) return { amount: order.total * rate / 100, label: 'Pending estimate' };
  return { amount: null, label: 'Not currently eligible' };
}

function makeSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export default function AffiliateDashboard() {
  const router = useRouter();
  const [data, setData] = React.useState<AffiliateData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('M-Pesa');
  const [paymentDetails, setPaymentDetails] = React.useState('');
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabId>('overview');
  const [productSearch, setProductSearch] = React.useState('');
  const [linkLabel, setLinkLabel] = React.useState('');
  const [destination, setDestination] = React.useState('shop');
  const [productDestination, setProductDestination] = React.useState('');
  const [savedLinks, setSavedLinks] = React.useState<SavedLink[]>([]);
  const [qrImage, setQrImage] = React.useState<string | null>(null);
  const [qrLinkLabel, setQrLinkLabel] = React.useState('');

  const loadDashboard = React.useCallback(async () => {
    if (!supabase) {
      setMessage({ type: 'error', text: 'Affiliate services are not configured.' });
      setLoading(false);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth?mode=signin&redirect=/affiliate/dashboard');
      return;
    }

    const response = await fetch('/api/affiliate', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
    const result = await response.json() as AffiliateData & { error?: string; code?: string };
    if (response.status === 401) {
      router.push('/auth?mode=signin&redirect=/affiliate/dashboard');
      return;
    }
    if (response.status === 403 && result.code === 'INVITE_REQUIRED') {
      router.replace('/affiliate/register');
      return;
    }
    if (response.status === 403 && result.code === 'APPLICATION_PENDING') {
      router.replace('/profile');
      return;
    }
    if (response.status === 403 && result.code === 'ACCOUNT_SUSPENDED') {
      router.replace('/profile');
      return;
    }
    if (!response.ok) throw new Error(result.error || 'Could not load your affiliate dashboard.');
    if (result.application?.verification_status !== 'Verified') {
      router.replace('/profile');
      return;
    }
    setData(result);
    setPaymentMethod(result.application.preferred_payout_method || 'M-Pesa');
    setPaymentDetails(result.application.payout_details || '');
    setLoading(false);
  }, [router]);

  React.useEffect(() => {
    loadDashboard().catch(error => {
      console.error('[AffiliateDashboard] Could not load data:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load your affiliate dashboard.' });
      setLoading(false);
    });
    try {
      const saved = localStorage.getItem('ob_affiliate_saved_links');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSavedLinks(parsed.filter((item): item is SavedLink =>
            typeof item?.label === 'string' && typeof item?.url === 'string' && typeof item?.destination === 'string'
          ).slice(0, 50));
        }
      }
    } catch (error) {
      console.error('[AffiliateDashboard] Could not load saved links:', error);
    }
  }, [loadDashboard]);

  const referralUrl = data ? getReferralLink(data.referralCode) : '';
  const conversionRate = data && data.stats.clicks > 0 ? data.stats.conversions / data.stats.clicks * 100 : 0;
  const averageOrderValue = data && data.stats.conversions > 0 ? data.stats.sales / data.stats.conversions : 0;
  const earningsPerClick = data && data.stats.clicks > 0 ? data.stats.earned / data.stats.clicks : 0;
  const categories = React.useMemo(
    () => [...new Set((data?.products || []).map(product => product.category))].sort(),
    [data?.products]
  );
  const filteredProducts = React.useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return (data?.products || []).filter(product =>
      !query || product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query)
    );
  }, [data?.products, productSearch]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('[AffiliateDashboard] Could not copy text:', error);
      setMessage({ type: 'error', text: 'Could not copy. Select and copy the text manually.' });
    }
  };

  const saveGeneratedLink = () => {
    if (!data) return;
    let path = '/shop';
    let destinationLabel = 'Online Bar shop';
    if (destination === 'product' && productDestination) {
      const product = data.products.find(item => String(item.id) === productDestination);
      if (!product) {
        setMessage({ type: 'error', text: 'Select an available product for this link.' });
        return;
      }
      path = `/product/${product.id}`;
      destinationLabel = product.name;
    } else if (destination === 'category' && productDestination) {
      const category = categories.find(item => item === productDestination);
      if (!category) {
        setMessage({ type: 'error', text: 'Select a product category for this link.' });
        return;
      }
      path = `/shop/category/${encodeURIComponent(makeSlug(category))}`;
      destinationLabel = `${category} category`;
    }

    const link = {
      label: linkLabel.trim() || destinationLabel,
      url: getReferralLink(data.referralCode, path),
      destination: destinationLabel
    };
    const next = [link, ...savedLinks.filter(item => item.url !== link.url)].slice(0, 50);
    setSavedLinks(next);
    setLinkLabel('');
    try {
      localStorage.setItem('ob_affiliate_saved_links', JSON.stringify(next));
    } catch (error) {
      console.error('[AffiliateDashboard] Could not save generated link locally:', error);
      setMessage({ type: 'error', text: 'The link was generated, but could not be saved on this device.' });
      return;
    }
    setMessage({ type: 'success', text: 'Referral link created and saved on this device.' });
  };

  const createQr = async (link: SavedLink) => {
    try {
      const QRCode = await import('qrcode');
      setQrImage(await QRCode.toDataURL(link.url, { width: 320, margin: 2, errorCorrectionLevel: 'H' }));
      setQrLinkLabel(link.label);
    } catch (error) {
      console.error('[AffiliateDashboard] Could not create a QR code:', error);
      setMessage({ type: 'error', text: 'Could not create a QR code for this link.' });
    }
  };

  const removeSavedLink = (url: string) => {
    const next = savedLinks.filter(link => link.url !== url);
    setSavedLinks(next);
    try {
      localStorage.setItem('ob_affiliate_saved_links', JSON.stringify(next));
    } catch (error) {
      console.error('[AffiliateDashboard] Could not update saved links:', error);
      setMessage({ type: 'error', text: 'Could not update saved links on this device.' });
    }
    if (qrImage && savedLinks.find(link => link.url === url)?.label === qrLinkLabel) setQrImage(null);
  };

  const requestPayout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth?mode=signin&redirect=/affiliate/dashboard');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/affiliate/payouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          amount: Number(amount),
          payment_method: paymentMethod,
          payment_details: paymentDetails
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not submit payout request.');
      setMessage({ type: 'success', text: 'Payout request submitted. It will be reviewed by the Online Bar team.' });
      setAmount('');
      await loadDashboard();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not submit payout request.' });
    } finally {
      setSubmitting(false);
    }
  };

  const exportStatement = () => {
    if (!data) return;
    const rows: Array<Array<string | number>> = [
      ['Record type', 'Reference', 'Date', 'Status', 'Amount (KES)', 'Commission estimate (KES)'],
      ...data.attributedOrders.map(order => {
        const commission = estimateOrderCommission(order, data.stats.commissionRate);
        return [
          'Attributed order', `Order #${order.id}`, new Date(order.createdAt).toISOString(),
          order.status, order.total, commission.amount ?? ''
        ];
      }),
      ...data.payouts.map(payout => [
        'Payout request', `Payout #${payout.id}`, new Date(payout.created_at).toISOString(),
        payout.status, payout.amount, ''
      ])
    ];
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `affiliate-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="text-sm font-bold text-slate-500">Loading Affiliate Studio...</span>
      </div>
    );
  }

  const statCards = [
    { label: 'Available to request', value: formatPrice(data?.stats.available ?? 0), icon: Wallet, note: 'After pending payout requests' },
    { label: 'Pending commission', value: formatPrice(data?.stats.pendingEarnings ?? 0), icon: ClockIcon, note: 'Attributed orders still in progress' },
    { label: 'Attributed orders', value: (data?.stats.conversions ?? 0).toLocaleString(), icon: ShoppingBag, note: 'Paid or fulfillment started' },
    { label: 'Eligible referral clicks', value: (data?.stats.clicks ?? 0).toLocaleString(), icon: MousePointerClick, note: 'All-time referral code total' }
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to profile
        </Link>

        <header className="flex flex-col justify-between gap-5 rounded-3xl bg-slate-950 p-6 text-white sm:flex-row sm:items-end sm:p-9">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">After Hours · Affiliate Studio</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Your influence pays.</h1>
            <p className="mt-3 max-w-xl text-sm text-slate-300">
              Find products to promote, share your tracked link, follow attributed sales and request a payout.
            </p>
            <p className="mt-4 text-sm font-semibold text-white">{data?.application.business_name}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:min-w-56">
            <p className="text-xs uppercase tracking-widest text-slate-300">Commission rate</p>
            <p className="mt-1 text-3xl font-black">{data?.stats.commissionRate}%</p>
            <p className="mt-1 text-xs text-slate-300">Current attributed-order rate</p>
          </div>
        </header>

        {message && (
          <div className={cn(
            'rounded-xl border p-4 text-sm font-medium',
            message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
          )}>{message.text}</div>
        )}

        <nav aria-label="Affiliate Studio" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
          {NAVIGATION.map(item => (
            <button
              key={item.id}
              type="button"
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-colors',
                activeTab === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Affiliate performance">
              {statCards.map(item => (
                <Card key={item.label} className="rounded-2xl border-slate-200 bg-white p-5">
                  <item.icon className="mb-4 h-5 w-5 text-primary" />
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-black text-foreground">{item.value}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.note}</p>
                </Card>
              ))}
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <Card className="space-y-4 rounded-2xl border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">Your affiliate link</h2>
                    <p className="mt-1 text-sm text-slate-500">Share anywhere. Referral code: <code>{data?.referralCode}</code></p>
                  </div>
                  <Link2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input readOnly value={referralUrl} aria-label="Affiliate referral link" className="h-12 font-mono text-xs" />
                  <Button onClick={() => void copyText(referralUrl, 'main-link')} className="h-12 shrink-0">
                    {copied === 'main-link' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copied === 'main-link' ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  Attribution is currently reported at referral-code level. Individual link/campaign performance is not yet separately measured.
                </p>
              </Card>

              <Card className="rounded-2xl border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-bold">Your next move</h2>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {!data?.stats.clicks
                    ? 'Browse available products and create a tracked link to start promoting.'
                    : data.stats.clicks > 0 && !data.stats.conversions
                      ? 'You have referral visits but no qualifying orders yet. Check that your link goes to a relevant, in-stock product.'
                      : 'Review your attributed orders, keep sharing products that convert, and track your payable balance.'}
                </p>
                <Button variant="outline" className="mt-4 rounded-xl" onClick={() => setActiveTab(data?.stats.clicks ? 'earnings' : 'marketplace')}>
                  {data?.stats.clicks ? 'Review performance' : 'Explore products'} <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </Card>
            </div>

            <section className="grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Click-to-order conversion', value: `${conversionRate.toFixed(1)}%`, note: `${data?.stats.conversions ?? 0} attributed orders / ${data?.stats.clicks ?? 0} clicks` },
                { label: 'Average attributed order', value: formatPrice(averageOrderValue), note: 'Based on current all-time totals' },
                { label: 'Commission per click', value: formatPrice(earningsPerClick), note: 'A simple all-time average, not a forecast' }
              ].map(metric => (
                <Card key={metric.label} className="rounded-2xl border-slate-200 bg-white p-5">
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-2xl font-black">{metric.value}</p>
                  <p className="mt-1 text-xs text-slate-400">{metric.note}</p>
                </Card>
              ))}
            </section>

            <Card className="rounded-2xl border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-bold">Recent attributed orders</h2>
              <AttributedOrdersTable orders={data?.attributedOrders.slice(0, 5) || []} rate={data?.stats.commissionRate || 0} />
              {(data?.attributedOrders.length || 0) > 5 && (
                <Button variant="link" className="mt-2 px-0" onClick={() => setActiveTab('earnings')}>View all orders</Button>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-black">Product marketplace</h2>
                <p className="mt-1 text-sm text-slate-500">Browse currently available Online Bar products and create a referral link.</p>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search products" className="pl-9" />
              </div>
            </div>
            {!filteredProducts.length ? (
              <Card className="rounded-2xl p-8 text-center text-sm text-slate-500">
                {data?.products.length ? 'No products match your search.' : 'No in-stock affiliate products are currently available.'}
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map(product => {
                  const url = getReferralLink(data?.referralCode || '', `/product/${product.id}`);
                  return (
                    <Card key={product.id} className="overflow-hidden rounded-2xl border-slate-200 bg-white">
                      <div className="relative h-52 bg-slate-100">
                        <Image src={normalizeImage(product.imageUrl)} alt={product.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-contain p-5" unoptimized />
                      </div>
                      <div className="space-y-3 p-5">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-primary">{product.category}</p>
                          <h3 className="mt-1 line-clamp-2 font-bold">{product.name}</h3>
                          <p className="mt-2 font-black">{formatPrice(product.price)}</p>
                          <p className="text-xs text-slate-500">{data?.stats.commissionRate}% standard affiliate rate</p>
                        </div>
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={() => void copyText(url, `product-${product.id}`)}>
                            {copied === `product-${product.id}` ? <Check className="mr-2 h-4 w-4" /> : <Link2 className="mr-2 h-4 w-4" />}
                            {copied === `product-${product.id}` ? 'Copied' : 'Copy tracked link'}
                          </Button>
                          <Button
                            variant="outline"
                            aria-label={`Create saved link for ${product.name}`}
                            onClick={() => {
                              setDestination('product');
                              setProductDestination(String(product.id));
                              setLinkLabel(product.name);
                              setActiveTab('links');
                            }}
                          ><QrCode className="h-4 w-4" /></Button>
                        </div>
                        <Button
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => void copyText(`${product.name} - ${formatPrice(product.price)}. Shop Online Bar: ${url}`, `caption-${product.id}`)}
                        >
                          {copied === `caption-${product.id}` ? 'Sample caption copied' : 'Copy sample caption'}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            <p className="text-xs leading-5 text-slate-500">
              Products shown are currently live, available and in stock. Availability can change before a customer places an order.
              The product rate shown is the affiliate’s current standard rate; confirm campaign-specific terms before promotion.
            </p>
          </div>
        )}

        {activeTab === 'links' && (
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="space-y-5 rounded-2xl border-slate-200 bg-white p-6">
              <div>
                <h2 className="text-xl font-bold">Smart link builder</h2>
                <p className="mt-1 text-sm text-slate-500">Create links to the shop, a category or a currently available product.</p>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                Link destination
                <select value={destination} onChange={event => { setDestination(event.target.value); setProductDestination(''); }} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="shop">Online Bar shop</option>
                  <option value="category">Product category</option>
                  <option value="product">Specific product</option>
                </select>
              </label>
              {destination !== 'shop' && (
                <label className="block space-y-2 text-sm font-semibold">
                  {destination === 'product' ? 'Product' : 'Category'}
                  <select value={productDestination} onChange={event => setProductDestination(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Choose a destination</option>
                    {destination === 'product'
                      ? data?.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)
                      : categories.map(category => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
              )}
              <label className="block space-y-2 text-sm font-semibold">
                Label (optional)
                <Input value={linkLabel} maxLength={80} onChange={event => setLinkLabel(event.target.value)} placeholder="e.g. Friday story" />
              </label>
              <Button className="w-full" onClick={saveGeneratedLink}><Link2 className="mr-2 h-4 w-4" /> Create tracked link</Button>
              <p className="text-xs leading-5 text-slate-500">
                Links preserve your referral code. Labels and saved links are stored in this browser only; reporting currently aggregates performance by referral code, not by individual link.
              </p>
            </Card>

            <div className="space-y-5">
              {qrImage && (
                <Card className="flex flex-col items-center gap-3 rounded-2xl border-slate-200 bg-white p-6 text-center">
                  <h3 className="font-bold">QR code: {qrLinkLabel}</h3>
                  <Image src={qrImage} alt={`QR code for ${qrLinkLabel}`} width={240} height={240} className="h-60 w-60" unoptimized />
                  <a href={qrImage} download={`affiliate-${makeSlug(qrLinkLabel)}-qr.png`} className="inline-flex items-center text-sm font-semibold text-primary">
                    <Download className="mr-2 h-4 w-4" /> Download QR image
                  </a>
                </Card>
              )}
              <Card className="rounded-2xl border-slate-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">My saved links</h2>
                  {savedLinks.length > 0 && <span className="text-xs text-slate-400">Saved on this device</span>}
                </div>
                {!savedLinks.length ? (
                  <p className="text-sm text-slate-500">No custom links yet. Build one to share a specific product or category.</p>
                ) : (
                  <div className="space-y-3">
                    {savedLinks.map(link => (
                      <div key={link.url} className="rounded-xl border border-slate-100 p-4">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            <p className="font-bold">{link.label}</p>
                            <p className="text-xs text-slate-500">{link.destination}</p>
                            <p className="mt-2 break-all font-mono text-xs text-slate-500">{link.url}</p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="outline" onClick={() => void copyText(link.url, link.url)}>
                              {copied === link.url ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void createQr(link)} aria-label={`Create QR for ${link.label}`}><QrCode className="h-4 w-4" /></Button>
                            <Button size="sm" variant="outline" onClick={() => removeSavedLink(link.url)} aria-label={`Remove ${link.label}`}>Remove</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'earnings' && (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Attributed order sales', value: formatPrice(data?.stats.sales ?? 0), icon: ShoppingBag },
                { label: 'Commission earned (estimate)', value: formatPrice(data?.stats.earned ?? 0), icon: Wallet },
                { label: 'Awaiting order completion', value: formatPrice(data?.stats.pendingEarnings ?? 0), icon: ArrowDownToLine }
              ].map(item => (
                <Card key={item.label} className="rounded-2xl border-slate-200 bg-white p-5">
                  <item.icon className="mb-3 h-5 w-5 text-primary" />
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-black">{item.value}</p>
                </Card>
              ))}
            </section>
            <Card className="rounded-2xl border-slate-200 bg-white p-6">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-bold">Attributed orders</h2>
                  <p className="text-xs text-slate-500">No buyer names, addresses, phone numbers or payment details are shown.</p>
                </div>
                <Button variant="outline" onClick={exportStatement}><Download className="mr-2 h-4 w-4" /> Export statement CSV</Button>
              </div>
              <AttributedOrdersTable orders={data?.attributedOrders || []} rate={data?.stats.commissionRate || 0} />
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Per-order commission amounts are estimates using your current standard rate. This release does not yet expose a commission ledger with historical rule snapshots, refunds/reversals or dispute resolution.
              </p>
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl border-slate-200 bg-white p-6">
                <h2 className="mb-2 text-lg font-bold">Request a payout</h2>
                <p className="mb-5 text-sm text-slate-500">Minimum request: KSh 1,000. Requests are reviewed and paid manually; this is not an automatic transfer.</p>
                <form onSubmit={requestPayout} className="space-y-4">
                  <label className="block space-y-2 text-sm font-semibold">
                    Payout method
                    <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="M-Pesa">M-Pesa</option>
                      <option value="Bank">Bank transfer</option>
                    </select>
                  </label>
                  <label className="block space-y-2 text-sm font-semibold">
                    {paymentMethod === 'M-Pesa' ? 'M-Pesa number' : 'Bank account details'}
                    <Input required maxLength={200} value={paymentDetails} onChange={event => setPaymentDetails(event.target.value)} />
                  </label>
                  <label className="block space-y-2 text-sm font-semibold">
                    Amount (KSh)
                    <Input required min={1000} max={data?.stats.available ?? 0} step="1" type="number" value={amount} onChange={event => setAmount(event.target.value)} />
                  </label>
                  <Button type="submit" disabled={submitting || !data || Number(amount) < 1000 || Number(amount) > data.stats.available} className="w-full">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                    Submit payout request
                  </Button>
                </form>
              </Card>
              <Card className="rounded-2xl border-slate-200 bg-white p-6">
                <h2 className="mb-4 text-lg font-bold">Payout request history</h2>
                {!data?.payouts.length ? (
                  <p className="text-sm text-slate-500">You have not requested a payout yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[460px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-400">
                        <tr><th className="pb-3">Requested</th><th className="pb-3">Method</th><th className="pb-3">Amount</th><th className="pb-3">Status</th><th className="pb-3">Receipt</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.payouts.map(payout => (
                          <tr key={payout.id}>
                            <td className="py-3">{new Date(payout.created_at).toLocaleDateString()}</td>
                            <td className="py-3">{payout.payment_method}</td>
                            <td className="py-3 font-semibold">{formatPrice(payout.amount)}</td>
                            <td className="py-3">{payout.status}</td>
                            <td className="py-3">{payout.mpesa_receipt || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'academy' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="space-y-4 rounded-2xl border-slate-200 bg-white p-6">
              <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">Affiliate quick start</h2></div>
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-600">
                <li>Choose live, in-stock products that genuinely suit your audience.</li>
                <li>Create a product or category link and share the complete URL without removing the referral code.</li>
                <li>Use your own campaign notes to compare content; current platform statistics remain aggregated by referral code.</li>
                <li>Review attributed order and payout statuses before planning around commissions.</li>
              </ol>
              <Link href="/affiliate/agreement" className="inline-flex items-center text-sm font-semibold text-primary underline underline-offset-2">
                Read affiliate agreement <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Card>
            <Card className="space-y-4 rounded-2xl border-slate-200 bg-white p-6">
              <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /><h2 className="text-lg font-bold">Responsible promotion</h2></div>
              <ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-slate-600">
                <li>Clearly disclose when a post contains an affiliate link or paid promotion.</li>
                <li>Follow applicable age restrictions, advertising rules and alcohol marketing requirements. Never target underage people or encourage unsafe drinking.</li>
                <li>Use accurate product descriptions and current prices; availability and price may change.</li>
                <li>Do not promise earnings, make unverified health claims or misrepresent the offer.</li>
              </ul>
              <p className="text-xs leading-5 text-slate-500">Campaign challenges, bonuses and approved creative packs will appear here once the program publishes them.</p>
            </Card>
          </div>
        )}

        {activeTab === 'support' && (
          <Card className="mx-auto max-w-2xl space-y-4 rounded-2xl border-slate-200 bg-white p-7">
            <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Affiliate support</h2></div>
            <p className="text-sm leading-6 text-slate-600">
              Contact Online Bar about application access, an attributed order or a payout request. Include the order or payout reference only; do not send passwords or full payment credentials.
            </p>
            <Link href="/contact">
              <Button><Mail className="mr-2 h-4 w-4" /> Contact support</Button>
            </Link>
            <p className="text-xs text-slate-500">
              Include your affiliate referral code ({data?.referralCode}) in your message so the team can find your account.
            </p>
          </Card>
        )}

        <footer className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row">
          <span>Affiliate metrics reflect verified platform records and the current reporting period: all-time totals.</span>
          <button type="button" className="inline-flex items-center gap-2 text-left font-semibold text-primary" onClick={exportStatement}>
            <ArrowDownToLine className="h-4 w-4" /> Download earnings statement
          </button>
        </footer>
      </div>
    </main>
  );
}

function AttributedOrdersTable({ orders, rate }: { orders: AttributedOrder[]; rate: number }) {
  if (!orders.length) return <p className="py-4 text-sm text-slate-500">No attributed orders have been recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-400">
          <tr><th className="pb-3">Order</th><th className="pb-3">Date</th><th className="pb-3">Qualifying sales</th><th className="pb-3">Commission estimate</th><th className="pb-3">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map(order => {
            const commission = estimateOrderCommission(order, rate);
            return (
              <tr key={order.id}>
                <td className="py-3 font-mono">#{order.id}</td>
                <td className="py-3">{new Date(order.createdAt).toLocaleDateString()}</td>
                <td className="py-3">{formatPrice(order.total)}</td>
                <td className="py-3">{commission.amount === null ? '-' : `${commission.label}: ${formatPrice(commission.amount)}`}</td>
                <td className="py-3">{order.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return <Clock3 className={className} />;
}
