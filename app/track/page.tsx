'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Package, Truck, CheckCircle, Clock, AlertCircle, MapPin, Navigation, ShieldCheck, MessageSquare, Cookie, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { formatPrice, cn, normalizeImage } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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

  const searchParams = useSearchParams();
  const router = useRouter();
  const { settings } = useSettings();
  const { addToCart } = useCart();

  // Load Quick Snacks
  useEffect(() => {
      async function fetchSnacks() {
          if (!supabase) return;
          const { data } = await supabase
            .from('products')
            .select('id, name, price, image_url, category')
            .eq('is_snack', true)
            .gt('stock', 0)
            .limit(3);
          if (data) setSnacks(data);
      }
      fetchSnacks();
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
        cache: 'no-store'
      });
      const result = await response.json() as {
        order?: OrderDetails;
        token?: string;
        error?: string;
      };
      if (!response.ok || !result.order || !result.token) {
        throw new Error(result.error || 'Order or contact details did not match.');
      }
      setOrder(result.order);
      setTrackingToken(result.token);
    } catch (err) {
      console.error('Track Error:', err);
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
        cache: 'no-store'
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

  // Deep links prefill the order ID; a signed-in customer can verify with their profile phone.
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

  // Refresh only the explicitly verified order; never subscribe to unrestricted order-row payloads.
  useEffect(() => {
    if (!trackingToken) return;
    const interval = window.setInterval(() => void refreshTracking(trackingToken), 30_000);
    return () => window.clearInterval(interval);
  }, [trackingToken, refreshTracking]);

  const getStatusIndex = (status: string) => {
    const idx = STEPS.findIndex(s => s.id.toLowerCase() === status.toLowerCase());
    return idx === -1 ? 0 : idx;
  };

  const currentIndex = order ? getStatusIndex(order.status) : -1;

  const handleWhatsAppDispatch = () => {
      if (!order) return;
      const message = `Hello Online Bar! I am tracking Order #${order.id} and it says it's Out for Delivery. What is the ETA?`;
      window.open(`https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-white py-16 px-4 sm:px-6 lg:px-8 text-left">
      <div className="max-w-4xl mx-auto pt-10">

        <div className="mb-12">
            <h1 className="text-5xl font-black tracking-tighter text-foreground uppercase mb-4">Track Delivery</h1>
            <p className="text-slate-500 font-medium text-lg italic">Real-time visibility into your beverage dispatch.</p>
        </div>

        <Card className="rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 mb-12 overflow-hidden bg-white">
            <CardContent className="p-8 sm:p-14 bg-slate-50/30">
                <form onSubmit={(e) => { e.preventDefault(); void fetchOrder(orderId, customerPhone); }} className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                        <div className="relative flex-1">
                            <Input
                                value={orderId}
                                onChange={(e) => setOrderId(e.target.value)}
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="Order number"
                                aria-label="Order number"
                                className="h-16 rounded-2xl border-slate-200 bg-white pl-14 text-base font-black shadow-inner focus:ring-primary focus:border-primary"
                            />
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        </div>
                        <Input
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            type="tel"
                            autoComplete="tel"
                            placeholder="Phone used at checkout"
                            aria-label="Phone number used at checkout"
                            className="h-16 rounded-2xl border-slate-200 bg-white px-5 text-base font-bold shadow-inner focus:ring-primary focus:border-primary"
                        />
                        <Button type="submit" disabled={loading || !orderId.trim() || !customerPhone.trim()} className="h-16 px-8 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 shrink-0">
                            {loading ? <Loader2 className="animate-spin" /> : 'Locate Order'}
                        </Button>
                    </div>
                    <p className="text-xs font-medium text-slate-500">For your privacy, confirm both the order number and the phone number used at checkout.</p>
                    {error && (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center gap-3 animate-in slide-in-from-top-2">
                            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
                            <p className="text-rose-600 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                                {error}
                            </p>
                        </div>
                    )}
                </form>
            </CardContent>
        </Card>

        {/* MUNCHIE NODE: QUICK SNACK INTEGRATION */}
        {!order && snacks.length > 0 && (
            <section className="mb-20 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Cookie size={20} /></div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Munchie Node</h3>
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">Forgot the bites? Fuel your mission.</p>
                        </div>
                    </div>
                    <Link href="/shop/snacks" className="group flex items-center gap-2 text-[9px] font-black uppercase text-slate-400 hover:text-primary transition-colors">
                        All Snacks <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {snacks.map((s) => (
                        <Card key={s.id} className="p-4 rounded-[2rem] bg-white border border-slate-100 shadow-sm hover:shadow-xl transition-all group/item overflow-hidden relative">
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="h-16 w-16 rounded-2xl bg-slate-50 relative overflow-hidden shrink-0 border border-slate-50">
                                    <Image src={normalizeImage(s.image_url)} alt={s.name} fill className="object-contain p-2 group-hover/item:scale-110 transition-transform" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black text-foreground uppercase truncate tracking-tight">{s.name}</p>
                                    <p className="text-xs font-black text-primary mt-0.5">{formatPrice(s.price)}</p>
                                    <Button
                                        onClick={() => addToCart({
                                            id: s.id,
                                            name: s.name,
                                            price: s.price,
                                            base_price: s.price,
                                            quantity: 1,
                                            category: s.category,
                                            image: normalizeImage(s.image_url)
                                        })}
                                        className="h-8 px-4 rounded-lg bg-primary text-white font-black uppercase text-[8px] tracking-widest mt-2 shadow-lg shadow-primary/10 active:scale-90 transition-all"
                                    >
                                        Add to Bag
                                    </Button>
                                </div>
                            </div>
                            <Zap className="absolute -bottom-4 -left-4 h-12 w-12 text-primary/5 rotate-45 -z-0" />
                        </Card>
                    ))}
                </div>
            </section>
        )}

        {order ? (
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl overflow-hidden mb-12">
                    <div className="p-8 sm:p-12 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-2 block">Real-time Pipeline Active</span>
                            <h2 className="text-4xl font-black text-foreground uppercase tracking-tighter">Order #{order.id}</h2>
                        </div>
                        <div className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg ${
                            order.status === 'Delivered' ? 'bg-emerald-500 text-white' :
                            order.status === 'Dispatched' ? 'bg-primary text-white shadow-primary/20' :
                            'bg-amber-500 text-white'
                        }`}>
                            {order.status}
                        </div>
                    </div>

                    <div className="p-8 sm:p-12">
                        {/* High-End Progress Visual */}
                        <div className="relative mb-12 sm:mb-20">
                            {/* Desktop Horizontal Line */}
                            <div className="hidden sm:block absolute top-6 left-0 right-0 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-1000 ease-out"
                                    style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
                                ></div>
                            </div>

                            {/* Mobile Vertical Line */}
                            <div className="sm:hidden absolute left-6 top-0 bottom-0 w-1 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="w-full bg-primary transition-all duration-1000 ease-out origin-top"
                                    style={{ height: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
                                ></div>
                            </div>

                            <div className="relative flex flex-col sm:flex-row justify-between gap-8 sm:gap-0">
                                {STEPS.map((step, idx) => (
                                    <div key={step.id} className="flex sm:flex-col items-center gap-6 sm:gap-0">
                                        <div className={cn(
                                            "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center border-4 transition-all duration-700 z-10 shrink-0",
                                            currentIndex >= idx
                                                ? "bg-white border-primary text-primary shadow-xl scale-110"
                                                : "bg-white border-slate-100 text-slate-200"
                                        )}>
                                            <step.icon className={cn("h-5 w-5 sm:h-6 sm:w-6", currentIndex === idx && "animate-pulse")} />
                                        </div>
                                        <div className="sm:text-center text-left">
                                            <p className={cn(
                                                "sm:mt-5 text-[10px] font-black uppercase tracking-widest sm:max-w-[80px]",
                                                currentIndex >= idx ? "text-foreground" : "text-slate-300"
                                            )}>
                                                {step.label}
                                            </p>
                                            {currentIndex === idx && (
                                                <p className="mt-1 sm:mt-2 text-[8px] font-bold text-primary uppercase tracking-tighter sm:max-w-[100px] animate-in fade-in duration-1000">
                                                    {step.detail}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 pt-8 border-t border-slate-50">
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Recipient</p>
                                <p className="font-bold text-foreground uppercase text-xs">{order.customer_name}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Payment</p>
                                <p className="font-bold text-foreground uppercase text-xs">{order.payment_method}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Total Paid</p>
                                <p className="font-black text-foreground text-lg">{formatPrice(order.total_price)}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Est. Arrival</p>
                                <p className="font-bold text-emerald-600 uppercase text-xs">
                                    {order.status === 'Delivered'
                                        ? 'Arrived'
                                        : order.delivery_eta_minutes != null
                                            ? `${order.delivery_eta_minutes} min`
                                            : 'ETA not available yet'}
                                </p>
                            </div>
                        </div>

                        {/* Contextual Action: WhatsApp Dispatch */}
                        {['Dispatched', 'Picked Up', 'Out for Delivery'].includes(order.status) && (
                            <div className="mt-12 p-8 bg-indigo-50 rounded-3xl border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center text-indigo-600 shadow-sm"><Truck className="h-6 w-6" /></div>
                                    <div>
                                        <p className="font-black text-foreground uppercase text-sm tracking-tight">
                                            {order.rider_name ? `Runner ${order.rider_name} is moving!` : 'Your delivery is moving!'}
                                        </p>
                                        <p className="text-indigo-600 text-[10px] font-bold uppercase">
                                            {order.status === 'Out for Delivery' ? 'Your order is on its way to the delivery address.' : 'Your order is being prepared for the journey.'}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    onClick={handleWhatsAppDispatch}
                                    className="h-12 px-8 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20"
                                >
                                    <MessageSquare className="h-4 w-4 mr-2" /> Message Dispatch
                                </Button>
                            </div>
                        )}

                        {order.status === 'Out for Delivery' && (
                            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                                {order.rider_location ? (
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-start gap-3">
                                            <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                            <div>
                                                <p className="text-xs font-black uppercase tracking-wide text-foreground">Live rider position</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Updated {new Date(order.rider_location.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Position is approximate for privacy.
                                                </p>
                                            </div>
                                        </div>
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${order.rider_location.latitude},${order.rider_location.longitude}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-primary/30 hover:text-primary"
                                        >
                                            <MapPin className="h-4 w-4" /> View approximate location
                                        </a>
                                    </div>
                                ) : (
                                    <p className="text-xs font-semibold text-slate-500">
                                        {order.rider_location_message || 'Live rider location will appear here when a fresh GPS update is available.'}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Digital Warranty Card */}
                        {order.status === 'Delivered' && (
                            <div className="mt-12 p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 text-foreground relative overflow-hidden shadow-xl animate-in zoom-in-95 duration-700">
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                                                <ShieldCheck className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Bar Quality Guarantee</h3>
                                                <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] mt-1.5">Genuine Product Verified</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Serial Key</p>
                                            <p className="text-[10px] font-black text-foreground uppercase">OB-{order.id}-{new Date(order.created_at).getTime().toString().slice(-4)}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                                            <p className="text-sm font-bold text-emerald-600 uppercase flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                Authenticity Verified
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivered On</p>
                                                <p className="text-sm font-bold text-foreground uppercase">
                                                    {new Date(order.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Coverage</p>
                                                <p className="text-sm font-bold text-foreground uppercase">Full Refund/Exchange</p>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="mt-8 text-[10px] text-slate-400 font-medium italic leading-relaxed">
                                        &quot;Genuine spirits guarantee. If your selection is not up to our standard, our team will replace it instantly within 24 hours.&quot;
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* MUNCHIE NODE: RE-SYNC FOR ACTIVE TRACKING */}
                {snacks.length > 0 && (
                    <section className="mb-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="flex items-center gap-3 px-4">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Cookie size={16} /></div>
                            <h3 className="text-lg font-black uppercase tracking-tighter text-foreground leading-none">Add Munchies to your dispatch?</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {snacks.map((s) => (
                                <Card key={s.id} className="p-4 rounded-3xl bg-slate-50 border border-slate-100 shadow-inner group/mini hover:bg-white hover:shadow-xl transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-white relative overflow-hidden shrink-0 shadow-sm">
                                            <Image src={normalizeImage(s.image_url)} alt={s.name} fill className="object-contain p-2" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[9px] font-black text-foreground uppercase truncate">{s.name}</p>
                                            <Button
                                                onClick={() => {
                                                    addToCart({
                                                        id: s.id,
                                                        name: s.name,
                                                        price: s.price,
                                                        base_price: s.price,
                                                        quantity: 1,
                                                        category: s.category,
                                                        image: normalizeImage(s.image_url)
                                                    });
                                                    router.push('/cart');
                                                }}
                                                variant="link"
                                                className="h-auto p-0 text-primary font-black uppercase text-[8px] tracking-widest mt-1 hover:no-underline"
                                            >
                                                Add + Order &rarr;
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}

                <div className="text-center space-y-6">
                    <p className="text-slate-400 text-sm font-medium italic">Online Bar guarantees genuine products and chilled dispatch.</p>
                    <div className="flex justify-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" className="rounded-xl h-12 px-6 font-black uppercase text-[9px] tracking-widest text-slate-400 hover:text-foreground">
                                ← Store Home
                            </Button>
                        </Link>
                        <Link href="/contact">
                            <Button variant="outline" className="rounded-xl h-12 px-8 font-black uppercase text-[9px] tracking-widest border-slate-200 hover:bg-slate-50">
                                Customer Support
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                    { icon: MapPin, text: 'Nairobi Fast Dispatch', color: 'primary' },
                    { icon: ShieldCheck, text: 'Verified Authenticity', color: 'emerald-500' },
                    { icon: Clock, text: 'Live Status Updates', color: 'indigo-500', live: true }
                ].map((feature, i) => (
                    <div
                        key={i}
                        className="group p-8 rounded-3xl border border-slate-100 bg-white text-center space-y-4 hover:shadow-2xl hover:shadow-slate-200 hover:-translate-y-2 hover:border-primary/20 transition-all duration-500 cursor-default relative overflow-hidden"
                    >
                        <div className={cn(
                            "h-14 w-14 mx-auto rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-3",
                            feature.color === 'primary' ? 'bg-primary/10 text-primary' :
                            feature.color === 'emerald-500' ? 'bg-emerald-50 text-emerald-500' :
                            'bg-indigo-50 text-indigo-500'
                        )}>
                            <feature.icon className="h-7 w-7" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-foreground group-hover:text-primary transition-colors">{feature.text}</p>
                            {feature.live && (
                                <div className="flex items-center justify-center gap-1.5 pt-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-[8px] font-black uppercase text-emerald-600 tracking-tighter">Live Monitor</span>
                                </div>
                            )}
                        </div>
                        {/* Subtle background glow on hover */}
                        <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-slate-50 rounded-full blur-3xl group-hover:bg-primary/5 transition-all duration-700"></div>
                    </div>
                ))}
            </div>
        )}

      </div>
    </div>
  );
}

export default function OrderTrackingPage() {
    return (
        <Suspense fallback={<div className="p-24 text-center font-black uppercase text-slate-400 animate-pulse">Syncing Tracking Data...</div>}>
            <TrackingContent />
        </Suspense>
    );
}
