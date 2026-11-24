'use client';

import * as React from 'react';
import Image from 'next/image';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';
import {
  History as HistoryIcon,
  Activity,
  Send,
  ShieldCheck,
  Loader2,
  Package,
  Truck,
  GlassWater,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAdmin } from '@/context/AdminContext';
import { supabase } from '@/lib/supabaseClient';
import dynamic from 'next/dynamic';

const AreaChart = dynamic(() => import('recharts').then(mod => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(mod => mod.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });

import TodayCommandCenter from '@/components/admin/TodayCommandCenter';
import LivePulseHUD from '@/components/admin/LivePulseHUD';
import ExceptionCenter from '@/components/admin/ExceptionCenter';
import BarIntelligence from '@/components/admin/BarIntelligence';
import AskOB from '@/components/admin/AskOB';
import SentimentSentinel from '@/components/admin/SentimentSentinel';
import ActiveAdmins from '@/components/admin/ActiveAdmins';
import AutonomousSwitch from '@/components/admin/AutonomousSwitch';
import AICommanderBrief from '@/components/admin/AICommanderBrief';
import WorkforceHub from '@/components/admin/WorkforceHub';
import SystemHealthMonitor from '@/components/admin/SystemHealthMonitor';
import SystemPulseWidget from '@/components/admin/SystemPulseWidget';
import FinancePulse from '@/components/admin/FinancePulse';
import DataGovernance from '@/components/admin/DataGovernance';
import ExperimentLab from '@/components/admin/ExperimentLab';
import CustomerJourneyMap from '@/components/admin/CustomerJourneyMap';
import IntelligenceCommand from '@/components/admin/IntelligenceCommand';
import SnackCommandCenter from '@/components/admin/SnackCommandCenter';
import DeliveryMetrics from '@/components/admin/DeliveryMetrics';
import MarketIntel from '@/components/admin/MarketIntel';
import BuzzHUD from '@/components/buzz/BuzzHUD';
import TrustCommandCenter from '@/components/admin/TrustCommandCenter';
import MarketingCommandCenter from '@/components/admin/MarketingCommandCenter';
import CommandRelay from '@/components/admin/CommandRelay';

const LiveDispatchMap = dynamic(() => import('@/components/admin/dispatch/LiveDispatchMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-[3rem]" />
});

import { runSecurityScan } from '@/lib/ob-os/security-shield';

interface OrderRecord {
  id: number;
  total_price: number;
  unit_price?: number;
  unit_cost?: number;
  status: string;
  created_at: string;
  customer_name: string;
  product_id: number;
  quantity: number;
  payment_method: string;
  order_items?: { product_id: number; unit_cost: number; quantity: number }[];
}

interface ProductRecord {
  id: number;
  stock: number;
  name: string;
  price: number;
  image_url: string;
  cost_price: number;
  category?: string;
  warehouse_location?: string;
}

interface AuditLog {
    id: string;
    action: string;
    staff_email: string;
    created_at: string;
}

interface LedgerRecord {
    id: number;
    amount: number;
    entry_type: string;
    created_at: string;
}

export default function AdminDashboard() {
  const { email } = useAdmin();
  const [orders, setOrders] = React.useState<OrderRecord[]>([]);
  const [products, setProducts] = React.useState<ProductRecord[]>([]);
  const [ledger, setLedger] = React.useState<LedgerRecord[]>([]);
  const [riders, setRiders] = React.useState<{ id: string; rider_name: string; status: string; battery_level: number | null; battery_updated_at: string | null }[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);
  const [peakHours, setPeakHours] = React.useState<{ hour: string; count: number }[]>([]);
  const [categoryMix, setCategoryBreakdown] = React.useState<{ name: string; value: number }[]>([]);

  React.useEffect(() => {
      setMounted(true);
  }, []);

  React.useEffect(() => {
    let active = true;
    async function loadStats() {
      try {
        const [dashboardResponse, auditResponse] = await Promise.all([
          fetch('/api/admin/dashboard-data', { cache: 'no-store' }),
          fetch('/api/admin/audit-logs', { cache: 'no-store' })
        ]);
        if (!dashboardResponse.ok) {
          const result = await dashboardResponse.json() as { error?: string };
          throw new Error(result.error || 'Could not load dashboard data.');
        }
        const dashboardData = await dashboardResponse.json() as {
          orders: OrderRecord[];
          products: ProductRecord[];
          ledger: LedgerRecord[];
          riders: { id: string; rider_name: string; status: string; battery_level: number | null; battery_updated_at: string | null }[];
        };
        if (!active) return;
        setOrders(dashboardData.orders);
        setProducts(dashboardData.products);
        setLedger(dashboardData.ledger);
        setRiders(dashboardData.riders);
        {
            const hours: Record<string, number> = {};
            dashboardData.orders.forEach(o => {
                const hour = new Date(o.created_at).getHours();
                const label = `${hour}:00`;
                hours[label] = (hours[label] || 0) + 1;
            });
            setPeakHours(Object.entries(hours).map(([hour, count]) => ({ hour, count })).sort((a,b) => parseInt(a.hour) - parseInt(b.hour)));

            const productCategories = new Map<number, string | undefined>(
                dashboardData.products.map(product => [product.id, product.category?.trim()])
            );
            const categories: Record<string, number> = {};
            dashboardData.orders.forEach(order => {
                order.order_items?.forEach((item: NonNullable<OrderRecord['order_items']>[number]) => {
                    const category = productCategories.get(item.product_id);
                    if (!category) return;
                    categories[category] = (categories[category] || 0) + Number(item.quantity || 0);
                });
            });
            setCategoryBreakdown(Object.entries(categories).map(([name, value]) => ({ name, value })));
        }
        if (auditResponse.ok) {
            const result = await auditResponse.json() as { logs?: AuditLog[] };
            if (active) setAuditLogs((result.logs || []).slice(0, 2));
        } else {
            const result = await auditResponse.json() as { error?: string };
            console.error('Could not load dashboard audit logs:', result.error || auditResponse.statusText);
        }

      } catch (err: unknown) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadStats();
    const refresh = setInterval(loadStats, 60000);

    const shieldScan = setInterval(() => {
        runSecurityScan();
    }, 300000);

    return () => {
        active = false;
        clearInterval(refresh);
        clearInterval(shieldScan);
    };
  }, []);

  const sparklineData = React.useMemo(() => {
      const days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return d.toISOString().split('T')[0];
      }).reverse();

      return days.map(date => {
          const dayOrders = orders.filter(o => o.created_at?.startsWith(date));
          const dayLedger = ledger.filter(l => l.created_at?.startsWith(date));

          const dayRevenue = dayLedger.filter(l => l.entry_type === 'REVENUE').reduce((sum, l) => sum + Number(l.amount || 0), 0);
          const dayExpenses = Math.abs(dayLedger.filter(l => l.entry_type === 'SUPPLIER_PAYABLE' || l.entry_type === 'COST' || l.entry_type === 'PAYMENT_FEE').reduce((sum, l) => sum + Number(l.amount || 0), 0));

          return {
              date: date.split('-').slice(1).join('/'),
              count: dayOrders.length,
              revenue: dayRevenue,
              profit: dayRevenue - dayExpenses
          };
      });
  }, [orders, ledger]);
  const lowStockProducts = products.filter(product => Number(product.stock) <= 10);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50dvh] gap-4">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest animate-pulse">Accessing Control Tower...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 lg:space-y-10 animate-in fade-in duration-700 bg-slate-50 min-h-screen text-left selection:bg-primary/20">
      <CommandRelay />

      {/* EXECUTIVE HEADER */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8 sm:pb-10">
          <div className="text-left">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-2">Online Bar Control</p>
              <h1 className="text-3xl sm:text-5xl font-black text-foreground uppercase tracking-tighter leading-none">Control <span className="text-primary">Tower</span></h1>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-4">
                  <div className="flex items-center gap-2 text-emerald-500">
                      <ShieldCheck size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Fortress Security Active</span>
                  </div>
                  <div className="hidden sm:block h-1 w-1 rounded-full bg-slate-300" />
                  <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400">Authenticated: {email?.split('@')[0]}</p>
              </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
              <Link href="/lord/operations" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full h-12 sm:h-14 px-6 sm:px-8 rounded-xl sm:rounded-2xl border-primary/30 bg-white text-primary font-black uppercase text-[10px] sm:text-xs tracking-widest shadow-sm hover:bg-primary/5 transition-all">
                      <Activity className="h-4 w-4 mr-2" /> Operations Command
                  </Button>
              </Link>
              <Link href="/lord/forge" className="w-full sm:w-auto">
                  <Button className="w-full h-12 sm:h-14 px-6 sm:px-8 rounded-xl sm:rounded-2xl bg-primary text-white font-black uppercase text-[10px] sm:text-xs tracking-widest shadow-xl hover:bg-primary/90 transition-all">
                      <Package className="h-4 w-4 mr-2" /> Manage Products
                  </Button>
              </Link>
          </div>
      </header>

      {/* LIVE PULSE: REAL-TIME TRAFFIC */}
      <div className="grid lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-8">
              <LivePulseHUD />
          </div>
          <div className="lg:col-span-4">
              <BuzzHUD />
          </div>
      </div>

      {/* COMMAND ALERTS: WHAT NEEDS ATTENTION? */}
      <Card className="p-8 sm:p-10 rounded-[3.5rem] bg-white border border-slate-200/80 shadow-md space-y-6 text-left">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Command Alerts &bull; What Needs Attention?</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Automated Operational Priority Scanner</p>
              </div>
          </div>

          {lowStockProducts.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {lowStockProducts.map(product => (
                      <div key={product.id} className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-800">LOW STOCK</span>
                          <p className="text-xs font-black uppercase text-amber-950">{product.name}</p>
                          <p className="text-[9px] text-amber-800 font-bold uppercase">{product.stock} units remaining</p>
                          <Link href="/lord/forge">
                              <Button className="w-full h-8 rounded-xl bg-amber-500 text-white font-black uppercase text-[8px] mt-2">Manage Stock</Button>
                          </Link>
                      </div>
                  ))}
              </div>
          ) : (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">
                  {isLoading ? 'Loading inventory alerts...' : supabase ? 'No products at or below the 10-unit restock threshold.' : 'Inventory alerts are unavailable because Supabase is not configured.'}
              </p>
          )}
      </Card>

      {/* INTELLIGENCE COMMAND: MISSION BOARD */}
      <IntelligenceCommand />

      {/* COMMAND HUD: REAL-TIME NODES */}
      <TodayCommandCenter />

      {/* AI COMMANDER BRIEF: AUTONOMOUS INTELLIGENCE */}
      <AICommanderBrief />

      {/* JOURNEY & CONVERSION: BEHAVIORAL INTELLIGENCE */}
      <CustomerJourneyMap />

      <section id="deep-forensics" className="scroll-mt-24 rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                  <div className="flex items-center gap-2 text-primary">
                      <HistoryIcon className="h-4 w-4" />
                      <span className="text-[10px] font-black uppercase tracking-[0.25em]">Customer session forensics</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-500">Select a customer session to inspect its recorded activity timeline.</p>
              </div>
              <Link href="/lord/behavior/sessions">
                  <Button variant="outline" className="rounded-xl border-slate-200 text-[10px] font-black uppercase tracking-widest">
                      Browse sessions &rarr;
                  </Button>
              </Link>
          </div>
      </section>

      {/* DELIVERY PERFORMANCE: SPEED LOGISTICS */}
      <DeliveryMetrics />

      {/* MARKET INTELLIGENCE: COMPETITOR RADAR */}
      <MarketIntel />

      {/* TRUST COMMAND CENTER: ANTI-COUNTERFEIT SENTINEL */}
      <section className="space-y-6">
          <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                  <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground leading-none">Trust Sentinel</h2>
              </div>
          </div>
          <TrustCommandCenter />
      </section>

      {/* GOD-VIEW: LIVE DISPATCH OPS */}
      <section className="space-y-6">
          <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Live Dispatch Map</h2>
              </div>
              <Link href="/lord/dispatch">
                  <Button variant="outline" className="h-10 rounded-xl text-[8px] font-black uppercase tracking-widest border-slate-200">Full Console &rarr;</Button>
              </Link>
          </div>
          <div className="h-[600px] w-full rounded-[3.5rem] border border-slate-100 overflow-hidden shadow-2xl">
              <LiveDispatchMap riders={riders} />
          </div>
      </section>

      {/* WORKFORCE & FINANCIALS: ACCOUNTABILITY NODES */}
      <div className="grid lg:grid-cols-2 gap-10">
          <WorkforceHub />
          <div className="space-y-10">
              <SystemHealthMonitor />
              <DataGovernance />
              <SnackCommandCenter />
              <FinancePulse />
          </div>
      </div>

      {/* EXPERIMENTATION: OPTIMIZATION HUB */}
      <ExperimentLab />

      {/* AUTOMATION & CAMPAIGNS: ENGINE CONTROLS */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:gap-10">
          <AutonomousSwitch />
          <div className="min-w-0 space-y-6">
              <h2 className="text-2xl font-black uppercase text-foreground px-4">Growth Command</h2>
              <MarketingCommandCenter />
          </div>
      </div>

      <SentimentSentinel />

      <BarIntelligence />

      <ExceptionCenter />

      <AskOB />

      <div className="grid lg:grid-cols-12 gap-10">

          <div className="lg:col-span-8 space-y-10">
              <section className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-12">
                      <div>
                          <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground leading-none">Beverage Flow Trends</h2>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Revenue vs Profit Stream</p>
                      </div>
                      <div className="flex gap-2">
                        <Link href="/lord/analytics">
                            <Button variant="ghost" className="text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5">Deep Analytics &rarr;</Button>
                        </Link>
                      </div>
                  </div>

                  <div className="h-80 w-full text-left">
                      {mounted && (
                          <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={sparklineData}>
                                  <defs>
                                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#ff6b00" stopOpacity={0.1}/>
                                          <stop offset="95%" stopColor="#ff6b00" stopOpacity={0}/>
                                      </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/50" />
                                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: 'currentColor' }} className="text-muted-foreground" />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: 'currentColor' }} className="text-muted-foreground" />
                                  <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)', fontWeight: 900, fontSize: '10px' }} />
                                  <Area type="monotone" dataKey="revenue" stroke="#ff6b00" strokeWidth={4} fill="url(#colorRevenue)" name="Revenue" />
                                  <Area type="monotone" dataKey="profit" stroke="currentColor" className="text-foreground" strokeWidth={2} fill="transparent" name="Net Profit" />
                              </AreaChart>
                          </ResponsiveContainer>
                      )}
                  </div>
              </section>

              <div className="grid sm:grid-cols-2 gap-10">
                  <section className="bg-white rounded-[3rem] p-10 border border-slate-100 shadow-sm">
                      <h3 className="text-sm font-black uppercase tracking-tighter mb-8 text-left">Peak Order Hours</h3>
                      <div className="h-48 w-full text-left">
                          {mounted && (
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={peakHours}>
                                      <Bar dataKey="count" fill="#ff6b00" radius={[4, 4, 0, 0]} />
                                      <XAxis dataKey="hour" hide />
                                      <Tooltip />
                                  </BarChart>
                              </ResponsiveContainer>
                          )}
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-4 text-center">Dispatch hotspots identified between 18:00 - 22:00</p>
                  </section>

                  <section className="bg-white rounded-[3rem] p-10 border border-slate-100 shadow-sm">
                      <h3 className="text-sm font-black uppercase tracking-tighter mb-8 text-left">Inventory Mix</h3>
                      <div className="space-y-4">
                          {categoryMix.map(cat => (
                              <div key={cat.name} className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase text-slate-500">{cat.name}</span>
                                  <div className="h-1.5 flex-1 mx-4 bg-slate-50 rounded-full overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${(cat.value / (orders.length || 1)) * 100}%` }}></div>
                                  </div>
                                  <span className="text-[10px] font-black text-foreground">{cat.value}</span>
                              </div>
                          ))}
                      </div>
                  </section>
              </div>

              <section id="warehouse-alerts" className="space-y-6">
                  <div className="flex items-center justify-between px-4">
                      <h2 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Cellar & Stock Alerts</h2>
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest animate-pulse">Scanning Inventory...</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6">
                      {products.filter(p => p.stock <= 5).slice(0, 4).map(p => (
                          <div key={p.id} className="p-8 rounded-[3rem] bg-white border border-slate-100 flex items-center justify-between group hover:border-rose-200 transition-all shadow-sm">
                              <div className="flex items-center gap-4 min-w-0">
                                  <div className="h-16 w-16 rounded-[1.5rem] bg-slate-50 p-2 shrink-0 border border-slate-100 flex items-center justify-center relative overflow-hidden">
                                      <Image src={p.image_url} width={64} height={64} alt="" className="max-h-full w-auto object-contain mx-auto" />
                                  </div>
                                  <div className="min-w-0">
                                      <p className="text-[11px] font-black text-foreground uppercase truncate tracking-tight">{p.name}</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{p.warehouse_location || 'Location not configured'}</p>
                                      <p className="text-[10px] font-bold text-rose-500 uppercase mt-1 tracking-widest">Only {p.stock} remain</p>
                                  </div>
                              </div>
                              <Link href="/lord/upload">
                                  <Button size="icon" variant="ghost" className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-400 hover:text-primary active:scale-90 transition-all border border-slate-100 shadow-sm">
                                      <Plus className="h-5 w-5" />
                                  </Button>
                              </Link>
                          </div>
                      ))}
                  </div>
              </section>
          </div>

          <div className="lg:col-span-4 space-y-8">

              <ActiveAdmins />

              <SystemPulseWidget />

              <section className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className="relative z-10 space-y-10 text-left">
                    <h3 className="text-sm font-black uppercase text-slate-400 tracking-[0.4em]">Tactical Access</h3>
                    <div className="grid grid-cols-2 gap-6">
                        {[
                            { label: 'Add Stock', icon: Package, href: '/lord/upload', id: 'dash.add_stock' },
                            { label: 'Bar Runners', icon: Truck, href: '/lord/dispatch', id: 'dash.runners' },
                            { label: 'Broadcast', icon: Send, href: '/lord/broadcast', id: 'dash.broadcast' },
                            { label: 'Happy Hour', icon: GlassWater, href: '/lord/gamification', id: 'dash.gamification' },
                        ].map(action => (
                            <Link key={action.label} href={action.href} data-behavior-id={action.id} className="flex flex-col items-center gap-4 p-8 rounded-[2rem] bg-slate-50 border border-slate-100 hover:bg-primary hover:text-white transition-all group shadow-sm">
                                <action.icon className="h-6 w-6 text-primary group-hover:text-white transition-colors" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-center">{action.label}</span>
                            </Link>
                        ))}
                    </div>
                  </div>
              </section>

              <section className="bg-white rounded-[3.5rem] p-10 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between mb-8 text-left border-b border-slate-50 pb-6">
                      <h3 className="text-sm font-black uppercase text-foreground tracking-tighter leading-none">Security Audit</h3>
                      <Link href="/lord/audit" className="text-[10px] font-black text-primary uppercase underline tracking-widest">Full Log</Link>
                  </div>
                  <div className="space-y-6">
                      {auditLogs.length === 0 ? (
                          <p className="text-[10px] font-black text-slate-300 uppercase italic text-center py-4">No recent activity detected.</p>
                      ) : (
                          auditLogs.map((log) => (
                              <div key={log.id} className="flex gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-50 hover:border-slate-100 transition-all text-left">
                                  <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm"><HistoryIcon className="h-5 w-5" /></div>
                                  <div className="text-left min-w-0">
                                      <p className="text-[11px] font-black text-foreground uppercase leading-tight truncate tracking-tight">{(log.action || '').replace(/_/g, ' ')}</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-widest">
                                          {log.staff_email?.split('@')[0]} &bull; {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </section>
          </div>

      </div>

      {/* BAR OS Live Tactical Telemetry Feed */}
      <section className="pt-6">
          <TacticalEventFeed
              title="BAR OS Shift Console Telemetry Engine"
              subtitle="Live Real-time Operations Stream Across Cellar, Growth & Dispatch"
          />
      </section>

    </div>
  );
}
