'use client';

import * as React from 'react';
import {
    ShieldAlert,
    Lock,
    Key,
    Activity,
    ShieldCheck,
    Smartphone,
    Globe,
    History,
    RefreshCcw,
    Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';

interface LoginAttempt {
    id: string;
    ip_address: string;
    success: boolean;
    mode: string;
    identity_hint: string;
    reason: string;
    user_agent: string | null;
    attempt_time: string;
}

interface ThreatReport {
    id: string;
    type: string;
    severity: string;
    description: string;
    status: string;
    ip_address: string | null;
    created_at: string;
}

export default function SecurityHub() {
    const { role } = useAdmin();
    const [attempts, setAttempts] = React.useState<LoginAttempt[]>([]);
    const [threats, setThreats] = React.useState<ThreatReport[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [actionInProgress, setActionInProgress] = React.useState<string | null>(null);

    const fetchSecurityData = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/admin/security-logs', { cache: 'no-store' });
            const result = await response.json() as {
                attempts?: LoginAttempt[];
                threats?: ThreatReport[];
                error?: string;
            };
            if (!response.ok) throw new Error(result.error || 'Could not load security records.');
            setAttempts(result.attempts || []);
            setThreats(result.threats || []);
        } catch (fetchError) {
            const message = fetchError instanceof Error ? fetchError.message : 'Could not load security records.';
            setError(message);
            console.error('[SecurityHub] Could not load security records:', fetchError);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateThreat = async (threatId: string, action: 'block' | 'ignore') => {
        setActionInProgress(threatId);
        try {
            const response = await fetch('/api/admin/security-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threatId, action })
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not update security threat.');
            await fetchSecurityData();
        } catch (actionError) {
            const message = actionError instanceof Error ? actionError.message : 'Could not update security threat.';
            setError(message);
        } finally {
            setActionInProgress(null);
        }
    };

    const exportAttempts = () => {
        const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
        const rows = [
            ['Time', 'Result', 'Mode', 'Identity', 'Origin IP', 'Reason', 'User agent'],
            ...attempts.map(attempt => [
                attempt.attempt_time,
                attempt.success ? 'Authorized' : 'Denied',
                attempt.mode,
                attempt.identity_hint,
                attempt.ip_address,
                attempt.reason,
                attempt.user_agent || ''
            ])
        ];
        const csv = rows.map(row => row.map(value => quote(String(value))).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'onlinebar-authentication-logs.csv';
        anchor.click();
        URL.revokeObjectURL(url);
    };

    React.useEffect(() => {
        fetchSecurityData();
    }, [fetchSecurityData]);

    const activeThreats = threats.filter(threat => threat.status === 'OPEN');

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8 lg:space-y-10 bg-slate-50 min-h-screen text-left pb-12">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Fortress Protocol</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Security Hub</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-2">Global infrastructure security and authentication auditing.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={fetchSecurityData} variant="outline" className="rounded-xl h-12 px-6 border-slate-200 bg-white text-foreground font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                        <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Sync Audit
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
                <Card className="p-10 rounded-[3rem] bg-white border border-slate-100 shadow-sm relative overflow-hidden group h-full">
                    <div className="relative z-10 space-y-6 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex justify-between items-center mb-8">
                                <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shadow-sm"><Lock size={24} /></div>
                                <span className={cn(
                                    "px-4 py-1.5 text-[10px] font-black rounded-full uppercase tracking-widest border animate-pulse",
                                    error ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    loading ? "bg-slate-50 text-slate-500 border-slate-200" :
                                    activeThreats.length > 0 ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                )}>
                                    {error ? 'Uplink Error' : loading ? 'Checking' : activeThreats.length > 0 ? 'Threat Detected' : 'Armed'}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Authorization Layer</p>
                                <h3 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none">RBAC System Live</h3>
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 h-full items-stretch">
                    {[
                        { label: 'Session Signature', val: 'HMAC-SHA256', icon: ShieldCheck, color: 'emerald' },
                        { label: 'Authentication Log', val: error ? 'Unavailable' : loading ? 'Checking' : 'API Connected', icon: Activity, color: 'primary' },
                        { label: 'Login Throttle', val: '15-Minute Window', icon: Globe, color: 'indigo' },
                        { label: 'Session Cookie', val: 'HttpOnly / SameSite', icon: Smartphone, color: 'primary' },
                    ].map((item) => (
                        <Card key={item.label} className="p-8 rounded-[2.5rem] border border-slate-100 bg-white shadow-sm flex items-center gap-8 group hover:border-primary/20 transition-all h-full">
                            <div className={cn(
                                "h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 shrink-0 shadow-sm",
                                item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
                                item.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                                "bg-primary/5 text-primary"
                            )}>
                                <item.icon className="h-7 w-7" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{item.label}</p>
                                <h3 className="text-lg font-black text-foreground uppercase tracking-tight">{item.val}</h3>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            <div className="grid xl:grid-cols-12 gap-8 xl:gap-10">
                <div className="min-w-0 xl:col-span-8 space-y-10 xl:space-y-12">
                    <section className="space-y-8">
                        <div className="flex items-center justify-between px-4 shrink-0">
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Bar Shield: Intelligence</h2>
                            <span className="text-[10px] font-black uppercase text-rose-500 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100">{activeThreats.length} Active Threats</span>
                        </div>

                        <div className="grid gap-4">
                            {error ? (
                                <div role="alert" className="p-8 rounded-3xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700">{error}</div>
                            ) : loading ? (
                                <div className="p-12 text-center text-slate-400 font-bold">Loading security events...</div>
                            ) : activeThreats.length === 0 ? (
                                <div className="p-16 text-center bg-white rounded-[3rem] border border-slate-100 opacity-40">
                                    <ShieldCheck className="h-10 w-10 mx-auto mb-4 text-emerald-500" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No active threats detected by the Core Grid.</p>
                                </div>
                            ) : activeThreats.map(t => (
                                <Card key={t.id} className="p-8 rounded-[3rem] border border-rose-100 bg-white shadow-sm flex items-center justify-between group hover:shadow-xl transition-all">
                                    <div className="flex items-center gap-6 text-left">
                                        <div className="h-14 w-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 shadow-inner">
                                            <ShieldAlert className="h-7 w-7" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">{t.severity}</span>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.type} &bull; {new Date(t.created_at).toLocaleTimeString()}</p>
                                            </div>
                                            <h3 className="font-black text-foreground uppercase text-lg tracking-tighter leading-none">{t.description}</h3>
                                        </div>
                                    </div>
                                    {role === 'owner' ? <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            disabled={actionInProgress === t.id || !t.ip_address || t.ip_address === 'unknown'}
                                            onClick={() => updateThreat(t.id, 'block')}
                                            className="h-10 px-4 rounded-xl bg-rose-600 text-white font-black uppercase text-[9px]"
                                        >Block Origin</Button>
                                        <Button
                                            size="sm"
                                            disabled={actionInProgress === t.id}
                                            onClick={() => updateThreat(t.id, 'ignore')}
                                            variant="outline"
                                            className="h-10 px-4 rounded-xl border-slate-100 text-slate-400 font-black uppercase text-[9px]"
                                        >Ignore</Button>
                                    </div> : <p className="text-xs font-bold text-slate-500">Owner permissions are required to block or dismiss threats.</p>}
                                </Card>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-8">
                        <div className="flex items-center justify-between px-4 shrink-0">
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Authentication Logs</h2>
                            <Button onClick={exportAttempts} variant="ghost" disabled={attempts.length === 0} className="text-[10px] font-black text-primary uppercase underline tracking-widest">Export Loaded History</Button>
                        </div>

                        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
                            {error ? (
                                <div role="alert" className="p-8 text-center font-bold text-rose-600">{error}</div>
                            ) : loading ? (
                                <div className="p-8 text-center font-bold text-slate-400">Loading authentication records...</div>
                            ) : attempts.length === 0 ? (
                                <div className="p-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">No intrusion attempts recorded.</div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {attempts.map(att => (
                                        <li key={att.id} className="grid min-w-0 grid-cols-1 gap-4 p-5 transition-colors hover:bg-primary/5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6 2xl:grid-cols-[minmax(0,1.5fr)_auto_minmax(90px,0.7fr)_auto] 2xl:items-center">
                                            <div className="flex min-w-0 items-center gap-4">
                                                <div className={cn(
                                                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
                                                    att.success ? "bg-emerald-500" : "bg-rose-500"
                                                )}>
                                                    <Key size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="break-words text-sm font-black uppercase tracking-tight text-foreground">{att.identity_hint || 'Login Attempt'}</p>
                                                    <p className="mt-1 break-words text-[9px] font-bold uppercase tracking-widest text-slate-400">{att.mode} &bull; {att.reason}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 sm:justify-start">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 2xl:hidden">Status</span>
                                                <span className={cn(
                                                    "shrink-0 rounded-lg border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest",
                                                    att.success ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-rose-100 bg-rose-50 text-rose-600"
                                                )}>
                                                    {att.success ? 'Authorized' : 'Violation'}
                                                </span>
                                            </div>
                                            <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 2xl:hidden">Origin</span>
                                                <span className="min-w-0 break-all text-right font-mono text-[10px] font-bold tracking-wide text-slate-500 sm:text-left">{att.ip_address || 'Unknown'}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 sm:justify-start 2xl:flex-col 2xl:items-end 2xl:gap-1">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 2xl:hidden">Timestamp</span>
                                                <div className="text-right">
                                                    <p className="text-[11px] font-bold uppercase leading-none text-foreground">{new Date(att.attempt_time).toLocaleTimeString()}</p>
                                                    <p className="mt-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">{new Date(att.attempt_time).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>
                </div>

                <div className="min-w-0 xl:col-span-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-1 xl:space-y-0">
                    <Card className="p-10 rounded-[3rem] border border-slate-100 bg-white shadow-sm relative overflow-hidden group">
                        <div className="relative z-10 space-y-8 text-left">
                            <div className="flex items-center gap-4 text-primary">
                                <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center shadow-inner"><ShieldAlert size={24} /></div>
                                <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">Global Guard</h3>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed italic">
                                Authentication events are recorded server-side with request origin and outcome. Access requires a verified admin session.
                            </p>
                            <div className="pt-6 border-t border-slate-50 flex justify-between items-center">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Stability Level</span>
                                <span className={cn("text-xs font-black tracking-tight", error ? "text-rose-600" : "text-emerald-600")}>{error ? 'Audit Unavailable' : loading ? 'Checking...' : 'Audit Connected'}</span>
                            </div>
                        </div>
                    </Card>

                    <div className="p-10 rounded-[3rem] bg-white border border-slate-100 space-y-8 text-left shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shadow-inner"><History size={20} className="text-slate-400" /></div>
                            <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Infrastructure Pulse</h4>
                        </div>
                        <div className="space-y-5">
                            <div className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-widest sm:flex-row sm:justify-between sm:gap-4 xl:flex-col 2xl:flex-row">
                                <span className="text-slate-400">Transport Security</span>
                                <span className="break-words text-slate-500 sm:text-right xl:text-left 2xl:text-right">Provided by deployment TLS</span>
                            </div>
                            <div className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-widest sm:flex-row sm:justify-between sm:gap-4 xl:flex-col 2xl:flex-row">
                                <span className="text-slate-400">Audit Database Access</span>
                                <span className="break-words text-slate-500 sm:text-right xl:text-left 2xl:text-right">Server-side service role</span>
                            </div>
                            <div className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-widest sm:flex-row sm:justify-between sm:gap-4 xl:flex-col 2xl:flex-row">
                                <span className="text-slate-400">API Gateway</span>
                                <span className="break-words text-primary sm:text-right xl:text-left 2xl:text-right">15-minute login limit</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
