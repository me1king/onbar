'use client';

import * as React from 'react';
import { Smartphone, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface MobileWidget {
    id: string;
    title: string;
}

export default function MobileWidgetStats() {
    const [widgets, setWidgets] = React.useState<MobileWidget[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        async function fetchWidgets() {
            try {
                const response = await fetch('/api/admin/mobile-widgets', { cache: 'no-store' });
                const result = await response.json() as { widgets?: MobileWidget[]; error?: string };
                if (!response.ok) throw new Error(result.error || 'Mobile widget configuration could not be loaded.');
                setWidgets((result.widgets || []).map(widget => ({ id: widget.id, title: widget.title })));
            } catch (err) {
                console.error('Unable to load mobile widget configuration:', err);
                setError(err instanceof Error ? err.message : 'Mobile widget configuration could not be loaded.');
            }
            setLoading(false);
        }

        fetchWidgets();
    }, []);

    if (loading) return <div className="h-64 bg-slate-50 rounded-[3rem] animate-pulse" />;

    return (
        <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-8 text-left">
            <header className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Smartphone size={20} />
                </div>
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Widget Analytics</h2>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Performance event tracking</p>
                </div>
            </header>

            {error && (
                <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
                Impressions, clicks, conversion rate, and attributed revenue are unavailable because widget interaction tracking is not configured.
            </div>

            {widgets.length === 0 && !error ? (
                <p className="py-6 text-center text-sm font-semibold text-slate-500">No mobile widgets are configured.</p>
            ) : (
                <div className="space-y-3">
                    {widgets.map(widget => (
                        <div key={widget.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <p className="truncate text-xs font-black uppercase text-foreground">{widget.title}</p>
                            <span className="shrink-0 text-[9px] font-black uppercase text-slate-400">Analytics unavailable</span>
                        </div>
                    ))}
                </div>
            )}

            <p className="border-t border-slate-100 pt-5 text-[9px] font-black uppercase text-slate-400">
                {widgets.length.toLocaleString()} configured widgets
            </p>
        </Card>
    );
}
