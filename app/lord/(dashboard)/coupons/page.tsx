'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Tag,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Ticket
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Coupon {
  id: number;
  code: string;
  discount_percent: number;
  is_active: boolean;
  created_at: string;
}

interface ProductPriceOption {
  id: number;
  name: string;
  price: number;
  cost_price: number | null;
}

interface RewardOption {
  label: string;
  chance: number;
  value: number;
  type: 'xp' | 'voucher' | 'perk' | 'mystery';
}

interface RewardConfig {
  points_per_ksh: number;
  spin_probabilities: RewardOption[];
  crate_probabilities: RewardOption[];
}

const initialForm = {
  code: '',
  discount_percent: '',
  is_active: true
};

const defaultRewardConfig: RewardConfig = {
  points_per_ksh: 10,
  spin_probabilities: [
    { label: '10 Points', chance: 50, value: 10, type: 'xp' },
    { label: '100 Points', chance: 25, value: 100, type: 'xp' },
    { label: 'Free Delivery', chance: 15, value: 0, type: 'perk' },
    { label: 'KSh 500 Voucher', chance: 5, value: 500, type: 'voucher' },
    { label: 'Mystery Prize', chance: 5, value: 0, type: 'mystery' }
  ],
  crate_probabilities: [
    { label: '50 Points', chance: 40, value: 50, type: 'xp' },
    { label: '100 Points', chance: 30, value: 100, type: 'xp' },
    { label: 'KSh 100 Coupon', chance: 20, value: 100, type: 'voucher' },
    { label: 'Free Delivery', chance: 10, value: 0, type: 'perk' }
  ]
};

const giftOptions = [
  { name: 'Mini tasting flight', cost: 180, note: 'Best for new customer wins' },
  { name: 'Branded coaster pack', cost: 120, note: 'Low-cost add-on for larger orders' },
  { name: 'Bottle opener set', cost: 240, note: 'Good upsell for gifting bundles' },
  { name: 'Complimentary dessert bite', cost: 90, note: 'Raises perceived value without killing margin' }
];

