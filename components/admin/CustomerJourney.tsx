'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Users, MousePointer2, ShoppingBag, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FunnelStep {
    step: string;
    count: number;
    icon: React.ElementType;
    color: string;
}

const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export default function CustomerJourney() {
    const [funnel, setFunnel] = React.useState<FunnelStep[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');

    const fetchFunnel = React.useCallback(async () => {
        setError('');
        try {
            const res = await fetch('/api/admin/intelligence/funnel', { cache: 'no-store' });
            const data = await res.json() as {
                discovery?: unknown;
                browse?: unknown;
                cart?: unknown;
                conversion?: unknown;
                error?: string;
            };
            if (!res.ok) throw new Error(data.error || 'Funnel analytics could not be loaded.');

            if (isCount(data.discovery)
                && isCount(data.browse)
                && isCount(data.cart)
                && isCount(data.conversion)) {
                setFunnel([
                    { step: 'Discovery', count: data.discovery, icon: MousePointer2, color: 'indigo' },
                    { step: 'Browse', count: data.browse, icon: Users, color: 'emerald' },
                    { step: 'Cart', count: data.cart, icon: ShoppingBag, color: 'primary' },
                    { step: 'Conversion', count: data.conversion, icon: CheckCircle2, color: 'rose' }
                ]);
            } else {
                throw new Error('Funnel analytics returned an incomplete response.');
            }
        } catch (err) {
            console.error("Funnel fetch failure:", err);
            setFunnel([]);
            setError(err instanceof Error ? err.message : 'Funnel analytics could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchFunnel();
        const interval = setInterval(fetchFunnel, 60000); // 1m pulse
        return () => clearInterval(interval);
    }, [fetchFunnel]);

    if (loading) return <div className="h-64 bg-slate-50 rounded-[3rem] animate-pulse flex items-center justify-center"><Loader2 className="animate-spin text-slate-200" /></div>;
    if (error) return <Card className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800" role="alert">{error}</Card>;
    const largestReduction = funnel.slice(1).reduce<{ from: string; to: string; percent: number } | null>((largest, item, index) => {
        const previous = funnel[index].count;
        if (previous === 0 || item.count >= previous) return largest;
        const percent = Number((100 - (item.count / previous * 100)).toFixed(1));
        return !largest || percent > largest.percent
            ? { from: funnel[index].step, to: item.step, percent }
            : largest;
    }, null);
    const hasFunnelActivity = funnel.some(item => item.count > 0);

    return (
        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-12 text-left">
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 shadow-sm">
                        <Users size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Journey Funnel</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Behavioral Conversion Node</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4">
                {funnel.map((item, i) => {
                    const dropOff = i > 0 && funnel[i-1].count > 0 ? (100 - (item.count / funnel[i-1].count * 100)).toFixed(1) : '0';
                    return (
                        <React.Fragment key={item.step}>
                            <div className="flex-1 min-w-[200px] space-y-6">
                                <div className={cn(
                                    "p-8 rounded-[2.5rem] border space-y-6 relative overflow-hidden transition-all hover:scale-[1.02]",
                                    item.color === 'indigo' ? "bg-indigo-50 border-indigo-100 text-indigo-600" :
                                    item.color === 'emerald' ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                                    item.color === 'primary' ? "bg-primary/5 border-primary/10 text-primary" :
                                    "bg-rose-50 border-rose-100 text-rose-600"
                                )}>
                                    <div className="flex justify-between items-start">
                                        {React.createElement(item.icon, { size: 24, className: "opacity-40" })}
                                        {i > 0 && item.count > 0 && <span className="text-[8px] font-black uppercase bg-white/50 px-2 py-0.5 rounded-lg border border-white/20">-{dropOff}% Loss</span>}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-2xl font-black tracking-tighter uppercase">{item.count.toLocaleString()}</p>
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.step}</p>
                                    </div>
                                </div>
                            </div>
                            {i < funnel.length - 1 && (
                                <div className="flex items-center px-2 opacity-20">
                                    <ArrowRight size={24} />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-left">{hasFunnelActivity ? 'Observed Count Reduction' : 'No Funnel Activity Yet'}</h4>
                <p className="text-sm font-medium italic text-slate-600 leading-relaxed text-left">
                    {largestReduction
                        ? `Largest reduction in raw counts: ${largestReduction.from} to ${largestReduction.to} (${largestReduction.percent}%). These are event and order totals, not unique visitors, so this is not a measured user drop-off.`
                        : hasFunnelActivity
                            ? 'No adjacent stage has a lower raw count. These are event and order totals, not unique visitors or a measured conversion funnel.'
                            : 'No tracked events or delivered orders were recorded in the last 30 days. Confirm analytics consent and event writes; zero does not by itself mean the journey is healthy.'}
                </p>
            </div>
        </Card>
    );
}
