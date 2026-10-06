'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { ShieldCheck, Clock, Scale } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

export default function TaxControlCenter() {
    const [taxData, setTaxData] = React.useState({
        output_vat: 0,
        excise: 0,
        days_to_deadline: 0
    });
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);

    const fetchTaxPosition = React.useCallback(async () => {
        if (!supabase) {
            setLoadError('Supabase is not configured. Ledger tax estimates are unavailable.');
            setLoading(false);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('ledger_entries')
                .select('amount, account_id')
                .or('account_id.eq.2100,account_id.eq.2200');
            if (error) throw error;

            let vatPayable = 0;
            let excisePayable = 0;

            data?.forEach(e => {
                if (e.account_id === '2100') vatPayable += e.amount;
                if (e.account_id === '2200') excisePayable += e.amount;
            });

            const now = new Date();
            const deadline = now.getDate() < 20
                ? new Date(now.getFullYear(), now.getMonth(), 20)
                : new Date(now.getFullYear(), now.getMonth() + 1, 20);
            const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            setTaxData({
                output_vat: vatPayable,
                excise: excisePayable,
                days_to_deadline: diffDays
            });
            setLoadError(null);
        } catch (e) {
            console.error('[TaxControlCenter] Could not load tax ledger entries:', e);
            setLoadError(e instanceof Error ? e.message : 'Tax ledger entries could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchTaxPosition();
    }, [fetchTaxPosition]);

    if (loading) return <div className="h-64 bg-slate-50 rounded-[3rem] animate-pulse" />;

    return (
        <Card className="min-w-0 p-5 sm:p-8 rounded-[2rem] sm:rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-6 sm:space-y-10 text-left">
            <header className="flex flex-wrap justify-between items-center gap-4 px-1 sm:px-2">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Tax Command</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Recorded ledger tax estimate · verify with KRA</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase border border-amber-100">
                    <Clock size={12} className="mr-1" /> {loadError ? 'Deadline unavailable' : `${taxData.days_to_deadline} Days Remaining`}
                </div>
            </header>

            <div className="grid sm:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                        <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">VAT Liability</p>
                            <h4 className="text-2xl font-black text-foreground">{loadError ? 'Unavailable' : formatPrice(taxData.output_vat)}</h4>
                        </div>
                        <Scale className="text-slate-200 mb-1" size={20} />
                    </div>
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase text-slate-400">Excise Position</p>
                            <h4 className="text-2xl font-black text-foreground">{loadError ? 'Unavailable' : formatPrice(taxData.excise)}</h4>
                        </div>
                    </div>
                </div>

                <div className="min-w-0 p-5 sm:p-8 bg-slate-50 rounded-[2.5rem] flex flex-col justify-between group overflow-hidden relative">
                    <div className="relative z-10 space-y-4">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Recorded VAT + Excise</p>
                        <h2 className="break-words text-2xl font-black tabular-nums text-primary tracking-tighter leading-none sm:text-4xl">
                            {loadError ? 'Unavailable' : formatPrice(taxData.output_vat + taxData.excise)}
                        </h2>
                        <p className="pt-2 text-[9px] font-semibold leading-relaxed text-slate-500">Input VAT and eTIMS filing are not connected, so this is not a complete tax liability.</p>
                    </div>
                    <ShieldCheck size={80} className="absolute -bottom-6 -right-6 text-primary/5 -rotate-12" />
                </div>
            </div>
            {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</p>}
        </Card>
    );
}
