'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Link2,
    RefreshCcw,
    Camera as Instagram,
    MessageCircle,
    Music,
    Globe,
    AlertCircle
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SocialAccount {
    id: string;
    platform: string;
    account_name: string;
    status: string;
    expires_at: string | null;
}

export default function ChannelConnector() {
    const [accounts, setAccounts] = React.useState<SocialAccount[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const fetchAccounts = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (!supabase) throw new Error('Supabase is not configured. Saved channel details are unavailable.');
            const { data, error: queryError } = await supabase.from('social_accounts').select('*').order('platform');
            if (queryError) throw queryError;
            setAccounts((data || []) as SocialAccount[]);
        } catch (err) {
            console.error('Unable to load saved channel details:', err);
            setAccounts([]);
            setError(err instanceof Error ? err.message : 'Saved channel details could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const platforms = [
        { id: 'INSTAGRAM', label: 'Instagram', icon: Instagram, color: 'text-rose-500', bg: 'bg-rose-50' },
        { id: 'TIKTOK', label: 'TikTok', icon: Music, color: 'text-black', bg: 'bg-slate-100' },
        { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { id: 'X', label: 'X (Twitter)', icon: Globe, color: 'text-sky-500', bg: 'bg-sky-50' },
    ];

    return (
        <Card className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-8 text-left">
            <header className="flex justify-between items-center px-2">
                <div className="flex items-center gap-3">
                    <Link2 className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">Channel Links</h3>
                </div>
                <button onClick={fetchAccounts} className="text-slate-300 hover:text-primary transition-colors">
                    <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                </button>
            </header>

            <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
                Social OAuth and publishing adapters are not configured. Saved account rows are not proof of a verified connection, and this screen cannot connect or publish to a platform.
            </div>
            {error && (
                <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid gap-4">
                {platforms.map(p => {
                    const connected = accounts.find(a => a.platform === p.id);
                    return (
                        <div key={p.id} className={cn(
                            "p-5 rounded-2xl border transition-all flex items-center justify-between group",
                            connected ? "bg-white border-slate-100 shadow-sm" : "bg-slate-50 border-transparent opacity-60 grayscale"
                        )}>
                            <div className="flex items-center gap-4">
                                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shadow-inner", p.bg, p.color)}>
                                    <p.icon size={20} />
                                </div>
                                <div className="text-left">
                                    <p className="text-[11px] font-black uppercase text-foreground leading-none">{p.label}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                        {connected ? `Saved, not verified: ${connected.account_name}` : 'Not connected'}
                                    </p>
                                </div>
                            </div>

                            <span className="shrink-0 text-[9px] font-black uppercase text-slate-400">
                                {loading ? 'Loading' : connected ? 'Unverified' : 'Unavailable'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
