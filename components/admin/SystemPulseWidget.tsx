'use client';

import * as React from 'react';
import { Activity, Database, Globe, Truck, CheckCircle2, ShieldAlert, Power } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function SystemPulseWidget() {
    const [latency, setLatency] = React.useState<{ db: number | null; api: null; logistics: null }>({ db: null, api: null, logistics: null });
    const [status, setStatus] = React.useState({ db: 'checking', api: 'not monitored', logistics: 'not monitored' });
    const [killSwitchActive, setKillSwitchActive] = React.useState<boolean | null>(null);
    const [settingsError, setSettingsError] = React.useState<string | null>(null);
    const [savingLockdown, setSavingLockdown] = React.useState(false);

    React.useEffect(() => {
        async function checkLatency() {
            const start = performance.now();
            try {
                const response = await fetch('/api/admin/system-lockdown', { cache: 'no-store' });
                const result = await response.json() as { active?: boolean; error?: string };
                if (!response.ok) throw new Error(result.error || 'System status could not be loaded.');
                if (typeof result.active !== 'boolean') throw new Error('System status response was invalid.');
                const end = performance.now();

                setLatency(prev => ({ ...prev, db: Math.round(end - start) }));
                setStatus(prev => ({ ...prev, db: 'online' }));
                setKillSwitchActive(result.active);
            } catch (error) {
                console.error('System status check failed:', error);
                setStatus(prev => ({ ...prev, db: 'unavailable' }));
                setLatency(prev => ({ ...prev, db: null }));
                setKillSwitchActive(null);
            }
        }

        void checkLatency();
        const interval = setInterval(() => void checkLatency(), 15000);
        return () => clearInterval(interval);
    }, []);

    const metrics = [
        { label: 'Cellar DB', val: latency.db === null ? '—' : `${latency.db}ms`, icon: Database, status: status.db },
        { label: 'Menu API', val: '—', icon: Globe, status: status.api },
        { label: 'Runners', val: '—', icon: Truck, status: status.logistics },
    ];

    const toggleKillSwitch = async () => {
        if (killSwitchActive === null || savingLockdown) return;
        const next = !killSwitchActive;
        const confirmed = window.confirm(
            next
                ? 'Initiate system lockdown? New checkout orders will be paused.'
                : 'Deactivate system lockdown and resume checkout orders?'
        );
        if (!confirmed) return;
        setSavingLockdown(true);
        setSettingsError(null);
        try {
            const response = await fetch('/api/admin/system-lockdown', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: next })
            });
            const result = await response.json() as { active?: boolean; error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not save the lockdown setting.');
            if (typeof result.active !== 'boolean') throw new Error('Lockdown update response was invalid.');
            setKillSwitchActive(result.active);
        } catch (error) {
            console.error('Could not save the system lockdown setting:', error);
            setSettingsError(error instanceof Error ? error.message : 'Could not save the lockdown setting.');
        } finally {
            setSavingLockdown(false);
        }
    };

    return (
        <div className="p-8 rounded-[3rem] bg-white text-foreground border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="relative z-10 space-y-6">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary animate-pulse" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary">Cellar Pulse</h3>
                    </div>
                    {status.db === 'online' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                        <ShieldAlert className="h-4 w-4 text-rose-500 animate-bounce" />
                    )}
                </div>

                <div className="space-y-4">
                    {metrics.map(m => (
                        <div key={m.label} className="flex justify-between items-center group/item">
                            <div className="flex items-center gap-3">
                                <m.icon className="h-3 w-3 text-slate-300 group-hover/item:text-primary transition-colors" />
                                <span className="text-[9px] font-black uppercase text-slate-500">{m.label}</span>
                            </div>
                            <div className="text-right">
                                <span className={cn(
                                    "text-[8px] font-black uppercase block",
                                    m.status === 'online' ? "text-emerald-500" : "text-slate-400"
                                )}>{m.status}</span>
                                <span className="text-[7px] font-bold text-slate-400 uppercase">{m.val}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pt-6 border-t border-slate-100 space-y-4">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Kill Switch</span>
                        <span className={cn(
                            "text-[7px] font-black uppercase",
                            killSwitchActive === true ? "text-rose-600 animate-pulse" : "text-slate-300"
                        )}>{killSwitchActive === null ? 'STATUS UNAVAILABLE' : killSwitchActive ? 'LOCKDOWN ACTIVE' : 'INACTIVE'}</span>
                    </div>
                    {settingsError && <p role="alert" className="text-xs text-rose-600">{settingsError}</p>}
                    <Button
                        onClick={toggleKillSwitch}
                        variant={killSwitchActive === true ? 'default' : 'outline'}
                        disabled={killSwitchActive === null || savingLockdown}
                        className={cn(
                            "w-full h-12 rounded-xl text-[9px] font-black uppercase transition-all active:scale-95",
                            killSwitchActive === true ? "bg-rose-600 text-white border-rose-600" : "border-slate-100 text-slate-400 hover:text-rose-600 hover:border-rose-100"
                        )}
                    >
                        <Power className="h-3 w-3 mr-2" />
                        {savingLockdown ? 'Saving…' : killSwitchActive === null ? 'Unavailable' : killSwitchActive ? 'Deactivate Lockdown' : 'Initiate Lockdown'}
                    </Button>
                </div>
            </div>

            <Activity className="absolute -bottom-10 -left-10 h-48 w-48 text-primary/5 -z-0 rotate-12" />
        </div>
    );
}
