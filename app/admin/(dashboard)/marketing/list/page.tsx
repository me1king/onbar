'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    History,
    Search,
    Filter,
    Activity as Zap,
    Clock,
    CheckCircle2,
    AlertCircle,
    Plus,
    Loader2,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Campaign {
    id: string;
    name: string;
    type: string;
    status: string;
    product_id: number;
    scheduled_at: string | null;
    published_at: string | null;
    created_at: string;
    products?: { name: string };
}

export default function CampaignHistory() {
    const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('all');
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        async function fetchCampaigns() {
            const client = supabase;
            if (!client) {
                setError('Supabase is not configured. Campaign records are unavailable.');
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const { data, error: queryError } = await client
                    .from('marketing_campaigns')
                    .select('*, products(name)')
                    .order('created_at', { ascending: false });

                if (queryError) throw queryError;
                setCampaigns(data || []);
            } catch (fetchError) {
                console.error('Campaign record fetch failed:', fetchError);
                setCampaigns([]);
                setError(fetchError instanceof Error ? fetchError.message : 'Campaign records could not be loaded.');
            } finally {
                setLoading(false);
            }
        }
        fetchCampaigns();
    }, []);

    const filtered = campaigns.filter(c =>
        (statusFilter === 'all' || c.status === statusFilter) &&
        (!searchQuery ||
            (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.type || '').toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const handleDeleteCampaign = async (id: string, name: string) => {
        if (!supabase) {
            setError('Supabase is not configured. The campaign was not deleted.');
            return;
        }
        if (!confirm(`Permanently delete campaign "${name}" and its saved channel copy?`)) return;
        try {
            const { data, error: deleteError } = await supabase
                .from('marketing_campaigns')
                .delete()
                .eq('id', id)
                .select('id')
                .maybeSingle();
            if (deleteError) throw deleteError;
            if (!data) throw new Error('Campaign was not found; no record was deleted.');
            setCampaigns(prev => prev.filter(c => c.id !== id));
            setError(null);
        } catch (err) {
            console.error('Campaign delete failed:', err);
            setError(err instanceof Error ? err.message : 'The campaign could not be deleted.');
        }
    };

    return (
        <div className="p-4 sm:p-8 space-y-8 sm:space-y-10 bg-background min-h-screen text-left pb-40">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-border pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <History className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Saved campaign records</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-foreground uppercase tracking-tighter">Campaign Records</h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Campaigns are drafts; an external publishing or scheduling service is not connected.</p>
                </div>
                <Link href="/lord/marketing/create">
                    <Button className="rounded-xl h-12 px-6 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                        <Plus size={16} className="mr-2" /> New Campaign
                    </Button>
                </Link>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}

            <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by mission name or type..."
                        className="h-14 rounded-2xl bg-card border-border pl-12 text-sm font-bold shadow-sm"
                    />
                </div>
                <label className="flex h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 text-[10px] font-black uppercase text-muted-foreground">
                    <Filter size={16} />
                    <span className="sr-only">Filter campaign status</span>
                    <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="bg-transparent outline-none">
                        <option value="all">All statuses</option>
                        {[...new Set(campaigns.map(campaign => campaign.status))].map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="bg-card rounded-[3rem] border border-border shadow-sm overflow-hidden min-h-[500px]">
                {loading ? (
                    <div className="p-40 text-center flex flex-col items-center gap-4">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Loading campaign records…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-40 text-center space-y-6 opacity-30">
                        <Zap size={64} className="mx-auto" />
                        <p className="text-lg font-black uppercase tracking-tighter">{error ? 'Campaign records unavailable' : 'No campaign records match this filter'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-secondary text-muted-foreground font-black uppercase text-[9px] tracking-[0.2em]">
                                    <th className="px-10 py-6">Campaign</th>
                                    <th className="px-10 py-6">Linked Product</th>
                                    <th className="px-10 py-6">Status</th>
                                    <th className="px-10 py-6">Scheduled</th>
                                    <th className="px-10 py-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.map((camp) => (
                                    <tr key={camp.id} className="hover:bg-secondary/50 transition-colors group">
                                        <td className="px-10 py-8">
                                            <div>
                                                <p className="text-sm font-black text-foreground uppercase tracking-tight">{camp.name}</p>
                                                <p className="text-[9px] font-bold text-primary uppercase mt-1">{camp.type}</p>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                                                    <Zap size={14} />
                                                </div>
                                                <span className="text-[10px] font-black uppercase text-slate-500">{camp.products?.name || 'Product unavailable'}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className={cn(
                                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                                                camp.status === 'Published' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                camp.status === 'Scheduled' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                                                "bg-slate-50 text-slate-500 border-slate-200"
                                            )}>
                                                {camp.status === 'Published' ? <CheckCircle2 size={12} /> :
                                                 camp.status === 'Scheduled' ? <Clock size={12} /> :
                                                 <AlertCircle size={12} />}
                                                {camp.status}
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <p className="text-[10px] font-bold text-foreground uppercase">{camp.scheduled_at ? new Date(camp.scheduled_at).toLocaleDateString() : 'No draft schedule'}</p>
                                            <p className="text-[8px] font-black text-muted-foreground uppercase mt-1">{camp.scheduled_at ? new Date(camp.scheduled_at).toLocaleTimeString() : '---'}</p>
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button onClick={() => handleDeleteCampaign(camp.id, camp.name)} variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-rose-50 text-slate-300 hover:text-rose-500">
                                                    <Trash2 size={18} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
