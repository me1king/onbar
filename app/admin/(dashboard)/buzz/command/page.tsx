'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Flame,
    Clock,
    Globe,
    Zap,
    BarChart3,
    ArrowUpRight,
    Loader2,
    ShieldCheck,
    Eye,
    X
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface BuzzReach {
    buzz_id: string;
    title: string;
    venue: string;
    impressions: number | null;
    clicks: number | null;
    ctr: number | null;
    status: string;
}

interface PendingBuzz {
    id: string;
    title: string;
    venue: { name: string };
    status: string;
}

interface DBBuzzPost {
    id: string;
    title: string;
    status: string;
    venue: { name: string } | null;
}

export default function BuzzCommandCenter() {
    const [stats, setStats] = React.useState<{ live: number | null; upcoming: number | null; campaigns: number | null }>({
        live: null,
        upcoming: null,
        campaigns: null
    });
    const [campaigns, setCampaigns] = React.useState<BuzzReach[]>([]);
    const [pendingBuzz, setPendingBuzz] = React.useState<PendingBuzz[] | null>(null);
    const [loading, setLoading] = React.useState(true);

    const fetchAnalytics = React.useCallback(async () => {
        if (!supabase) {
            setLoading(false);
            setCampaigns([]);
            setPendingBuzz(null);
            return;
        }
        setLoading(true);
        try {
            // High-fidelity fetch for Buzz Funnel & Moderation
            const [postsRes, pendingRes] = await Promise.all([
                supabase.from('buzz_posts').select('id, title, status, venue:buzz_venues(name)').order('created_at', { ascending: false }),
                supabase.from('buzz_posts').select('*, venue:buzz_venues(name)').eq('status', 'SUBMITTED')
            ]);

            if (postsRes.data && !postsRes.error) {
                const posts = postsRes.data as unknown as DBBuzzPost[];
                setStats({
                    live: posts.filter(post => post.status === 'LIVE').length,
                    upcoming: posts.filter(post => post.status === 'UPCOMING').length,
                    campaigns: posts.length
                });
                setCampaigns(posts.map(b => ({
                    buzz_id: b.id,
                    title: b.title,
                    venue: b.venue?.name || 'Venue unavailable',
                    impressions: null,
                    clicks: null,
                    ctr: null,
                    status: b.status
                })));
            } else {
                setStats({ live: null, upcoming: null, campaigns: null });
                setCampaigns([]);
            }

            setPendingBuzz(pendingRes.error ? null : (pendingRes.data as unknown as PendingBuzz[] | null) || []);
        } catch (err) {
            console.error("Command Node Failure:", err);
            setPendingBuzz(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleApprove = async (id: string) => {
        const { error } = await supabase!.from('buzz_posts').update({ status: 'LIVE' }).eq('id', id);
        if (!error) fetchAnalytics();
    };

    React.useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    return (
        <div className="p-8 space-y-12 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* COMMAND HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200 pb-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Flame className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary italic">Live Discovery Hub</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                        Buzz <span className="text-primary">Command.</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium">Global city-discovery orchestration and venue-promotion engine.</p>
                </div>
                <div className="flex gap-4">
                    <Button onClick={fetchAnalytics} variant="outline" className="rounded-2xl h-14 px-8 border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">
                        <BarChart3 size={16} className="mr-3" /> Tactical Refresh
                    </Button>
                    <Link href="/lord/buzz/create">
                        <Button className="rounded-2xl h-14 px-10 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                            <Zap size={16} className="mr-3 fill-current" /> Deploy Global Buzz
                        </Button>
                    </Link>
                </div>
            </header>

            {/* REAL-TIME RADAR STATS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                    { label: 'Live Buzz', val: stats.live ?? 'Unavailable', icon: Flame, color: 'rose' },
                    { label: 'Upcoming', val: stats.upcoming ?? 'Unavailable', icon: Clock, color: 'indigo' },
                    { label: 'Total Buzz Posts', val: stats.campaigns ?? 'Unavailable', icon: Zap, color: 'primary' },
                    { label: 'Today\'s Reach', val: 'Unavailable', icon: Globe, color: 'emerald' },
                ].map(stat => (
                    <Card key={stat.label} className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm group hover:shadow-2xl transition-all">
                        <div className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center mb-8 shadow-inner transition-transform group-hover:scale-110",
                            stat.color === 'rose' ? "bg-rose-50 text-rose-500" :
                            stat.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                            stat.color === 'emerald' ? "bg-emerald-50 text-emerald-500" :
                            "bg-primary/10 text-primary"
                        )}>
                            <stat.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h3 className="text-3xl font-black text-foreground uppercase tracking-tight tabular-nums">{stat.val}</h3>
                    </Card>
                ))}
            </div>

            <div className="grid lg:grid-cols-12 gap-10">

                {/* LEFT: PROMOTIONS */}
                <section className="lg:col-span-8 space-y-8">
                    <div className="flex justify-between items-center px-6">
                        <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground italic">Promotion Performance</h2>
                        <Link href="/lord/buzz/campaigns" className="text-[10px] font-black text-primary uppercase underline underline-offset-4 tracking-widest">Full Ledger &rarr;</Link>
                    </div>

                    <Card className="rounded-[4rem] bg-white border border-slate-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto no-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-10 py-6 text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">Campaign/Venue</th>
                                        <th className="px-8 py-6 text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">Reach</th>
                                        <th className="px-8 py-6 text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">Clicks</th>
                                        <th className="px-8 py-6 text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">CTR</th>
                                        <th className="px-8 py-6 text-[9px] font-black uppercase text-slate-400 tracking-[0.3em]">Status</th>
                                        <th className="px-10 py-6 text-[9px] font-black uppercase text-slate-400 tracking-[0.3em] text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loading ? (
                                        <tr><td colSpan={6} className="py-20 text-center opacity-20"><Loader2 className="animate-spin mx-auto text-primary" /></td></tr>
                                    ) : campaigns.map((camp) => (
                                        <tr key={camp.buzz_id} className="group hover:bg-slate-50/50 transition-all">
                                            <td className="px-10 py-8">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-foreground uppercase tracking-tight leading-none italic">{camp.title}</span>
                                                    <span className="text-[9px] font-bold text-primary uppercase tracking-widest mt-1.5">{camp.venue}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-8 text-sm font-black text-slate-500 tabular-nums">{camp.impressions?.toLocaleString() ?? 'Unavailable'}</td>
                                            <td className="px-8 py-8 text-sm font-black text-slate-500 tabular-nums">{camp.clicks?.toLocaleString() ?? 'Unavailable'}</td>
                                            <td className="px-8 py-8">
                                                <div className={`flex items-center gap-2 font-black ${camp.ctr === null ? 'text-slate-400' : 'text-emerald-600'}`}>
                                                    <span className="text-sm">{camp.ctr === null ? 'Unavailable' : `${camp.ctr}%`}</span>
                                                    {camp.ctr !== null && <ArrowUpRight size={12} />}
                                                </div>
                                            </td>
                                            <td className="px-8 py-8">
                                                <span className={cn(
                                                    "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                                    camp.status === 'LIVE' ? "bg-emerald-50 text-emerald-600 border-emerald-100 animate-pulse" : "bg-slate-50 text-slate-400 border-slate-100"
                                                )}>
                                                    {camp.status}
                                                </span>
                                            </td>
                                            <td className="px-10 py-8 text-right">
                                                <Link href={`/lord/buzz/${camp.buzz_id}`}>
                                                    <Button size="icon" variant="ghost" className="h-12 w-12 rounded-xl text-slate-300 hover:text-primary hover:bg-white transition-all shadow-sm">
                                                        <Eye size={20} />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </section>

                {/* RIGHT: MODERATION QUEUE */}
                <aside className="lg:col-span-4 space-y-8">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground px-6 italic">Moderation Node</h2>
                    <div className="space-y-4">
                        {pendingBuzz === null ? (
                            <div className="p-12 rounded-[3.5rem] bg-slate-50 border border-slate-100 text-center text-slate-400">
                                <ShieldCheck size={40} className="mx-auto mb-4" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Queue data unavailable</p>
                            </div>
                        ) : pendingBuzz.length === 0 ? (
                            <div className="p-12 rounded-[3.5rem] bg-slate-50 border border-slate-100 text-center opacity-30 italic">
                                <ShieldCheck size={40} className="mx-auto mb-4" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Queue Clear</p>
                            </div>
                        ) : pendingBuzz.map(pending => (
                            <Card key={pending.id} className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm space-y-6">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest">Pending Review</p>
                                    <h4 className="text-xl font-black text-foreground uppercase tracking-tight italic">{pending.title}</h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{pending.venue?.name}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => handleApprove(pending.id)} className="flex-1 h-12 rounded-xl bg-emerald-500 text-white font-black uppercase text-[9px] tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100">Approve Node</Button>
                                    <Button variant="ghost" className="h-12 w-12 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100"><X size={18} /></Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </aside>

            </div>

        </div>
    );
}
