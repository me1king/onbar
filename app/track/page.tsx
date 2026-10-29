'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Package, Truck, CheckCircle, Clock, AlertCircle, Navigation, ShieldCheck, MessageSquare, Cookie, Zap, ArrowRight, Loader2, Phone, MessageCircle } from 'lucide-react';
import { formatPrice, cn, normalizeImage } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSettings } from '@/lib/useSettings';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';

interface OrderDetails {
  id: number;
  status: string;
  customer_name: string;
  total_price: number;
  created_at: string;
  payment_method: string;
  rider_name?: string | null;
  delivery_eta_minutes?: number | null;
  rider_location?: { latitude: number; longitude: number; updatedAt: string } | null;
  rider_location_message?: string | null;
}

interface QuickSnack {
  id: number;
  name: string;
  price: number;
  image_url: string;
  category: string;
}

const STEPS = [
  { id: 'Pending', label: 'Order Received', icon: Clock, detail: 'Securing your beverages in our cellar...' },
  { id: 'Paid', label: 'Payment Verified', icon: ShieldCheck, detail: 'M-Pesa sync complete. Funds verified.' },
  { id: 'Processing', label: 'Chill Check', icon: Package, detail: 'Temperature and quality inspection in progress.' },
  { id: 'Dispatched', label: 'Rider Assigned', icon: Truck, detail: 'Your rider has been assigned.' },
  { id: 'Picked Up', label: 'Picked Up', icon: Package, detail: 'Your order has been collected from the vendor.' },
  { id: 'Out for Delivery', label: 'On the Way', icon: Truck, detail: 'Your rider is heading to your delivery location.' },
  { id: 'Delivered', label: 'Handed Over', icon: CheckCircle, detail: 'Beverages secured. Welcome to the Bar Club.' },
];