export default function AdminCouponsPage() {
  // const { email: adminEmail } = useAdmin();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [rewardConfig, setRewardConfig] = useState<RewardConfig>(defaultRewardConfig);
  const [rewardConfigError, setRewardConfigError] = useState<string | null>(null);
  const [rewardGame, setRewardGame] = useState<'spin_probabilities' | 'crate_probabilities'>('spin_probabilities');
  const [playsPerOrder, setPlaysPerOrder] = useState('1');
  const [perkCost, setPerkCost] = useState('0');
  const [mysteryCost, setMysteryCost] = useState('0');
  const [products, setProducts] = useState<ProductPriceOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [basePrice, setBasePrice] = useState('1500');
  const [costPrice, setCostPrice] = useState('900');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const rawDiscount = Number(form.discount_percent || 0);
  const offerDiscount = Number.isFinite(rawDiscount) ? Math.max(0, Math.min(rawDiscount, 100)) : 0;
  const baseAmount = Number.isFinite(Number(basePrice)) ? Math.max(0, Number(basePrice)) : 0;
  const costAmount = Number.isFinite(Number(costPrice)) ? Math.max(0, Number(costPrice)) : 0;
  const discountedPrice = baseAmount * (1 - offerDiscount / 100);
  const grossProfit = baseAmount - costAmount;
  const discountedProfit = discountedPrice - costAmount;
  const marginAfterDiscount = discountedPrice > 0 ? (discountedProfit / discountedPrice) * 100 : 0;
  const profitDelta = grossProfit - discountedProfit;
  const selectedRewards = rewardConfig[rewardGame];
  const parsedPlaysPerOrder = Number(playsPerOrder);
  const normalizedPlaysPerOrder = Number.isFinite(parsedPlaysPerOrder) ? Math.max(0, parsedPlaysPerOrder) : 0;
  const parsedPerkCost = Number(perkCost);
  const assumedPerkCost = Number.isFinite(parsedPerkCost) ? Math.max(0, parsedPerkCost) : 0;
  const parsedMysteryCost = Number(mysteryCost);
  const assumedMysteryCost = Number.isFinite(parsedMysteryCost) ? Math.max(0, parsedMysteryCost) : 0;
  const estimatedRewardCost = selectedRewards.reduce((total, reward) => {
    const rewardCost = reward.type === 'voucher'
      ? reward.value
      : reward.type === 'xp'
        ? reward.value / Math.max(1, rewardConfig.points_per_ksh)
        : reward.type === 'perk'
          ? assumedPerkCost
          : assumedMysteryCost;
    return total + (reward.chance / 100) * rewardCost;
  }, 0);
  const expectedGameCostPerOrder = estimatedRewardCost * normalizedPlaysPerOrder;
  const profitAfterGame = discountedProfit - expectedGameCostPerOrder;
  const marginAfterGame = discountedPrice > 0 ? (profitAfterGame / discountedPrice) * 100 : 0;
  const hasUnpricedRewards = selectedRewards.some(reward => reward.type === 'perk' || reward.type === 'mystery');

  const fetchCoupons = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCoupons(data || []);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Voucher Vault Sync Failure:", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchProducts() {
      if (!supabase) {
        setProductLoadError('Product pricing is not configured. Enter the example price and cost manually.');
        return;
      }
      const { data, error } = await supabase
        .from('products')
        .select('id,name,price,cost_price')
        .eq('status', 'Live')
        .order('name');
      if (error) {
        console.error('[AdminCoupons] Could not load product pricing:', error);
        if (!cancelled) setProductLoadError('Saved product prices and costs could not be loaded. You can still enter them manually.');
        return;
      }
      if (!cancelled) {
        setProducts((data || []).map(product => ({
          id: Number(product.id),
          name: String(product.name),
          price: Number(product.price) || 0,
          cost_price: product.cost_price === null ? null : Number(product.cost_price)
        })));
      }
    }
    void fetchProducts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchRewardConfig() {
      try {
        const response = await fetch('/api/admin/gamification', { cache: 'no-store' });
        const result = await response.json() as {
          config?: {
            points?: { points_per_ksh?: number };
            rewards?: { spin_probabilities?: RewardOption[]; crate_probabilities?: RewardOption[] };
          };
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || 'Could not load game reward configuration.');
        const pointsPerKsh = Number(result.config?.points?.points_per_ksh);
        const spinRewards = result.config?.rewards?.spin_probabilities;
        const crateRewards = result.config?.rewards?.crate_probabilities;
        const validRewards = (rewards: unknown): rewards is RewardOption[] => Array.isArray(rewards)
          && rewards.every(reward => typeof reward === 'object' && reward !== null
            && typeof reward.label === 'string'
            && Number.isFinite(reward.chance) && reward.chance >= 0 && reward.chance <= 100
            && Number.isFinite(reward.value) && reward.value >= 0
            && ['xp', 'voucher', 'perk', 'mystery'].includes(reward.type));
        if (!validRewards(spinRewards) || !validRewards(crateRewards)
          || Math.abs(spinRewards.reduce((total, reward) => total + reward.chance, 0) - 100) >= 0.001
          || Math.abs(crateRewards.reduce((total, reward) => total + reward.chance, 0) - 100) >= 0.001) {
          throw new Error('Game reward probabilities are missing or invalid.');
        }
        if (!cancelled) {
          setRewardConfig({
            points_per_ksh: Number.isFinite(pointsPerKsh) && pointsPerKsh > 0 ? pointsPerKsh : defaultRewardConfig.points_per_ksh,
            spin_probabilities: spinRewards,
            crate_probabilities: crateRewards
          });
          setRewardConfigError(null);
        }
      } catch (error) {
        if (!cancelled) setRewardConfigError(error instanceof Error ? error.message : 'Could not load game reward configuration.');
      }
    }
    void fetchRewardConfig();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !form.code || !form.discount_percent) return;
    const discount = Number(form.discount_percent);
    if (!Number.isInteger(discount) || discount < 1 || discount > 100) {
      setMessage({ type: 'error', text: 'Coupon discount must be a whole percentage between 1 and 100.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('coupons')
        .insert([{
            code: form.code.trim().toUpperCase(),
            discount_percent: discount,
            is_active: form.is_active
        }])
        .select()
        .single();

      if (error) throw error;

      // await logAuditAction(adminEmail, 'CREATE_COUPON', { code: form.code });
      setMessage({ type: 'success', text: `Coupon ${form.code} created!` });
      setForm(initialForm);
      fetchCoupons();
    } catch (err: unknown) {
      const error = err as Error;
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (id: number, currentStatus: boolean) => {
      if (!supabase) return;
      try {
          const { error } = await supabase.from('coupons').update({ is_active: !currentStatus }).eq('id', id);
          if (error) throw error;
          setCoupons(coupons.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
      } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error("Voucher Status Toggle Failure:", errorMsg);
      }
  };

  const deleteCoupon = async (id: number, code: string) => {
      if (!supabase || !confirm(`Delete coupon ${code}?`)) return;
      try {
          const { error } = await supabase.from('coupons').delete().eq('id', id);
          if (error) throw error;
          // await logAuditAction(adminEmail, 'DELETE_COUPON', { code });
          setCoupons(coupons.filter(c => c.id !== id));
      } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error("Voucher Decommission Failure:", errorMsg);
      }
  };

  return (
    <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left pb-40">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter text-left">Gift & Coupons</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Generate discount codes to drive sales and reward loyal customers.</p>
        </div>
        <Button onClick={fetchCoupons} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest transition-all">
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </header>

      <div className="grid lg:grid-cols-3 gap-12">

          <div className="lg:col-span-1">
              <Card className="rounded-[3rem] border border-slate-100 shadow-sm p-10 bg-white space-y-10">
                  <h2 className="text-xl font-black text-foreground uppercase flex items-center gap-4">
                      <Plus className="h-5 w-5 text-primary" /> New Coupon
                  </h2>
                  <form onSubmit={handleSubmit} className="space-y-6 text-left">
                      <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Coupon Code</label>
                          <Input
                            value={form.code}
                            onChange={e => setForm({...form, code: e.target.value})}
                            placeholder="e.g. WELCOME10"
                            className="rounded-2xl h-14 bg-slate-50 border-slate-100 font-black uppercase"
                            required
                          />
                      </div>
                      <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Discount Percentage (%)</label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={form.discount_percent}
                            onChange={e => setForm({...form, discount_percent: e.target.value})}
                            placeholder="10"
                            className="rounded-2xl h-14 bg-slate-50 border-slate-100 font-bold"
                            required
                          />
                      </div>
                      <div className="space-y-2">
                          <label htmlFor="pricing-product" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Use saved product pricing</label>
                          <select
                            id="pricing-product"
                            value={selectedProduct}
                            onChange={event => {
                              const product = products.find(item => String(item.id) === event.target.value);
                              setSelectedProduct(event.target.value);
                              if (product) {
                                setBasePrice(String(product.price));
                                setCostPrice(String(product.cost_price ?? 0));
                              }
                            }}
                            className="h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold text-slate-800"
                          >
                              <option value="">Manual / example values</option>
                              {products.map(product => <option key={product.id} value={product.id}>{product.name} — KES {product.price.toLocaleString()}</option>)}
                          </select>
                          {productLoadError && <p className="text-[10px] font-semibold text-amber-700">{productLoadError}</p>}
                          {selectedProduct && products.find(product => String(product.id) === selectedProduct)?.cost_price == null
                            && <p className="text-[10px] font-semibold text-amber-700">This product has no saved cost price; enter its real cost below for an accurate profit estimate.</p>}
                      </div>
                      <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Base Selling Price (KES)</label>
                          <Input
                            type="number"
                            min="0"
                            value={basePrice}
                            onChange={e => setBasePrice(e.target.value)}
                            placeholder="1500"
                            className="rounded-2xl h-14 bg-slate-50 border-slate-100 font-bold"
                          />
                      </div>
                      <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Cost of Goods (KES)</label>
                          <Input
                            type="number"
                            min="0"
                            value={costPrice}
                            onChange={e => setCostPrice(e.target.value)}
                            placeholder="900"
                            className="rounded-2xl h-14 bg-slate-50 border-slate-100 font-bold"
                          />
                      </div>
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <input
                            type="checkbox"
                            id="is_active"
                            checked={form.is_active}
                            onChange={e => setForm({...form, is_active: e.target.checked})}
                            className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <label htmlFor="is_active" className="text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer text-left">Enable Immediately</label>
                      </div>
                      <Button type="submit" disabled={isSubmitting} className="w-full h-16 rounded-[1.5rem] bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-primary/20 mt-4 transition-all hover:scale-105 active:scale-95">
                          {isSubmitting ? 'Generating...' : 'Create Coupon'}
                      </Button>
                  </form>
                  <div className="mt-8 rounded-[2rem] border border-slate-100 bg-slate-50 p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Discount impact</h3>
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-primary">Live</span>
                      </div>
                      <p className="mb-4 text-[10px] leading-5 text-slate-500">Uses product cost of goods only; delivery, payment fees, taxes, and overhead are not included.</p>
                      <div className="grid grid-cols-2 gap-3 text-left">
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">New price</p>
                              <p className="mt-2 text-xl font-black text-slate-900">KES {discountedPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Net margin</p>
                              <p className={cn("mt-2 text-xl font-black", marginAfterDiscount < 18 ? 'text-rose-600' : 'text-slate-900')}>{marginAfterDiscount.toFixed(1)}%</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Profit loss</p>
                              <p className="mt-2 text-xl font-black text-rose-500">KES {profitDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Sell at</p>
                              <p className="mt-2 text-xl font-black text-emerald-600">{offerDiscount || 0}% off</p>
                          </div>
                      </div>
                  </div>
                  {message && (
                      <p className={cn("text-center mt-6 text-[10px] font-black uppercase", message.type === 'success' ? 'text-primary' : 'text-primary')}>{message.text}</p>
                  )}
              </Card>
          </div>

          {/* List Section */}
          <div className="lg:col-span-2 space-y-8">
              <div className="rounded-[3rem] border border-slate-100 bg-white p-8 shadow-sm">
                  <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Special offers</p>
                          <h2 className="mt-2 text-2xl font-black uppercase tracking-tighter text-foreground">Gift ideas & profit guardrails</h2>
                      </div>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">Keep margin above 18%</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {giftOptions.map((gift) => {
                          const giftCost = gift.cost;
                          const giftMarginImpact = discountedProfit - giftCost;
                          return (
                              <div key={gift.name} className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 text-left">
                                  <div className="flex items-center justify-between">
                                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Gift</span>
                                      <span className="rounded-full bg-white px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-primary">KES {giftCost}</span>
                                  </div>
                                  <p className="mt-3 text-lg font-black uppercase tracking-tight text-slate-900">{gift.name}</p>
                                  <p className="mt-2 text-xs text-slate-500">{gift.note}</p>
                                  <div className="mt-4 border-t border-slate-200 pt-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                      Profit after gift: <span className={cn(giftMarginImpact < 0 ? 'text-rose-600' : 'text-slate-900')}>KES {giftMarginImpact.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>

              <div className="rounded-[3rem] border border-slate-100 bg-white p-8 shadow-sm">
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Game rewards</p>
                          <h2 className="mt-2 text-2xl font-black uppercase tracking-tighter text-foreground">Spin & prize cost simulator</h2>
                          <p className="mt-2 max-w-2xl text-sm text-slate-500">Uses the saved game prize odds. See estimated reward cost per play and how it reduces gross profit after your coupon. Non-product operating costs are excluded.</p>
                      </div>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-violet-700">Points use {rewardConfig.points_per_ksh} pts / KES</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Game
                          <select
                            value={rewardGame}
                            onChange={event => setRewardGame(event.target.value as typeof rewardGame)}
                            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800"
                          >
                              <option value="spin_probabilities">Spin wheel</option>
                              <option value="crate_probabilities">Reward crate</option>
                          </select>
                      </label>
                      <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Plays per order
                          <Input type="number" min="0" step="0.1" value={playsPerOrder} onChange={event => setPlaysPerOrder(event.target.value)} className="h-12 rounded-xl bg-slate-50 font-bold" />
                      </label>
                      <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Cost per perk prize (KES)
                          <Input type="number" min="0" value={perkCost} onChange={event => setPerkCost(event.target.value)} className="h-12 rounded-xl bg-slate-50 font-bold" />
                      </label>
                      <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Cost per mystery prize (KES)
                          <Input type="number" min="0" value={mysteryCost} onChange={event => setMysteryCost(event.target.value)} className="h-12 rounded-xl bg-slate-50 font-bold" />
                      </label>
                  </div>
                  {rewardConfigError && (
                      <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                          {rewardConfigError} Showing default prize odds until the saved game configuration is available.
                      </p>
                  )}
                  <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                      <div className="overflow-x-auto rounded-2xl border border-slate-100">
                          <table className="w-full text-left">
                              <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                  <tr><th className="px-4 py-3">Prize</th><th className="px-4 py-3 text-right">Odds</th><th className="px-4 py-3 text-right">Est. cost</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                  {selectedRewards.map((reward, index) => {
                                    const cost = reward.type === 'voucher'
                                      ? reward.value
                                      : reward.type === 'xp'
                                        ? reward.value / Math.max(1, rewardConfig.points_per_ksh)
                                        : reward.type === 'perk'
                                          ? assumedPerkCost
                                          : assumedMysteryCost;
                                    return (
                                      <tr key={`${reward.label}-${index}`}>
                                          <td className="px-4 py-3 font-bold text-slate-700">{reward.label}</td>
                                          <td className="px-4 py-3 text-right text-slate-500">{reward.chance}%</td>
                                          <td className="px-4 py-3 text-right font-bold text-slate-700">{reward.type === 'mystery' && assumedMysteryCost === 0 ? 'Set cost' : `KES ${cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                          </table>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-5">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Estimated gross profit after coupon + game reward</p>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                              <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Expected game cost / play</p><p className="mt-2 text-lg font-black text-violet-700">KES {estimatedRewardCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
                              <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Game cost / order</p><p className="mt-2 text-lg font-black text-rose-600">KES {expectedGameCostPerOrder.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
                              <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Profit after rewards</p><p className={cn("mt-2 text-lg font-black", profitAfterGame < 0 ? 'text-rose-600' : 'text-emerald-700')}>KES {profitAfterGame.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
                              <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Margin after rewards</p><p className={cn("mt-2 text-lg font-black", marginAfterGame < 18 ? 'text-rose-600' : 'text-emerald-700')}>{marginAfterGame.toFixed(1)}%</p></div>
                          </div>
                          {hasUnpricedRewards && <p className="mt-4 text-[10px] leading-5 text-amber-800">Perk and mystery costs are your estimates above. Actual prize cost may differ; enter your real fulfilment cost for a more accurate result.</p>}
                      </div>
                  </div>
              </div>

              <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden min-h-[500px]">
                  <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <Ticket className="h-6 w-6 text-primary" />
                          <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter">Active Vouchers</h2>
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">{coupons.length} Coupons</span>
                  </div>

                  {loading ? (
                      <div className="p-32 text-center flex flex-col items-center gap-4">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                          <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Checking Vault...</p>
                      </div>
                  ) : coupons.length === 0 ? (
                      <div className="p-32 text-center flex flex-col items-center gap-6">
                          <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-100"><Tag className="h-10 w-10" /></div>
                          <p className="text-lg font-black text-slate-300 uppercase tracking-tight italic">No active coupons found, bro.</p>
                      </div>
                  ) : (
                      <div className="overflow-x-auto">
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em]">
                                      <th className="px-10 py-6">Code</th>
                                      <th className="px-10 py-6 text-center">Discount</th>
                                      <th className="px-6 py-6 text-right">Sale price</th>
                                      <th className="px-6 py-6 text-right">Gross profit after coupon</th>
                                      <th className="px-6 py-6 text-right">Gross after game</th>
                                      <th className="px-10 py-6 text-center">Status</th>
                                      <th className="px-10 py-6 text-right">Action</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {coupons.map(coupon => {
                                    const discount = Math.max(0, Math.min(Number(coupon.discount_percent) || 0, 100));
                                    const salePrice = baseAmount * (1 - discount / 100);
                                    const couponProfit = salePrice - costAmount;
                                    const netWithGame = couponProfit - expectedGameCostPerOrder;
                                    return (
                                      <tr key={coupon.id} className="hover:bg-slate-50/50 transition-colors group">
                                          <td className="px-10 py-8">
                                              <div className="flex items-center gap-4">
                                                  <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white font-black text-xs shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
                                                      %
                                                  </div>
                                                  <div>
                                                      <span className="font-black text-foreground uppercase text-sm tracking-widest block">{coupon.code}</span>
                                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 block italic">Created {new Date(coupon.created_at).toLocaleDateString()}</span>
                                                  </div>
                                              </div>
                                          </td>
                                          <td className="px-10 py-8 text-center">
                                              <span className="text-lg font-black text-primary">-{coupon.discount_percent}%</span>
                                          </td>
                                          <td className="px-6 py-8 text-right text-xs font-bold text-slate-700">KES {salePrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                          <td className={cn("px-6 py-8 text-right text-xs font-bold", couponProfit < 0 ? 'text-rose-600' : 'text-slate-700')}>KES {couponProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                          <td className={cn("px-6 py-8 text-right text-xs font-black", netWithGame < 0 ? 'text-rose-600' : 'text-emerald-700')}>KES {netWithGame.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                          <td className="px-10 py-8 text-center">
                                              <button onClick={() => toggleStatus(coupon.id, coupon.is_active)}>
                                                  {coupon.is_active ? (
                                                      <span className="flex items-center gap-1.5 text-[9px] font-black text-primary uppercase bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                                                          <CheckCircle2 className="h-3 w-3" /> Active
                                                      </span>
                                                  ) : (
                                                      <span className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                                                          <XCircle className="h-3 w-3" /> Paused
                                                      </span>
                                                  )}
                                              </button>
                                          </td>
                                          <td className="px-10 py-8 text-right">
                                              <Button
                                                onClick={() => deleteCoupon(coupon.id, coupon.code)}
                                                variant="ghost"
                                                size="icon"
                                                className="h-10 w-10 rounded-2xl text-slate-200 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-rose-100"
                                              >
                                                  <Trash2 className="h-5 w-5" />
                                              </Button>
                                          </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>
          </div>

      </div>
    </div>
  );
}
