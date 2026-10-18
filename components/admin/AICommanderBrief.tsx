'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Bot, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import { readJsonResponse } from '@/lib/readJsonResponse';

interface BriefData {
    brief: string;
    autoRate: number | null;
    automationCount: number;
    executedAutomationCount: number;
    exceptionsCount: number;
    periodStart: string;
    generatedAt: string;
}

function formatNairobiTime(value: string, options: Intl.DateTimeFormatOptions) {
    return new Intl.DateTimeFormat('en-KE', {
        ...options,
        timeZone: 'Africa/Nairobi'
    }).format(new Date(value));
}

export default function AICommanderBrief() {
    const [data, setData] = React.useState<BriefData | null>(null);
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(true);

    const generateBrief = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/admin/intelligence/commander-brief', { cache: 'no-store' });
            const result = await readJsonResponse<BriefData & { error?: string }>(response, 'Commander Brief');
            if (!response.ok) throw new Error(result.error || 'Commander Brief metrics are unavailable.');
            setData(result);
        } catch (cause) {
            console.error('[CommanderBrief] Could not refresh brief:', cause);
            setData(null);
            setError(cause instanceof Error ? cause.message : 'Commander Brief metrics are unavailable.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void generateBrief();
    }, [generateBrief]);

    return (
        <Card className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:p-7">
            <div className="relative z-10 space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Bot size={24} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Commander Brief</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Yesterday&apos;s business summary · Nairobi time</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void generateBrief()}
                        disabled={loading}
                        aria-label="Refresh Commander Brief"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center gap-3 py-2 text-sm font-medium text-slate-500" role="status">
                        <RefreshCw className="animate-spin text-primary" size={18} />
                        Loading yesterday&apos;s verified figures…
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800" role="alert">
                        {error}
                    </div>
                ) : data ? (
                    <>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                {formatNairobiTime(data.periodStart, {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                })}
                            </p>
                            <p className="mt-3 text-base leading-relaxed text-slate-700 sm:text-lg">
                                {data.brief}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                                <Zap size={14} />
                                Automation: {data.autoRate === null ? 'No runs' : `${data.autoRate}% (${data.executedAutomationCount}/${data.automationCount})`}
                            </div>
                            <div className="flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
                                <ShieldAlert size={14} />
                                {data.exceptionsCount} open {data.exceptionsCount === 1 ? 'exception' : 'exceptions'}
                            </div>
                        </div>

                        <p className="text-xs text-slate-500">
                            Updated {formatNairobiTime(data.generatedAt, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                            })} EAT
                        </p>
                    </>
                ) : null}
            </div>
        </Card>
    );
}