function TrackingContent() {
  const [orderId, setOrderId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [trackingToken, setTrackingToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snacks, setSnacks] = useState<QuickSnack[]>([]);
  const [simulatedProgress, setSimulatedProgress] = useState(0);

  const searchParams = useSearchParams();
  const { settings } = useSettings();
  const { addToCart } = useCart();

  useEffect(() => {
    async function fetchSnacks() {
      if (!supabase) return;
      const { data } = await supabase
        .from('products')
        .select('id, name, price, image_url, category')
        .eq('is_snack', true)
        .gt('stock', 0)
        .limit(3);
      if (data) setSnacks(data as QuickSnack[]);
    }
    void fetchSnacks();
  }, []);

  const fetchOrder = useCallback(async (id: string, phone: string) => {
    if (!id.trim() || !phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/delivery/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id.trim(), phone: phone.trim() }),
        cache: 'no-store',
      });
      const result = await response.json() as { order?: OrderDetails; token?: string; error?: string };
      if (!response.ok || !result.order || !result.token) {
        throw new Error(result.error || 'Order or contact details did not match.');
      }
      setOrder(result.order);
      setTrackingToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order tracking could not be loaded.');
      setOrder(null);
      setTrackingToken('');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTracking = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/delivery/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
      const result = await response.json() as { order?: OrderDetails; error?: string };
      if (!response.ok || !result.order) {
        if (response.status === 401) {
          setTrackingToken('');
          setError(result.error || 'Tracking access expired. Verify your order again.');
          setOrder(null);
        }
        return;
      }
      setOrder(result.order);
    } catch (error) {
      console.error('[DeliveryTracking] Live refresh failed:', error);
    }
  }, []);

  useEffect(() => {
    const urlId = searchParams?.get('id');

    async function initialLoad() {
      if (urlId) setOrderId(urlId);
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase.from('profiles')
        .select('phone_number')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profile?.phone_number) {
        setCustomerPhone(profile.phone_number);
        if (urlId) void fetchOrder(urlId, profile.phone_number);
      }
    }

    void initialLoad();
  }, [searchParams, fetchOrder]);

  useEffect(() => {
    if (!trackingToken) return;
    const interval = window.setInterval(() => void refreshTracking(trackingToken), 30_000);
    return () => window.clearInterval(interval);
  }, [trackingToken, refreshTracking]);

  useEffect(() => {
    if (!order || !['Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'].includes(order.status)) {
      setSimulatedProgress(0);
      return;
    }

    if (order.status === 'Delivered') {
      setSimulatedProgress(1);
      return;
    }

    const start = Date.now();
    let rafId = 0;
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const progress = Math.min(0.97, Math.max(0, elapsed / 70));
      setSimulatedProgress(progress);
      if (elapsed < 70 && order.status !== 'Delivered') {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [order]);

  const getStatusIndex = (status: string) => {
    const idx = STEPS.findIndex((step) => step.id.toLowerCase() === status.toLowerCase());
    return idx === -1 ? 0 : idx;
  };

  const currentIndex = order ? getStatusIndex(order.status) : -1;
  const liveEtaSeconds = Math.max(0, Math.ceil((1 - simulatedProgress) * 70));
  const liveEtaLabel = order?.status === 'Delivered' ? 'Delivered' : `${Math.floor(liveEtaSeconds / 60)}:${String(liveEtaSeconds % 60).padStart(2, '0')}`;

  const handleWhatsAppDispatch = () => {
    if (!order) return;
    const message = `Hello Online Bar! I am tracking Order #${order.id} and it says it's Out for Delivery. What is the ETA?`;
    window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-white px-4 py-16 text-left sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl pt-10">
        <div className="mb-12">
          <h1 className="mb-4 text-5xl font-black uppercase tracking-tighter text-foreground">Track Delivery</h1>
          <p className="text-lg font-medium italic text-slate-500">Real-time visibility into your beverage dispatch.</p>
        </div>

        <Card className="mb-12 overflow-hidden rounded-[3rem] border border-slate-100 bg-white shadow-2xl shadow-slate-200/50">
          <CardContent className="bg-slate-50/30 p-8 sm:p-14">
            <form onSubmit={(event) => { event.preventDefault(); void fetchOrder(orderId, customerPhone); }} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div className="relative flex-1">
                  <Input
                    value={orderId}
                    onChange={(event) => setOrderId(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Order number"
                    aria-label="Order number"
                    className="h-16 rounded-2xl border-slate-200 bg-white pl-14 text-base font-black shadow-inner focus:border-primary focus:ring-primary"
                  />
                  <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300" />
                </div>
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  type="tel"
                  autoComplete="tel"
                  placeholder="Phone used at checkout"
                  aria-label="Phone number used at checkout"
                  className="h-16 rounded-2xl border-slate-200 bg-white px-5 text-base font-bold shadow-inner focus:border-primary focus:ring-primary"
                />
                <Button type="submit" disabled={loading || !orderId.trim() || !customerPhone.trim()} className="h-16 shrink-0 rounded-2xl bg-primary px-8 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95">
                  {loading ? <Loader2 className="animate-spin" /> : 'Locate Order'}
                </Button>
              </div>
              <p className="text-xs font-medium text-slate-500">For your privacy, confirm both the order number and the phone number used at checkout.</p>
              {error && (
                <div className="flex items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
                  <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-rose-600">{error}</p>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {!order && snacks.length > 0 && (
          <section className="mb-20 space-y-8">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm"><Cookie size={20} /></div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Munchie Node</h3>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Forgot the bites? Fuel your mission.</p>
                </div>
              </div>
              <Link href="/shop/snacks" className="group flex items-center gap-2 text-[9px] font-black uppercase text-slate-400 transition-colors hover:text-primary">
                All Snacks <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {snacks.map((snack) => (
                <Card key={snack.id} className="group/item relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-xl">
                  <div className="relative z-10 flex items-center gap-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-50 bg-slate-50">
                      <Image src={normalizeImage(snack.image_url)} alt={snack.name} fill className="object-contain p-2 transition-transform group-hover/item:scale-110" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-black uppercase tracking-tight text-foreground">{snack.name}</p>
                      <p className="mt-0.5 text-xs font-black text-primary">{formatPrice(snack.price)}</p>
                      <Button
                        onClick={() => addToCart({ id: snack.id, name: snack.name, price: snack.price, base_price: snack.price, quantity: 1, category: snack.category, image: normalizeImage(snack.image_url) })}
                        className="mt-2 h-8 rounded-lg bg-primary px-4 text-[8px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/10 transition-all active:scale-90"
                      >
                        Add to Bag
                      </Button>
                    </div>
                  </div>
                  <Zap className="-bottom-4 -left-4 absolute h-12 w-12 -rotate-45 text-primary/5" />
                </Card>
              ))}
            </div>
          </section>
        )}

        {order ? (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="mb-12 overflow-hidden rounded-[3.5rem] border border-slate-100 bg-white shadow-2xl">
              <div className="flex flex-col items-start justify-between gap-6 border-b border-slate-50 p-8 sm:flex-row sm:items-center sm:p-12">
                <div>
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.3em] text-primary">Real-time Pipeline Active</span>
                  <h2 className="text-4xl font-black uppercase tracking-tighter text-foreground">Order #{order.id}</h2>
                </div>
                <div className={`rounded-2xl px-6 py-3 text-[11px] font-black uppercase tracking-widest shadow-lg ${order.status === 'Delivered' ? 'bg-emerald-500 text-white' : order.status === 'Dispatched' ? 'bg-primary text-white shadow-primary/20' : 'bg-amber-500 text-white'}`}>
                  {order.status}
                </div>
              </div>

              <div className="p-8 sm:p-12">
                <div className="relative mb-12 sm:mb-20">
                  <div className="absolute left-0 right-0 top-6 hidden h-1.5 rounded-full bg-slate-100 sm:block">
                    <div className="h-full bg-primary transition-all duration-1000 ease-out" style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }} />
                  </div>
                  <div className="sm:hidden absolute bottom-0 left-6 top-0 w-1 rounded-full bg-slate-100">
                    <div className="h-full w-full origin-top bg-primary transition-all duration-1000 ease-out" style={{ height: `${(currentIndex / (STEPS.length - 1)) * 100}%` }} />
                  </div>

                  <div className="relative flex flex-col gap-8 sm:flex-row sm:justify-between sm:gap-0">
                    {STEPS.map((step, idx) => (
                      <div key={step.id} className="flex items-center gap-6 sm:flex-col sm:gap-0">
                        <div className={cn('z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-4 bg-white transition-all duration-700 sm:h-14 sm:w-14', currentIndex >= idx ? 'border-primary text-primary shadow-xl scale-110' : 'border-slate-100 text-slate-200')}>
                          <step.icon className={cn('h-5 w-5 sm:h-6 sm:w-6', currentIndex === idx && 'animate-pulse')} />
                        </div>
                        <div className="text-left sm:text-center">
                          <p className={cn('sm:mt-5 text-[10px] font-black uppercase tracking-widest sm:max-w-[80px]', currentIndex >= idx ? 'text-foreground' : 'text-slate-300')}>
                            {step.label}
                          </p>
                          {currentIndex === idx && (
                            <p className="mt-1 text-[8px] font-bold uppercase tracking-tighter text-primary sm:mt-2 sm:max-w-[100px]">
                              {step.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-10 border-t border-slate-50 pt-8 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Recipient</p>
                    <p className="text-xs font-bold uppercase text-foreground">{order.customer_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Payment</p>
                    <p className="text-xs font-bold uppercase text-foreground">{order.payment_method}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Total Paid</p>
                    <p className="text-lg font-black text-foreground">{formatPrice(order.total_price)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Est. Arrival</p>
                    <p className="text-xs font-bold uppercase text-emerald-600">
                      {order.status === 'Delivered' ? 'Arrived' : order.delivery_eta_minutes != null ? `${order.delivery_eta_minutes} min` : 'ETA not available yet'}
                    </p>
                  </div>
                </div>

                {['Dispatched', 'Picked Up', 'Out for Delivery'].includes(order.status) && (
                  <div className="mt-12 flex flex-col items-center justify-between gap-6 rounded-3xl border border-indigo-100 bg-indigo-50 p-8 md:flex-row">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm"><Truck className="h-6 w-6" /></div>
                      <div>
                        <p className="text-sm font-black uppercase tracking-tight text-foreground">
                          {order.rider_name ? `Runner ${order.rider_name} is moving!` : 'Your delivery is moving!'}
                        </p>
                        <p className="text-[10px] font-bold uppercase text-indigo-600">
                          {order.status === 'Out for Delivery' ? 'Your order is on its way to the delivery address.' : 'Your order is being prepared for the journey.'}
                        </p>
                      </div>
                    </div>
                    <Button onClick={handleWhatsAppDispatch} className="h-12 rounded-xl bg-primary px-8 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 hover:bg-primary/90">
                      <MessageSquare className="mr-2 h-4 w-4" /> Message Dispatch
                    </Button>
                  </div>
                )}

                {order.status === 'Out for Delivery' && (
                  <div className="mt-4 rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.9)]">
                    <div className="relative mb-5 h-[280px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.25),transparent_22%),linear-gradient(135deg,#0b1323_0%,#11233d_35%,#162a3f_100%)]">
                      <div className="absolute inset-0 opacity-30" aria-hidden="true">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:38px_38px]" />
                      </div>
                      <div className="absolute inset-y-0 left-[18%] w-1 bg-white/5" />
                      <div className="absolute inset-x-0 top-[26%] h-1 bg-white/5" />

                      <svg viewBox="0 0 320 280" className="absolute inset-0 h-full w-full" aria-label="Simulated rider route">
                        <path d="M18 200 L90 200 L120 165 L180 165 L210 120 L260 120 L290 90" fill="none" stroke="rgba(45,212,191,0.9)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 12px rgba(45,212,191,0.9))' }} />
                        <path d="M18 200 L90 200 L120 165 L180 165 L210 120 L260 120 L290 90" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>

                      <div className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] transition-all duration-500" style={{ left: `${18 + simulatedProgress * 72}%`, top: `${58 - simulatedProgress * 34}%` }} />
                      <div className="absolute left-[62%] top-[48%] rounded-full border border-emerald-300/50 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200">Rider moving</div>
                    </div>

                    <div className="flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Arriving</p>
                        <p className="mt-2 text-3xl font-black uppercase tracking-tighter text-white">{liveEtaLabel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm transition hover:scale-105" aria-label="Call rider"><Phone className="h-4 w-4" /></button>
                        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow-sm transition hover:scale-105" aria-label="Chat with rider"><MessageCircle className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-sm font-black text-slate-900">BK</div>
                          <div>
                            <p className="text-base font-black uppercase tracking-tight text-white">Brian K. · 4.9 ★</p>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">Honda CB · KMGB 214X</p>
                          </div>
                        </div>
                        <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-200">On route</div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                          <span>PIN</span>
                          <span>{simulatedProgress > 0.72 ? 'Visible now' : 'Hidden until close'}</span>
                        </div>
                        <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-center text-4xl font-black tracking-[0.35em] text-emerald-300">
                          {simulatedProgress > 0.72 ? '4827' : '••••'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-foreground">Live rider position</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {order.rider_location
                                ? `Updated ${new Date(order.rider_location.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Position is approximate for privacy.`
                                : 'Location is temporarily unavailable; the route is in fallback mode.'}
                            </p>
                          </div>
                        </div>
                        {order.rider_location && (
                          <a href={`https://www.google.com/maps/search/?api=1&query=${order.rider_location.latitude},${order.rider_location.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-primary hover:text-primary/80">
                            Open map <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {order.status === 'Delivered' && (
                  <div className="mt-4 rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.9)]">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Delivery</p>
                        <h3 className="mt-2 text-3xl font-black uppercase tracking-tighter text-white">Delivered</h3>
                      </div>
                      <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-200">Thanks for ordering</div>
                    </div>
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                        <span>Order confirmed</span>
                        <span>Shop prepared</span>
                      </div>
                      <div className="mt-4 flex items-center gap-3 text-sm text-slate-200">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        This order is complete and safely dropped off.
                      </div>
                    </div>
                  </div>
                )}

                {order.status !== 'Out for Delivery' && order.status !== 'Delivered' && (
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <div className="flex items-start gap-3">
                      <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-foreground">Dispatcher updates</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.rider_name ? `${order.rider_name} is on the way and will update when they are close.` : 'A rider is being assigned and will update location as soon as they are moving.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {order.status === 'Out for Delivery' && (
                  <div className="mt-8 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Order status</p>
                      <p className="mt-2 text-lg font-black uppercase tracking-tight text-foreground">{order.status}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">ETA</p>
                      <p className="mt-2 text-lg font-black uppercase tracking-tight text-primary">{liveEtaLabel}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Address share</p>
                      <p className="mt-2 text-sm font-black uppercase tracking-tight text-foreground">Masked until rider arrives</p>
                    </div>
                  </div>
                )}

                {order.status === 'Out for Delivery' && (
                  <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Rider card</p>
                        <h3 className="mt-2 text-xl font-black uppercase tracking-tighter text-foreground">Your rider</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-primary hover:text-primary" aria-label="Call rider"><Phone className="h-4 w-4" /></button>
                        <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-primary hover:text-primary" aria-label="Chat with rider"><MessageSquare className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-slate-900">BK</div>
                      <div>
                        <p className="text-xl font-black uppercase tracking-tight text-foreground">Brian K. · 4.9 ★</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Honda CB · KMGB 214X</p>
                        <p className="mt-2 text-xs font-medium text-slate-600">Dispatching from the merchant. He will confirm a quick ID check when you receive the order.</p>
                      </div>
                    </div>
                  </div>
                )}

                {order.status === 'Delivered' && (
                  <div className="mt-12 rounded-[2.5rem] border border-slate-100 bg-slate-50 p-8 text-foreground shadow-xl">
                    <div className="relative z-10">
                      <div className="mb-8 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-lg shadow-primary/10"><ShieldCheck className="h-6 w-6" /></div>
                          <div>
                            <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Bar Quality Guarantee</h3>
                            <p className="mt-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-primary">Genuine Product Verified</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Serial Key</p>
                          <p className="text-[10px] font-black uppercase text-foreground">OB-{order.id}-{new Date(order.created_at).getTime().toString().slice(-4)}</p>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                          <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Status</p>
                          <p className="flex items-center gap-2 text-sm font-bold uppercase text-emerald-600">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                            Authenticity Verified
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Delivered On</p>
                            <p className="text-sm font-bold uppercase text-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                            <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Coverage</p>
                            <p className="text-sm font-bold uppercase text-foreground">Full Refund/Exchange</p>
                          </div>
                        </div>
                      </div>

                      <p className="mt-8 text-[10px] font-medium italic leading-relaxed text-slate-400">&quot;Genuine spirits guarantee. If your selection is not up to our standard, our team will replace it instantly within 24 hours.&quot;</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {snacks.length > 0 && (
              <section className="mb-12 space-y-6">
                <div className="flex items-center gap-3 px-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-sm"><Cookie size={16} /></div>
                  <h3 className="text-lg font-black uppercase tracking-tighter text-foreground leading-none">Add Munchies to your dispatch?</h3>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {snacks.map((snack) => (
                    <Card key={snack.id} className="rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-slate-50 bg-slate-50">
                          <Image src={normalizeImage(snack.image_url)} alt={snack.name} fill className="object-contain p-2" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[10px] font-black uppercase tracking-tight text-foreground">{snack.name}</p>
                          <p className="mt-1 text-xs font-black text-primary">{formatPrice(snack.price)}</p>
                          <Button onClick={() => addToCart({ id: snack.id, name: snack.name, price: snack.price, base_price: snack.price, quantity: 1, category: snack.category, image: normalizeImage(snack.image_url) })} className="mt-2 h-8 rounded-lg bg-primary px-4 text-[8px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/10 active:scale-90">
                            Add to Bag
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white p-8 text-center text-sm font-black uppercase tracking-[0.2em] text-slate-500">Loading tracking...</div>}>
      <TrackingContent />
    </Suspense>
  );
}
