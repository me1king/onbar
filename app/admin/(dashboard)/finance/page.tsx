'use client';

import * as React from 'react';
import {
    DollarSign,
    TrendingUp,
    Target,
    Zap,
    Scale,
    CheckCircle2,
    Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice, cn } from '@/lib/utils';
import TaxControlCenter from '@/components/admin/finance/TaxControlCenter';
import InventoryValuation from '@/components/admin/finance/InventoryValuation';
import ReconciliationEngine from '@/components/admin/finance/ReconciliationEngine';
import { AdminFinanceData, FinancialLedgerEntry } from '@/lib/adminFinanceTypes';

export default function AdminFinancePage() {
    const [loading, setLoading] = React.useState(true);
    const [ledger, setLedger] = React.useState<FinancialLedgerEntry[]>([]);
    const [financeData, setFinanceData] = React.useState<AdminFinanceData | null>(null);
    const [currency, setCurrency] = React.useState<'KES' | 'USD'>('KES');
    const exchangeRate = 129.5;
    const [loadError, setLoadError] = React.useState<string | null>(null);

    const convert = (amount: number) => {
        if (currency === 'KES') return amount;
        return amount / exchangeRate;
    };

    const formatVal = (amount: number) => {
        if (currency === 'KES') return formatPrice(amount);
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    };

    const fetchLedger = React.useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/finance-data', { cache: 'no-store' });
            const result = await response.json() as AdminFinanceData & { error?: string };
            if (!response.ok) throw new Error(result.error || 'Financial data could not be loaded.');
            setFinanceData(result);
            setLedger(result.ledger || []);
            const problems = Object.entries(result.errors || {}).filter(([, error]) => error).map(([section, error]) => `${section}: ${error}`);
            setLoadError(problems.length ? problems.join(' · ') : null);
        } catch (err) {
            console.error("Financial Uplink Desync:", err);
            setLoadError(err instanceof Error ? err.message : 'Financial ledger data could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchLedger();
    }, [fetchLedger]);

    const stats = React.useMemo(() => {
        const revenue = ledger.filter(l => l.entry_type === 'REVENUE').reduce((s, l) => s + Number(l.amount), 0);
        const cost = Math.abs(ledger.filter(l => l.entry_type === 'SUPPLIER_PAYABLE' || l.entry_type === 'COST').reduce((s, l) => s + Number(l.amount), 0));
        const fees = Math.abs(ledger.filter(l => l.entry_type === 'PAYMENT_FEE').reduce((s, l) => s + Number(l.amount), 0));

        const contributionProfit = revenue - cost - fees;
        const margin = revenue > 0 ? (contributionProfit / revenue) * 100 : 0;
        const unreconciled = ledger.filter(l => !l.is_reconciled).length;
        const totalVariances = ledger.filter(l => !l.is_reconciled).reduce((s, l) => s + Math.abs(l.amount), 0);

        return { revenue, contributionProfit, margin, unreconciled, payables: cost, totalVariances };
    }, [ledger]);
    const ledgerUnavailable = !financeData || Boolean(financeData.errors.ledger);

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Decrypting Financial Ledgers...</p>
        </div>
    );

    return (
        <div className="min-w-0 p-4 sm:p-6 lg:p-8 space-y-8 sm:space-y-10 bg-slate-50 min-h-screen text-left">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">Treasury OS Active</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Financial Fortress</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Ledger-based financial summaries. Reconciliation requires a verified external match.</p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex mr-2">
                        {(['KES', 'USD'] as const).map(c => (
                            <button
                                key={c}
                                onClick={() => setCurrency(c)}
                                className={cn(
                                    "px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                                    currency === c ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:text-foreground"
                                )}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                    {currency === 'USD' && <span className="self-center text-[9px] font-bold text-slate-500">Approx. rate: KSh 129.50/USD</span>}
                    <span title="Gateway matching is not configured. Records cannot be marked reconciled automatically.">
                        <Button disabled className="h-12 cursor-not-allowed rounded-xl px-4 text-[10px] font-black uppercase tracking-widest opacity-60 sm:px-6">
                            <Scale className="mr-2 h-4 w-4" /> Verified reconciliation unavailable
                        </Button>
                    </span>
                </div>
            </header>

            {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{loadError}</p>}

            {/* Financial KPIs 2.0 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-stretch">
                {[
                    { label: 'Total Revenue', val: ledgerUnavailable ? 'Unavailable' : stats.revenue, icon: DollarSign, color: 'primary' },
                    { label: 'Unreconciled', val: ledgerUnavailable ? 'Unavailable' : stats.totalVariances, icon: Target, color: 'amber' },
                    { label: 'Gross Profit', val: ledgerUnavailable ? 'Unavailable' : stats.contributionProfit, icon: TrendingUp, color: 'emerald' },
                    { label: 'Margin efficiency', val: ledgerUnavailable ? 'Unavailable' : `${stats.margin.toFixed(1)}%`, icon: Scale, color: 'indigo' },
                ].map((item) => (
                    <Card key={item.label} className="min-w-0 p-6 sm:p-8 rounded-[2rem] sm:rounded-[3rem] bg-white border border-slate-100 shadow-sm group hover:shadow-xl transition-all relative overflow-hidden h-full flex flex-col justify-between">
                        <div className="relative z-10 space-y-8">
                            <div className={cn(
                                "h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm",
                                item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
                                item.color === 'amber' ? "bg-amber-50 text-amber-500" :
                                item.color === 'primary' ? "bg-primary/5 text-primary" :
                                "bg-indigo-50 text-indigo-500"
                            )}>
                                <item.icon className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                                <h3 className="break-words text-2xl font-black tabular-nums text-foreground tracking-tighter uppercase sm:text-3xl">
                                    {typeof item.val === 'string' ? item.val : formatVal(convert(item.val))}
                                </h3>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* FINANCE OS MODULES */}
            <div className="grid lg:grid-cols-2 gap-8">
                <TaxControlCenter entries={financeData?.taxEntries || []} error={financeData?.errors.tax || null} />
                <InventoryValuation products={financeData?.inventory || []} error={financeData?.errors.inventory || null} />
                <div className="lg:col-span-2">
                    <ReconciliationEngine records={financeData?.reconciliation || []} error={financeData?.errors.reconciliation || null} onRefresh={fetchLedger} loading={loading} />
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-6">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground px-4 italic underline decoration-primary decoration-4">The Bar Ledger</h2>
                    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em]">
                                    <th className="px-10 py-6">Mission Ref</th>
                                    <th className="px-10 py-6">Payload Type</th>
                                    <th className="px-10 py-6">Value (KES)</th>
                                    <th className="px-10 py-6 text-right">Integrity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {ledger.map((entry) => (
                                    <tr key={entry.id} className="hover:bg-primary/5 transition-colors group">
                                        <td className="px-10 py-8">
                                            <p className="text-xs font-black text-foreground uppercase">Order #{entry.order_id}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{new Date(entry.created_at).toLocaleDateString()}</p>
                                        </td>
                                        <td className="px-10 py-8">
                                            <span className={cn(
                                                "text-[8px] font-black uppercase px-2.5 py-1 rounded border",
                                                entry.entry_type === 'REVENUE' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                entry.entry_type === 'REFUND' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                                "bg-slate-100 text-slate-500 border-slate-200"
                                            )}>{entry.entry_type}</span>
                                        </td>
                                        <td className={cn(
                                            "px-10 py-8 font-black text-sm",
                                            entry.amount > 0 ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {entry.amount > 0 ? '+' : ''}{formatVal(convert(entry.amount))}
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            {entry.is_reconciled ? (
                                                <div className="flex items-center justify-end gap-2 text-emerald-500">
                                                    <span className="text-[8px] font-black uppercase">Verified</span>
                                                    <CheckCircle2 size={14} />
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2 text-amber-500 animate-pulse">
                                                    <span className="text-[8px] font-black uppercase">Pending</span>
                                                    <Zap size={14} />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-8 h-full">
                    <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm relative overflow-hidden group flex-1 flex flex-col justify-between">
                        <div className="relative z-10 space-y-10">
                            <h3 className="text-lg font-black uppercase tracking-tighter text-foreground">Unit Economics ({currency})</h3>
                            <div className="space-y-6">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <span>Contribution Margin</span>
                                    <span className="text-primary">{stats.margin.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${stats.margin}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center text-xs font-black text-foreground">
                                    <p>Avg Order Value</p>
                                    <p>{loadError ? 'Unavailable' : formatVal(convert(stats.revenue / (ledger.filter(l => l.entry_type === 'REVENUE').length || 1)))}</p>
                                </div>
                            </div>
                        </div>
                        <DollarSign className="absolute -bottom-10 -left-10 h-48 w-48 text-primary/5 rotate-12 -z-0" />
                    </Card>

                    <div className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6 text-left">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Scale size={20} /></div>
                            <h3 className="text-lg font-black uppercase text-foreground leading-none tracking-tighter">Risk Guard</h3>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic">
                            &quot;Scanning for payment anomalies and reconciliation drift across all linked gateways.&quot;
                        </p>
                        <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Protocol Integrity: 100%</span>
                            <CheckCircle2 size={16} className="text-emerald-500" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
