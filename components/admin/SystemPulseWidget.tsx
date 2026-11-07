'use client';

import * as React from 'react';
import { Activity, Database, Globe, Truck, CheckCircle2, ShieldAlert, Power, RadioTower } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { readJsonResponse } from '@/lib/readJsonResponse';

type CheckStatus = 'checking' | 'online' | 'slow' | 'unavailable';
type SystemCheck = {
    status: CheckStatus;
    latencyMs: number | null;
    detail: string;
};
type SystemPulse = {
    database: SystemCheck;
    menu: SystemCheck;
    runners: SystemCheck;
    dispatch: SystemCheck;
    checkedAt: string;
};

const checking: SystemCheck = { status: 'checking', latencyMs: null, detail: 'Checking…' };

export default function SystemPulseWidget() {
    const [pulse, setPulse] = React.useState<SystemPulse | null>(null);
    const [killSwitchActive, setKillSwitchActive] = React.useState<boolean | null>(null);
    const [settingsError, setSettingsError] = React.useState<string | null>(null);
    const [savingLockdown, setSavingLockdown] = React.useState(false);

    React.useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let controller: AbortController | null = null;

        async function checkServices() {
            controller = new AbortController();
            const menuPromise = (async (): Promise<SystemCheck> => {
                const startedAt = performance.now();
                try {
                    const response = await fetch('/api/catalog/products?limit=1', {
                        cache: 'no-store',
                        signal: AbortSignal.timeout(10_000)
                    });
                    const result = await readJsonResponse<{ products?: unknown[]; error?: string }>(response, 'Menu API');
                    const latencyMs = Math.round(performance.now() - startedAt);
                    if (!response.ok) {
                        return { status: 'unavailable', latencyMs: null, detail: result.error || `Menu API returned HTTP ${response.status}.` };
                    }
                    return {
                        status: latencyMs > 1500 ? 'slow' : 'online',
                        latencyMs,
                        detail: `${result.products?.length || 0} menu sample returned.`
                    };
                } catch (error) {
                    console.error('Menu API check failed:', error);
                    return {
                        status: 'unavailable',
                        latencyMs: null,
                        detail: error instanceof Error && error.name === 'TimeoutError'
                            ? 'Menu API timed out.'
                            : 'Menu API could not be reached.'
                    };
                }
            })();
            const healthPromise = (async () => {
                const response = await fetch('/api/admin/system-pulse', {
                    cache: 'no-store',
                    signal: controller?.signal
                });
                const result = await readJsonResponse<Omit<SystemPulse, 'menu'> & { error?: string }>(response, 'System monitoring');
                if (!response.ok) throw new Error(result.error || 'System monitoring could not be loaded.');
                if (!result.database || !result.runners || !result.dispatch) {
                    throw new Error('System monitoring returned an incomplete report.');
                }
                return result;
            })();
            const [menu, health] = await Promise.all([
                menuPromise,
                healthPromise.then(result => ({ result }), error => ({ error }))
            ]);

            if (!active) return;
            if ('error' in health) {
                if (!(health.error instanceof DOMException && health.error.name === 'AbortError')) {
                    console.error('System monitoring check failed:', health.error);
                    const detail = health.error instanceof Error ? health.error.message : 'System monitoring could not be loaded.';
                    const unavailable = { ...checking, status: 'unavailable' as const, detail };
                    setPulse({
                        database: unavailable,
                        menu,
                        runners: unavailable,
                        dispatch: unavailable,
                        checkedAt: new Date().toISOString()
                    });
                }
            } else {
                setPulse({ ...health.result, menu });
            }
            if (active) timer = setTimeout(() => void checkServices(), 30_000);
        }

        void checkServices();
        return () => {
            active = false;
            if (timer) clearTimeout(timer);
            controller?.abort();
        };
    }, []);

    React.useEffect(() => {
        let active = true;
        const checkLockdown = async () => {
            try {
                const response = await fetch('/api/admin/system-lockdown', { cache: 'no-store' });
                const result = await readJsonResponse<{ active?: boolean; error?: string }>(response, 'System status');
                if (!response.ok) throw new Error(result.error || 'System status could not be loaded.');
                if (typeof result.active !== 'boolean') throw new Error('System status response was invalid.');
                if (active) setKillSwitchActive(result.active);
            } catch (error) {
                if (!active) return;
                console.error('System status check failed:', error);
                setKillSwitchActive(null);
            }
        };
        void checkLockdown();
        const interval = setInterval(() => void checkLockdown(), 30_000);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, []);

    const allHealthy = Boolean(pulse && [pulse.database, pulse.menu, pulse.runners, pulse.dispatch]
        .every(check => check.status === 'online'));
    const metrics = [
        { label: 'Cellar DB', check: pulse?.database || checking, icon: Database },
        { label: 'Menu API', check: pulse?.menu || checking, icon: Globe },
        { label: 'Runners', check: pulse?.runners || checking, icon: Truck },
        { label: 'Dispatch', check: pulse?.dispatch || checking, icon: RadioTower },
    ];
    const statusTone = (value: CheckStatus) => value === 'online'
        ? 'text-emerald-500'
        : value === 'slow' ? 'text-amber-600' : value === 'checking' ? 'text-slate-400' : 'text-rose-500';
    const serviceAlerts = metrics.filter(metric => metric.check.status === 'slow' || metric.check.status === 'unavailable');

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
            const result = await readJsonResponse<{ active?: boolean; error?: string }>(response, 'System lockdown');
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
                    {allHealthy ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : pulse && [pulse.database, pulse.menu, pulse.runners, pulse.dispatch]
                        .some(check => check.status === 'online' || check.status === 'slow') ? (
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
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
                                    statusTone(m.check.status)
                                )}>{m.check.detail === 'Checking…' ? 'checking' : m.check.status}</span>
                                <span title={m.check.detail} className="max-w-36 break-words text-[7px] font-bold text-slate-400 uppercase">
                                    {m.check.latencyMs === null ? m.check.detail : `${m.check.latencyMs}ms · ${m.check.detail}`}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
                {serviceAlerts.length > 0 && (
                    <div role="alert" className="space-y-1 rounded-xl border border-rose-100 bg-rose-50 p-3 text-[8px] font-bold text-rose-700">
                        {serviceAlerts.map(metric => (
                            <p key={metric.label}><span className="uppercase">{metric.label}:</span> {metric.check.detail}</p>
                        ))}
                    </div>
                )}
                {pulse && <p className="text-right text-[7px] font-bold uppercase text-slate-400">
                    Last checked {new Date(pulse.checkedAt).toLocaleTimeString()}
                </p>}

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
