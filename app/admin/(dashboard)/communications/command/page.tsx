'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Plus,
    Users,
    Globe,
    FileText,
    ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import AudienceBuilder from '@/components/admin/growth/AudienceBuilder';

export default function MessageCommandCenter() {
    const [stats, setStats] = React.useState<{ drafts: number | null; audiences: number | null }>({ drafts: null, audiences: null });
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const fetchStats = React.useCallback(async () => {
        if (!supabase) {
            setError('Supabase is not configured. Campaign and audience totals are unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [audiencesRes, draftsRes] = await Promise.all([
                supabase.from('audience_segments').select('id', { count: 'exact', head: true }),
                supabase.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'Draft')
            ]);
            if (audiencesRes.error) throw audiencesRes.error;
            if (draftsRes.error) throw draftsRes.error;
            setStats({ drafts: draftsRes.count, audiences: audiencesRes.count });
        } catch (err) {
            console.error('Campaign dashboard totals failed to load:', err);
            setError(err instanceof Error ? err.message : 'Campaign dashboard totals are unavailable.');
            setStats({ drafts: null, audiences: null });
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void fetchStats();
    }, [fetchStats]);

    return (
        <div className="space-y-8 bg-slate-50 min-h-screen p-4 sm:p-8 text-left selection:bg-primary/20 pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Campaign workspace</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-foreground uppercase tracking-tighter leading-none">Campaign workspace</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-2">Review saved campaign drafts and customer audiences.</p>
                </div>

                <div className="flex w-full sm:w-auto">
                    <Button asChild className="w-full sm:w-auto rounded-xl h-12 px-6 sm:px-8 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
                        <Link href="/admin/marketing/create">
                            <Plus className="h-4 w-4 mr-2" /> New Campaign Draft
                        </Link>
                    </Button>
                </div>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6">
                {[
                    { label: 'Saved Campaign Drafts', val: loading ? 'Loading' : stats.drafts?.toLocaleString() ?? 'Unavailable', icon: FileText },
                    { label: 'Customer Audiences', val: loading ? 'Loading' : stats.audiences?.toLocaleString() ?? 'Unavailable', icon: Users },
                    { label: 'External Messages Sent', val: 'Not connected', icon: Globe },
                    { label: 'Attributed Campaign Revenue', val: 'Unavailable', icon: ExternalLink },
                ].map((node) => (
                    <Card key={node.label} className="min-w-0 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <node.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{node.label}</p>
                            <h3 className="mt-1 break-words text-lg sm:text-xl font-black text-foreground">{node.val}</h3>
                        </div>
                    </Card>
                ))}
            </div>

            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                Campaign creation currently saves drafts only. No email, SMS, WhatsApp, or social publishing provider is connected, so this page does not send messages or report delivery/open rates.
            </p>

            <div className="grid lg:grid-cols-2 gap-6">
                <div>
                    <AudienceBuilder />
                </div>

                <Card className="space-y-4 p-5 sm:p-8">
                    <h2 className="text-lg font-black uppercase text-foreground">Publishing status</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Campaign records remain drafts until a delivery provider is configured and connected. Delivery status, opens, and campaign-attributed sales are not available from the current integrations.
                    </p>
                    <Button variant="outline" onClick={() => void fetchStats()} disabled={loading}>
                        Refresh draft and audience totals
                    </Button>
                </Card>
            </div>
        </div>
    );
}
