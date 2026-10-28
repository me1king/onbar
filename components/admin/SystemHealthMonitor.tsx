'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { ShieldCheck, ShieldAlert, Globe, Activity, Database, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readJsonResponse } from '@/lib/readJsonResponse';

interface HealthReport {
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    total_latency: string;
    database?: { status: string; latency: string; error?: string };
    storage?: { status: string; latency: string };
    warnings?: string[];
    error?: string;
}

export default function SystemHealthMonitor() {
    const [health, setHealth] = React.useState<HealthReport | null>(null);
    const [loading, setLoading] = React.useState(true);

    const fetchHealth = React.useCallback(async () => {
        try {
            const res = await fetch('/api/health');
            const data = await readJsonResponse<HealthReport>(res, 'System health');
            if (!res.ok) throw new Error(data.error || 'System health could not be loaded.');
            setHealth(data);
        } catch (error) {
            console.error('System health could not be loaded:', error);
            setHealth({
                status: 'DOWN',
                error: error instanceof Error ? error.message : 'System health could not be loaded.',
                total_latency: '---'
            });
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 15000); // 15s refresh
        return () => clearInterval(interval);
    }, [fetchHealth]);

    if (loading && !health) return <div className="h-48 bg-slate-50 rounded-[3rem] animate-pulse" />;

    const nodes = [
        { id: 'api', label: 'Primary API', icon: Globe, status: health?.status === 'HEALTHY' ? 'OK' : health?.status === 'DOWN' ? 'ERROR' : 'SLOW', latency: health?.total_latency },
        { id: 'db', label: 'Database Node', icon: Database, status: health?.database?.status === 'OK' ? 'OK' : health?.database?.status === 'SLOW' ? 'SLOW' : 'ERROR', latency: health?.database?.latency },
        { id: 'storage', label: 'Asset Storage', icon: HardDrive, status: health?.storage?.status === 'OK' ? 'OK' : health?.storage?.status === 'SLOW' ? 'SLOW' : 'ERROR', latency: health?.storage?.latency },
        { id: 'network', label: 'Uplink Latency', icon: Activity, status: 'OK', latency: health?.total_latency || '---' }
    ];

    const statusTone = (value: string | undefined) => {
        if (value === 'OK') return 'bg-emerald-50 text-emerald-600';
        if (value === 'SLOW') return 'bg-amber-50 text-amber-700';
        return 'bg-rose-50 text-rose-600';
    };

    return (
        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 text-left relative overflow-hidden group">
            <div className="relative z-10 flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm",
                        health?.status === 'HEALTHY' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                    )}>
                        {health?.status === 'HEALTHY' ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">System Health</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Global Operational Observability</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full text-[9px] font-black uppercase text-slate-500">
                    <div className={cn(
                        "h-1.5 w-1.5 rounded-full animate-pulse",
                        health?.status === 'HEALTHY' ? "bg-emerald-500" : health?.status === 'DEGRADED' ? "bg-amber-500" : "bg-rose-500"
                    )} />
                    {health?.status || 'OFFLINE'}
                </div>
            </div>

            {health?.warnings && health.warnings.length > 0 && (
                <div className="relative z-10 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                    {health.warnings.join(' • ')}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 relative z-10">
                {nodes.map((node) => (
                    <div key={node.id} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-4 group/node hover:bg-white hover:shadow-xl transition-all">
                        <div className="flex justify-between items-start">
                            <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 group-hover/node:text-primary transition-colors shadow-sm">
                                {React.createElement(node.icon, { size: 20 })}
                            </div>
                            <span className={cn(
                                "text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                                statusTone(node.status)
                            )}>
                                {node.status}
                            </span>
                        </div>
                        <div className="text-left">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{node.label}</p>
                            <p className="text-xs font-black text-foreground uppercase tracking-tight">{node.latency || '---'}</p>
                        </div>
                    </div>
                ))}
            </div>

            {health?.error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 relative z-10 animate-in slide-in-from-bottom-2">
                    <ShieldAlert size={14} className="text-rose-500 shrink-0" />
                    <p className="text-[8px] font-black uppercase text-rose-600 truncate">{health.error}</p>
                </div>
            )}
        </Card>
    );
}
