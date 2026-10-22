'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { DollarSign, ArrowUpRight, TrendingUp, Wallet, ArrowDownRight, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

export default function FinancePulse() {
    const [stats, setStats] = React.useState({
        grossRevenue: 0,
        totalPayouts: 0,
        netProfit: 0,
        fees: 0
    });
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState('');

    const fetchLedger = React.useCallback(async () => {
        setLoadError('');
        try {
            const response = await fetch('/api/admin/finance-data', { cache: 'no-store' });
            const result = await response.json() as {
                ledger?: { amount: number; entry_type: string }[];
                errors?: { ledger?: string | null };
                error?: string;
            };
            if (!response.ok) throw new Error(result.error || 'Financial data could not be loaded.');
            if (result.errors?.ledger) throw new Error(result.errors.ledger);
            const data = result.ledger || [];
            const gross = data.filter(e => e.entry_type === 'REVENUE').reduce((sum, e) => sum + Number(e.amount), 0);
            const cost = data.filter(e => e.entry_type === 'COST').reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);
            const payouts = data.filter(e => e.entry_type === 'WITHDRAWAL').reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);
            const fees = data.filter(e => e.entry_type === 'PAYMENT_FEE').reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

            setStats({
                grossRevenue: gross,
                totalPayouts: payouts,
                netProfit: gross - cost - fees,
                fees
            });
        } catch (error) {
            console.error('[FinancePulse] Could not load financial ledger:', error);
            setLoadError(error instanceof Error ? error.message : 'Financial ledger could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchLedger();
    }, [fetchLedger]);

    if (loading) return <div className="h-48 bg-slate-50 rounded-[3rem] animate-pulse flex items-center justify-center"><Loader2 className="animate-spin text-slate-200" /></div>;

    return (
        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 text-left">
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Financial Pulse</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Ledger Integrity Node</p>
                    </div>
                </div>
            </div>

            {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Financial data unavailable: {loadError}</p>}

            <div className="space-y-8">
                <div className="flex justify-between items-end pb-8 border-b border-slate-50">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Revenue (Total)</p>
                        <h3 className="text-4xl font-black text-foreground tracking-tighter uppercase leading-none">{formatPrice(stats.grossRevenue)}</h3>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1 justify-end">
                            <ArrowUpRight size={10} /> 100% Sync
                        </p>
                        <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-1">Real-time Data</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <ArrowDownRight size={10} className="text-rose-500" /> Payouts
                        </p>
                        <p className="text-xl font-black text-foreground uppercase tracking-tight">{formatPrice(stats.totalPayouts)}</p>
                    </div>
                    <div className="space-y-2 text-right">
                        <p className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-2 justify-end">
                            <TrendingUp size={10} /> Net Profit
                        </p>
                        <p className="text-xl font-black text-primary uppercase tracking-tight">{formatPrice(stats.netProfit)}</p>
                    </div>
                </div>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
                <div className="flex items-center gap-3">
                    <Wallet size={16} className="text-slate-400" />
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Gateway Fees</span>
                </div>
                <span className="text-[10px] font-black text-rose-500">-{formatPrice(stats.fees)}</span>
            </div>
        </Card>
    );
}
