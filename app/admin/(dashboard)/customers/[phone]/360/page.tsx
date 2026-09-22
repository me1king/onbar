'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    MousePointer2,
    Loader2,
    Zap,
    MapPin,
    ArrowLeft,
    History,
    Star,
    Target,
    TrendingUp,
    Clock,
    Package
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';

interface Customer360 {
    profile: {
        id: string;
        full_name: string | null;
        created_at: string;
        total_orders: number;
        lifetime_value: number;
        xp: number;
    };
    intelligence: {
        intent_score: number;
        last_interaction_at: string;
    } | null;
    metrics: {
        total_sessions: number;
        total_active_time_sec: number;
        total_clicks: number;
    } | null;
    journey: Array<{
        timestamp: string;
        action_type: string;
        page_url: string;
    }>;
    interests: Array<{
        interest_key: string;
        score: number;
    }>;
}

export default function Customer360Page() {
    const { phone } = useParams();
    const router = useRouter();
    const [data, setData] = React.useState<Customer360 | null>(null);
    const [loading, setLoading] = React.useState(true);

    const fetch360 = React.useCallback(async () => {
        if (!supabase || !phone) return;
        setLoading(true);
        try {
            // 1. Fetch Profile and related IDs
            const { data: profile } = await supabase.from('profiles').select('*').eq('phone_number', phone).single();
            if (!profile) return;

            // 2. Fetch High-Fidelity 360 Nodes
            const [intelRes, metricsRes, journeyRes, interestsRes] = await Promise.all([
                supabase.from('customer_intelligence').select('*').eq('user_id', profile.id).maybeSingle(),
                supabase.from('customer_aggregate_metrics').select('*').eq('user_id', profile.id).maybeSingle(),
                supabase.from('session_forensics').select('*').eq('metadata->>userId', profile.id).order('timestamp', { ascending: false }).limit(20),
                supabase.from('user_interests').select('*').eq('user_id', profile.id).order('score', { ascending: false })
            ]);

            setData({
                profile,
                intelligence: intelRes.data,
                metrics: metricsRes.data,
                journey: journeyRes.data || [],
                interests: interestsRes.data || []
            });
        } catch (err) {
            console.error("360 Sync Failure:", err);
        } finally {
            setLoading(false);
        }
    }, [phone]);

    React.useEffect(() => {
        fetch360();
    }, [fetch360]);

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Synchronizing Customer 360...</p>
        </div>
    );

    if (!data) return <div className="p-20 text-center uppercase font-black text-slate-300">Patron Node not established.</div>;

    const { profile, intelligence, metrics, journey, interests } = data;

    return (
        <div className="p-8 space-y-12 bg-slate-50 min-h-screen text-left pb-40 selection:bg-primary/20 animate-in fade-in duration-700">

            {/* 360 HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-slate-200 pb-10">
                <div className="space-y-4">
                    <button onClick={() => router.back()} className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors">
                        <ArrowLeft size={14} /> Back to Directory
                    </button>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest border border-primary/20">Verified Profile</span>
                            <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none italic">
                                {profile.full_name || 'Anonymous Patron'}
                            </h1>
                        </div>
                        <p className="text-muted-foreground text-sm font-medium">Global ID: {profile.id.substring(0, 8)} • Joined {new Date(profile.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <Button className="rounded-2xl h-14 px-10 bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest shadow-xl">
                        <Target size={16} className="mr-3" /> Audit Intelligence
                    </Button>
                </div>
            </header>

            <div className="grid lg:grid-cols-12 gap-10">

                {/* LEFT: IDENTITY & METRICS */}
                <div className="lg:col-span-8 space-y-10">

                    {/* CORE KPI GRID */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                        {[
                            { label: 'Total Orders', val: profile.total_orders || 0, icon: Package, color: 'primary' },
                            { label: 'Lifetime Value', val: formatPrice(profile.lifetime_value || 0), icon: TrendingUp, color: 'emerald' },
                            { label: 'Loyalty XP', val: profile.xp || 0, icon: Star, color: 'indigo' },
                            { label: 'Intent Score', val: intelligence?.intent_score || 0, icon: Zap, color: 'rose' },
                        ].map(stat => (
                            <Card key={stat.label} className="p-8 rounded-[3rem] bg-white border border-slate-100 shadow-sm">
                                <div className={cn(
                                    "h-10 w-10 rounded-xl flex items-center justify-center mb-6 shadow-inner",
                                    stat.color === 'primary' ? 'bg-primary/10 text-primary' :
                                    stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-500' :
                                    stat.color === 'indigo' ? 'bg-indigo-50 text-indigo-500' :
                                    'bg-rose-50 text-rose-500'
                                )}>
                                    <stat.icon size={20} />
                                </div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                <h3 className="text-xl font-black text-foreground uppercase tracking-tight truncate tabular-nums">{stat.val}</h3>
                            </Card>
                        ))}
                    </div>

                    {/* JOURNEY TIMELINE */}
                    <section className="space-y-8">
                        <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground px-6 italic flex items-center gap-4">
                            <History size={24} className="text-primary" /> Journey Timeline
                        </h2>
                        <Card className="rounded-[4rem] bg-white border border-slate-100 shadow-sm p-10">
                            <div className="space-y-12 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-1 before:bg-slate-50 before:rounded-full">
                                {journey.map((event, i) => (
                                    <div key={i} className="relative pl-16 flex justify-between items-start group">
                                        <div className="absolute left-[1.125rem] top-2 h-3 w-3 rounded-full border-2 border-white bg-slate-200 group-hover:bg-primary group-hover:scale-150 transition-all z-10" />
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            <h4 className="text-base font-black text-foreground uppercase tracking-tighter italic">{event.action_type.replace(/_/g, ' ')}</h4>
                                            <p className="text-[10px] font-medium text-slate-400 italic">{event.page_url}</p>
                                        </div>
                                        <div className="text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-[8px] font-black uppercase tracking-widest text-primary">Details &rarr;</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </section>
                </div>

                {/* RIGHT: INTELLIGENCE & INTERESTS */}
                <div className="lg:col-span-4 space-y-10">

                    {/* INTEREST GRAPH */}
                    <Card className="p-10 rounded-[4rem] bg-slate-900 text-white border-none shadow-2xl space-y-10 relative overflow-hidden">
                        <div className="relative z-10 space-y-10 text-left">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <Target className="h-5 w-5 text-primary" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Demand Profile</span>
                                </div>
                                <h3 className="text-3xl font-black uppercase tracking-tighter italic leading-none">Interest <br /> Graph.</h3>
                            </div>

                            <div className="space-y-6">
                                {interests.length === 0 ? (
                                    <p className="text-[10px] font-black text-white/30 uppercase italic">Insufficient discovery data</p>
                                ) : interests.map(interest => (
                                    <div key={interest.interest_key} className="space-y-2">
                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/60 px-1">
                                            <span>{interest.interest_key}</span>
                                            <span>{interest.score}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/10">
                                            <div className="h-full bg-primary rounded-full transition-all duration-1000 shadow-[0_0_10px_#F5A000]" style={{ width: `${interest.score}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    {/* BEHAVIORAL SIGNALS */}
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-8 text-left">
                        <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.4em]">Behavioral Signals</h3>
                        <div className="space-y-6">
                            {[
                                { label: 'Active Sessions', val: metrics?.total_sessions || 0, icon: History },
                                { label: 'Total active time', val: `${Math.floor((metrics?.total_active_time_sec || 0) / 60)}m`, icon: Clock },
                                { label: 'Click Velocity', val: metrics?.total_clicks || 0, icon: MousePointer2 },
                                { label: 'Last Interaction', val: intelligence?.last_interaction_at ? new Date(intelligence.last_interaction_at).toLocaleDateString() : 'Never', icon: MapPin },
                            ].map(signal => (
                                <div key={signal.label} className="flex items-center gap-4 group">
                                    <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-primary group-hover:bg-primary/5 transition-all"><signal.icon size={18} /></div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-foreground">{signal.label}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{signal.val}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                </div>
            </div>
        </div>
    );
}
