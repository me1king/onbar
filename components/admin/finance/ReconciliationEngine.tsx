'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Zap, RefreshCcw, AlertCircle, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function ReconciliationEngine() {
    const [stats, setStats] = React.useState<{
        total_count: number;
        unmatched_count: number;
        unmatched_value: number;
        matched_count: number;
        match_rate: number | null;
    } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);

    const fetchReconStats = React.useCallback(async () => {
        if (!supabase) {
            setLoadError('Supabase is not configured. Reconciliation records are unavailable.');
            setStats(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.from('reconciliation_staging').select('is_matched, amount');
            if (error) throw error;
            const rows = data || [];
            const unmatched = rows.filter(row => !row.is_matched);
            const matchedCount = rows.length - unmatched.length;

            setStats({
                total_count: rows.length,
                unmatched_count: unmatched.length,
                unmatched_value: unmatched.reduce((sum, row) => sum + Number(row.amount || 0), 0),
                matched_count: matchedCount,
                match_rate: rows.length > 0 ? Math.round((matchedCount / rows.length) * 100) : null
            });
            setLoadError(null);
        } catch (error) {
            console.error('Could not load reconciliation records:', error);
            setLoadError(error instanceof Error ? error.message : 'Reconciliation records could not be loaded.');
            setStats(null);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchReconStats();
    }, [fetchReconStats]);

    if (loading) return <div className="h-64 bg-slate-50 rounded-[3rem] animate-pulse" />;

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
                <Button onClick={fetchReconStats} disabled={loading} variant="outline" className="h-12 rounded-xl font-black uppercase text-[10px] tracking-widest">
                    {loading ? <Loader2 className="animate-spin mr-2" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                    Refresh Records
                </Button>
            </header>

            {loadError && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    Reconciliation data unavailable: {loadError}
                </p>
            )}

            {stats && stats.total_count === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No reconciliation records are currently stored.
                </p>
            )}

            {stats && stats.total_count > 0 && (
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
