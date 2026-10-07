'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Zap, RefreshCcw, AlertCircle, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ReconciliationRow } from '@/lib/adminFinanceTypes';

export default function ReconciliationEngine({ records, error, onRefresh, loading }: {
    records: ReconciliationRow[];
    error: string | null;
    onRefresh: () => void;
    loading: boolean;
}) {
    const stats = React.useMemo(() => {
        const unmatched = records.filter(row => !row.is_matched);
        const matchedCount = records.length - unmatched.length;
        return {
            total_count: records.length,
            unmatched_count: unmatched.length,
            unmatched_value: unmatched.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            matched_count: matchedCount,
            match_rate: records.length > 0 ? Math.round((matchedCount / records.length) * 100) : null
        };
    }, [records]);

    return (
        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 text-left overflow-hidden relative">
            <header className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 shadow-sm">
                        <Zap size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Reconciliation Records</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Saved payment reconciliation data</p>
                    </div>
                </div>
                <Button onClick={onRefresh} disabled={loading} variant="outline" className="h-12 rounded-xl font-black uppercase text-[10px] tracking-widest">
                    {loading ? <Loader2 className="animate-spin mr-2" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                    Refresh Records
                </Button>
            </header>

            {error && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    Reconciliation data unavailable: {error}
                </p>
            )}

            {!error && stats.total_count === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No reconciliation records are currently stored.
                </p>
            )}

            {!error && stats.total_count > 0 && (
            <div className="grid sm:grid-cols-2 gap-8">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] space-y-6">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-slate-400">Recorded Match Rate</span>
                        <span className="text-sm font-black text-foreground">{stats.match_rate === null ? '—' : `${stats.match_rate}%`}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white rounded-full overflow-hidden border border-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${stats.match_rate || 0}%` }} />
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-600">
                            <span className="text-[9px] font-black uppercase">{stats.matched_count} of {stats.total_count} records marked matched</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-6 rounded-3xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <AlertCircle className={stats.unmatched_count > 0 ? 'text-rose-500' : 'text-slate-300'} size={20} />
                            <div>
                                <p className="text-[9px] font-black uppercase text-slate-700">{stats.unmatched_count} unmatched entries</p>
                                <p className="text-sm font-black text-slate-700">{formatPrice(stats.unmatched_value)} recorded amount</p>
                            </div>
                        </div>
                    </div>

                    <p className="text-[9px] text-slate-400 font-medium leading-relaxed px-2">
                        These figures reflect records in the reconciliation staging table only. No automatic matching is available.
                    </p>
                </div>
            </div>
            )}

            <Zap className="absolute -bottom-10 -left-10 h-64 w-64 text-emerald-500/5 rotate-12 -z-0" />
        </Card>
    );
}
