'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { ShieldCheck, ShieldAlert, Database, Info } from 'lucide-react';

interface DataQualityAlert {
    id: number;
    issue_type: string;
    severity: string;
    description: string;
    affected_count: number;
    status: string;
    created_at: string;
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
        if (!supabase) {
            setStats(prev => ({ ...prev, loading: false, error: 'Supabase is not configured. Governance data is unavailable.' }));
            return;
        }
        try {
            const [alertsRes, consentRes, usersRes] = await Promise.all([
                supabase.from('data_quality_alerts').select('*').eq('status', 'OPEN'),
                supabase.from('user_consent').select('id', { count: 'exact', head: true }),
                supabase.from('profiles').select('id', { count: 'exact', head: true })
            ]);
            if (alertsRes.error) throw alertsRes.error;
            if (consentRes.error) throw consentRes.error;
            if (usersRes.error) throw usersRes.error;
            setStats({
                consentRecords: consentRes.count,
                profiles: usersRes.count,
                alerts: alertsRes.data || [],
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
        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 text-left">
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                        <Database size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Governance Center</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Privacy & Data Integrity Node</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 text-slate-600 rounded-full text-[9px] font-black uppercase border border-slate-100">
                    <Database size={12} /> {stats.error ? 'Data unavailable' : stats.loading ? 'Loading records' : 'Live records'}
                </div>
            </div>

            {stats.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{stats.error}</p>}

            <div className="grid sm:grid-cols-3 gap-4">
                <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Consent Records</p>
                    <p className="text-2xl font-black text-foreground">{stats.loading ? '…' : stats.consentRecords?.toLocaleString() ?? 'Unavailable'}</p>
                </div>
                <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Registered Profiles</p>
                    <p className="text-2xl font-black text-foreground">{stats.loading ? '…' : stats.profiles?.toLocaleString() ?? 'Unavailable'}</p>
                </div>
                <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-2">
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
                            <div key={alert.id} className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <ShieldAlert size={16} className="text-rose-500" />
                                    <div>
                                        <p className="text-[10px] font-black text-rose-700 uppercase">{alert.issue_type}</p>
                                        <p className="text-[8px] font-medium text-rose-500 italic">{alert.description}</p>
                                    </div>
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
