'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { ShieldCheck, ShieldAlert, Database, Info, RefreshCw } from 'lucide-react';

interface DataQualityAlert {
    id: number;
    issue_type: string;
    severity: string | null;
    description: string | null;
    affected_count: number | null;
    status: string | null;
    created_at: string;
}

interface GovernanceResponse {
    consentRecords: number;
    profiles: number;
    alerts: DataQualityAlert[];
    error?: string;
}

export default function DataGovernance() {
    const [stats, setStats] = React.useState({
        consentRecords: null as number | null,
        profiles: null as number | null,
        alerts: [] as DataQualityAlert[],
        loading: true,
        error: null as string | null
    });

    const fetchGovernance = React.useCallback(async () => {
        setStats(prev => ({ ...prev, loading: true, error: null }));
        try {
            const response = await fetch('/api/admin/governance', { cache: 'no-store' });
            const result = await response.json() as GovernanceResponse;
            if (!response.ok) throw new Error(result.error || 'Governance data could not be loaded.');
            setStats({
                consentRecords: result.consentRecords,
                profiles: result.profiles,
                alerts: result.alerts,
                loading: false,
                error: null
            });
        } catch (err) {
            console.error('Governance data failed to load:', err);
            setStats(prev => ({
                ...prev,
                loading: false,
                error: err instanceof Error ? err.message : 'Governance data could not be loaded.'
            }));
        }
    }, []);

    React.useEffect(() => {
        fetchGovernance();
    }, [fetchGovernance]);

    return (
        <Card className="space-y-6 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm sm:space-y-8 sm:rounded-3xl sm:p-8">
            <div className="flex min-w-0 flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-between sm:px-2">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm sm:h-12 sm:w-12">
                        <Database size={24} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-tighter text-foreground sm:text-xl">Governance Center</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Privacy & Data Integrity Node</p>
                    </div>
                </div>
                <div className="flex w-fit items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[9px] font-black uppercase text-slate-600">
                    <Database size={12} /> {stats.error ? 'Data unavailable' : stats.loading ? 'Loading records' : 'Live records'}
                </div>
            </div>

            {stats.error && (
                <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
                    <p className="break-words">{stats.error}</p>
                    <button type="button" onClick={fetchGovernance} className="inline-flex shrink-0 items-center gap-2 font-bold hover:underline">
                        <RefreshCw size={14} /> Retry
                    </button>
                </div>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
                <div className="min-w-0 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:rounded-[2rem] sm:p-6">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Consent Records</p>
                    <p className="break-words text-xl font-black text-foreground sm:text-2xl">{stats.loading ? '…' : stats.consentRecords?.toLocaleString() ?? 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:rounded-[2rem] sm:p-6">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Registered Profiles</p>
                    <p className="break-words text-xl font-black text-foreground sm:text-2xl">{stats.loading ? '…' : stats.profiles?.toLocaleString() ?? 'Unavailable'}</p>
                </div>
                <div className="min-w-0 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:rounded-[2rem] sm:p-6">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Retention Policy</p>
                    <p className="text-2xl font-black text-foreground">Not tracked</p>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Integrity Alerts</h4>
                {stats.loading ? (
                    <p className="p-8 text-center text-sm text-slate-500">Loading data quality alerts…</p>
                ) : stats.error ? (
                    <p className="p-8 text-center text-sm text-slate-500">Data quality alerts are unavailable.</p>
                ) : stats.alerts.length === 0 ? (
                    <div className="p-8 text-center bg-emerald-50/30 rounded-[2rem] border border-emerald-100/50 border-dashed">
                        <ShieldCheck size={32} className="mx-auto mb-3 text-emerald-200" />
                        <p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest">No open data quality alerts</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {stats.alerts.map(alert => (
                            <div key={alert.id} className="flex min-w-0 items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                                    <ShieldAlert size={16} className="mt-0.5 shrink-0 text-rose-500" />
                                    <div className="min-w-0">
                                        <p className="break-words text-[10px] font-black uppercase text-rose-700">{alert.issue_type}</p>
                                        <p className="break-words text-[8px] font-medium italic text-rose-500">{alert.description || 'No description provided.'}</p>
                                    </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-[2rem] flex items-start gap-4">
                <Info size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-indigo-700 font-medium leading-relaxed italic">
                    Consent record counts reflect the database. Retention periods and deletion-request handling are not verified by this dashboard.
                </p>
            </div>
        </Card>
    );
}
