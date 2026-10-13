'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import {
    Rocket,
    Send,
    MessageCircle,
    CheckCircle2,
    Loader2,
    Users,
    Activity,
    Plus,
    Target,
    AlertCircle,
    RefreshCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

export default function MarketingCommandCenter() {
    const [title, setTitle] = React.useState('');
    const [message, setMessage] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [statusMessage, setStatusMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [campaigns, setCampaigns] = React.useState<{ id: string, name: string, base_message: string | null, status: string, created_at: string }[]>([]);
    const [marketingStats, setMarketingStats] = React.useState<{ drafts: number | null; audiences: number | null }>({ drafts: null, audiences: null });
    const [loadError, setLoadError] = React.useState<string | null>(null);

    const fetchCampaigns = React.useCallback(async () => {
        if (!supabase) {
            setLoadError('Supabase is not configured. Campaign and audience data are unavailable.');
            setMarketingStats({ drafts: null, audiences: null });
            setCampaigns([]);
            return;
        }
        try {
            setLoadError(null);
            const [campRes, draftCountRes, audienceCountRes] = await Promise.all([
                supabase.from('marketing_campaigns').select('id, name, base_message, status, created_at').order('created_at', { ascending: false }).limit(5),
                supabase.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'Draft'),
                supabase.from('audience_segments').select('id', { count: 'exact', head: true })
            ]);
            if (campRes.error) throw campRes.error;
            if (draftCountRes.error) throw draftCountRes.error;
            if (audienceCountRes.error) throw audienceCountRes.error;
            setCampaigns(campRes.data || []);
            setMarketingStats({ drafts: draftCountRes.count, audiences: audienceCountRes.count });
        } catch (err) {
            console.error('Marketing dashboard data failed to load:', err);
            setLoadError(err instanceof Error ? err.message : 'Campaign and audience data could not be loaded.');
            setMarketingStats({ drafts: null, audiences: null });
            setCampaigns([]);
        }
    }, []);

    React.useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    const handleSaveDraft = async () => {
        if (!title.trim() || !message.trim()) return;
        if (!supabase) {
            setStatusMessage({ type: 'error', text: 'Supabase is not configured. The campaign draft was not saved.' });
            return;
        }
        setLoading(true);
        setStatusMessage(null);
        try {
            const { error } = await supabase.from('marketing_campaigns').insert({
                name: title.trim(),
                base_message: message.trim(),
                type: 'Message',
                status: 'Draft'
            });
            if (error) throw error;
            setStatusMessage({ type: 'success', text: 'Campaign draft saved. No message was sent.' });
            setTitle('');
            setMessage('');
            await fetchCampaigns();
        } catch (err) {
            console.error('Campaign draft could not be saved:', err);
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Campaign draft could not be saved.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-w-0 space-y-6 text-left selection:bg-primary/20 animate-in fade-in duration-1000 sm:space-y-8">

            {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadError}</p>}
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                    { label: 'Saved Drafts', val: marketingStats.drafts?.toLocaleString() ?? 'Unavailable', icon: Target, color: 'primary' },
                    { label: 'Saved Audiences', val: marketingStats.audiences?.toLocaleString() ?? 'Unavailable', icon: Users, color: 'indigo' },
                    { label: 'External Messages', val: 'Not connected', icon: MessageCircle, color: 'emerald' },
                    { label: 'Campaign Attribution', val: 'Unavailable', icon: Activity, color: 'rose' },
                ].map((item) => (
                    <Card key={item.label} className="flex min-h-52 min-w-0 flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 text-center shadow-sm transition-all group hover:shadow-xl sm:min-h-56 sm:p-6">
                        <div className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-inner transition-transform group-hover:scale-110",
                            item.color === 'primary' ? "bg-primary/10 text-primary" :
                            item.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                            item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
                            "bg-rose-50 text-rose-500"
                        )}>
                            <item.icon size={24} />
                        </div>
                        <div className="w-full min-w-0 space-y-2">
                            <p className="break-words text-[10px] font-black uppercase leading-snug tracking-[0.12em] text-slate-400">{item.label}</p>
                            <h3 className="break-words text-xl font-black uppercase leading-tight tracking-tight text-foreground sm:text-2xl">{item.val}</h3>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid min-w-0 gap-6 lg:grid-cols-12 lg:gap-8">

                {/* 2. CAMPAIGN BUILDER */}
                <div className="min-w-0 space-y-6 text-left sm:space-y-8 lg:col-span-7">
                    <Card className="space-y-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:space-y-8 sm:rounded-[2rem] sm:p-7 lg:space-y-10 lg:rounded-[3.5rem] lg:p-10">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 pb-6 sm:pb-8">
                            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner"><Plus size={24} /></div>
                                <div>
                                    <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter leading-none">New Campaign</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Multi-Channel Orchestration</p>
                                </div>
                            </div>
                            {statusMessage && (
                                <div role={statusMessage.type === 'error' ? 'alert' : 'status'} className={cn(
                                    "px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 animate-in slide-in-from-top-2",
                                    statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                )}>
                                    {statusMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                    {statusMessage.text}
                                </div>
                            )}
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Campaign Headline</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" placeholder="e.g. Premium Weekend Drop" />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center px-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Draft Message</label>
                                </div>
                                <Textarea value={message} onChange={e => setMessage(e.target.value)} className="min-h-[120px] rounded-3xl bg-slate-50 border-slate-100 p-6 resize-none font-medium text-slate-600" placeholder="Describe the mission creative..." />
                            </div>

                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                                This saves a draft only. External delivery, audience targeting, and campaign-attributed sales are not connected.
                            </p>
                        </div>

                        <Button onClick={handleSaveDraft} disabled={loading || !title.trim() || !message.trim()} className="w-full h-18 rounded-[2rem] bg-primary text-white font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-4 group/btn">
                            {loading ? <Loader2 className="animate-spin" /> : <><Send className="h-5 w-5" /> Save Campaign Draft</>}
                        </Button>
                    </Card>
                </div>

                {/* 3. CAMPAIGN HISTORY */}
                <div className="min-w-0 space-y-6 text-left sm:space-y-8 lg:col-span-5">
                    <Card className="h-full min-w-0 space-y-6 rounded-3xl border border-slate-100 bg-slate-50 p-5 shadow-inner sm:space-y-8 sm:rounded-[2rem] sm:p-7 lg:rounded-[3.5rem] lg:p-10">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="min-w-0 break-words text-xl font-black uppercase tracking-tighter text-foreground">Mission Log</h3>
                            <button onClick={fetchCampaigns} className="text-slate-300 hover:text-primary transition-colors"><RefreshCcw size={18} /></button>
                        </div>

                        <div className="space-y-4 max-h-[600px] overflow-y-auto no-scrollbar pr-2">
                            {campaigns.map(c => (
                                <div key={c.id} className="p-6 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm space-y-4 group hover:shadow-xl transition-all">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase text-foreground truncate max-w-[200px]">{c.name}</p>
                                            {c.base_message && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{c.base_message}</p>}
                                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(c.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[7px] font-black uppercase",
                                            c.status === 'Draft' ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"
                                        )}>{c.status}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Saved in Supabase. No external message sent.</p>
                                </div>
                            ))}
                            {campaigns.length === 0 && (
                                <div className="py-20 text-center opacity-30">
                                    <Rocket size={48} className="mx-auto mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">{loadError ? 'Campaign records unavailable.' : 'No saved campaign drafts.'}</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

            </div>
        </div>
    );
}
