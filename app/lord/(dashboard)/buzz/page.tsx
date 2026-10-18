'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Loader2,
    ChevronRight,
    Zap,
    Clock,
    Camera,
    Plus,
    TrendingUp,
    Trash2,
    Activity,
    Navigation,
    ShieldCheck,
    Star,
    MapPin,
    Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import BuzzStudio from '@/components/admin/buzz/BuzzStudio';
import VenueManager from '@/components/admin/buzz/VenueManager';

interface BuzzPost {
    id: string;
    title: string;
    status: string;
    trend_score: number;
    area_zone: string | null;
    start_at: string;
}

export default function BuzzCommandTower() {
    const [activeTab, setActiveTab] = React.useState<'happenings' | 'venues'>('happenings');
    const [posts, setPosts] = React.useState<BuzzPost[]>([]);
    const [areas, setAreas] = React.useState<Array<{ zone_name: string; is_active: boolean }>>([]);
    const [venueCounts, setVenueCounts] = React.useState<{ verified: number; pending: number } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [studioOpen, setStudioOpen] = React.useState(false);
    const [editingPostId, setEditingPostId] = React.useState<string | null>(null);

    const fetchBuzz = React.useCallback(async () => {
        if (!supabase) {
            setLoadError('Supabase is not configured. Buzz data is unavailable.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const [postsRes, areasRes, venuesRes] = await Promise.all([
                supabase.from('buzz_posts')
                    .select('id, title, status, trend_score, area_zone, start_at')
                    .order('created_at', { ascending: false }),
                supabase.from('pulse_areas').select('zone_name, is_active'),
                supabase.from('buzz_venues').select('id, is_verified')
            ]);

            if (postsRes.error) throw new Error(`Could not load buzz posts: ${postsRes.error.message}`);
            if (areasRes.error) throw new Error(`Could not load registered areas: ${areasRes.error.message}`);
            if (venuesRes.error) throw new Error(`Could not load venue verification data: ${venuesRes.error.message}`);

            if (postsRes.data) {
                setPosts(postsRes.data as BuzzPost[]);
            }

            if (areasRes.data) setAreas(areasRes.data);
            setVenueCounts({
                verified: (venuesRes.data || []).filter(venue => venue.is_verified).length,
                pending: (venuesRes.data || []).filter(venue => !venue.is_verified).length
            });

        } catch (err) {
            console.error('[BuzzCommand] Could not load dashboard data:', err);
            setLoadError(err instanceof Error ? err.message : 'Could not load Buzz dashboard data.');
            setPosts([]);
            setAreas([]);
            setVenueCounts(null);
        }
        finally { setLoading(false); }
    }, []);

    const handleDeleteBuzz = async (id: string, title: string) => {
        if (!supabase || !confirm(`Permanently expel buzz node "${title}"?`)) return;
        try {
            const { error } = await supabase.from('buzz_posts').delete().eq('id', id);
            if (error) throw error;
            fetchBuzz();
        } catch (err) { console.error(err); }
    };

    React.useEffect(() => {
        fetchBuzz();
    }, [fetchBuzz]);

    return (
        <div className="p-8 space-y-10 bg-slate-50 min-h-screen text-left selection:bg-primary/20 pb-40">
            {/* 🏙️ CITY WAR ROOM HEADER */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-slate-200 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">City Intelligence Node</span>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground uppercase tracking-tighter leading-none">Buzz Command</h1>
                    <p className="text-slate-500 text-sm font-medium mt-1 italic">Orchestrating live moments, verified venues, and sector-level discovery.</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex overflow-x-auto no-scrollbar">
                        <button onClick={() => setActiveTab('happenings')} className={cn("px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'happenings' ? "bg-primary text-white shadow-lg" : "text-slate-400")}>Live Nowcasts</button>
                        <button onClick={() => setActiveTab('venues')} className={cn("px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'venues' ? "bg-primary text-white shadow-lg" : "text-slate-400")}>Venue Registry</button>
                    </div>
                    <Link href="/lord/growth/calendar">
                        <Button variant="outline" className="h-12 px-6 rounded-xl border-slate-200 bg-white font-black uppercase text-[10px] tracking-widest shadow-sm">
                            <Calendar size={14} className="mr-2" /> Global Schedule
                        </Button>
                    </Link>
                    <Button
                        onClick={() => { setEditingPostId(null); setStudioOpen(true); }}
                        className="rounded-xl h-12 px-8 bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus className="h-4 w-4 mr-2" /> Create Buzz Node
                    </Button>
                </div>
            </header>

            {loadError && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
                    <p>{loadError}</p>
                    <Button onClick={fetchBuzz} variant="outline" className="mt-3 rounded-xl border-rose-200 bg-white text-rose-700">
                        Retry loading Buzz data
                    </Button>
                </div>
            )}

            {activeTab === 'happenings' ? (
                <>
                {/* 📡 GLOBAL PULSE (LIGHT THEME) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 animate-in fade-in duration-700">
                {[
                    { label: 'Active Buzz', val: posts.filter(p => p.status === 'LIVE' || p.status === 'TRENDING').length, icon: Zap, color: 'primary' },
                    { label: 'Live Posts', val: posts.filter(p => p.status === 'LIVE').length, icon: TrendingUp, color: 'emerald' },
                    { label: 'Registered Areas', val: areas.length, icon: MapPin, color: 'indigo' },
                    { label: 'Active Areas', val: areas.filter(a => a.is_active).length, icon: Activity, color: 'rose' },
                ].map((node) => (
                    <Card key={node.label} className="p-8 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-4 text-center group hover:shadow-xl transition-all">
                        <div className={cn(
                            "h-14 w-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 shadow-inner",
                            node.color === 'primary' ? "bg-primary/10 text-primary" :
                            node.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                            node.color === 'emerald' ? "bg-emerald-50 text-emerald-500" :
                            "bg-rose-50 text-rose-500"
                        )}>
                            <node.icon size={28} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{node.label}</p>
                            <h3 className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                                {loading ? '…' : loadError ? '—' : node.val}
                            </h3>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid lg:grid-cols-12 gap-10">

                {/* THE HUB: LIVE HAPPENINGS */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-3">
                            <Activity className="h-5 w-5 text-primary animate-pulse" />
                            <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground">Live Nowcasts</h2>
                        </div>
                    </div>

                    <div className="grid gap-6">
                        {loading && posts.length === 0 ? (
                            <div className="py-40 flex flex-col items-center gap-6 bg-white rounded-[3rem] border border-slate-100 animate-pulse">
                                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Synchronizing City Signal...</p>
                            </div>
                        ) : posts.length === 0 ? (
                            <div className="py-16 rounded-[3rem] border border-slate-100 bg-white text-center">
                                <p className="text-sm font-bold text-slate-500">
                                    {loadError ? 'Buzz posts are unavailable until the data connection is restored.' : 'No buzz posts are currently recorded.'}
                                </p>
                            </div>
                        ) : posts.map(post => (
                            <Card key={post.id} className={cn(
                                "p-8 rounded-[3.5rem] bg-white border transition-all hover:shadow-2xl relative overflow-hidden group",
                                post.status === 'LIVE' ? "border-primary/20" : "border-slate-100"
                            )}>
                                <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10 text-left">
                                    <div className="flex items-center gap-8 flex-1 min-w-0">
                                        <div className="h-20 w-20 rounded-[2rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 group-hover:scale-105 transition-transform shrink-0 relative overflow-hidden">
                                            <Camera size={32} className="opacity-20" />
                                            {post.status === 'LIVE' && (
                                                <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-rose-500 animate-pulse" />
                                            )}
                                        </div>
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[8px] font-black uppercase text-slate-400">{post.area_zone || 'Area not recorded'}</span>
                                            </div>
                                            <h3 className="text-2xl font-black text-foreground uppercase tracking-tight truncate leading-none">{post.title}</h3>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-10 shrink-0">
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Buzz Score</p>
                                            <div className="flex items-center gap-2 justify-end">
                                                <span className="text-2xl font-black text-foreground tabular-nums">{post.trend_score}</span>
                                                <TrendingUp size={16} className={cn(post.trend_score > 70 ? "text-emerald-500" : "text-amber-500")} />
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                                            post.status === 'LIVE' ? "bg-primary/10 text-primary border-primary/20" : "bg-slate-50 text-slate-400 border-slate-100"
                                        )}>
                                            {post.status}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteBuzz(post.id, post.title); }}
                                                className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => { setEditingPostId(post.id); setStudioOpen(true); }}
                                                className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 hover:bg-primary hover:text-white transition-all shadow-sm"
                                            >
                                                <ChevronRight size={24} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <Zap className="absolute -bottom-6 -right-6 h-32 w-32 text-primary/5 rotate-12 pointer-events-none" />
                            </Card>
                        ))}
                    </div>
                </div>

                {/* LOGISTICS & SIGNALS SIDEBAR */}
                <div className="lg:col-span-4 space-y-8">
                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 relative overflow-hidden group">
                        <div className="relative z-10 space-y-8 text-left">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/10"><Navigation size={24} className="fill-current" /></div>
                                <h3 className="text-2xl font-black uppercase tracking-tighter leading-none text-foreground">Sector Signal</h3>
                            </div>

                            <p className="text-sm font-medium text-slate-500 italic leading-relaxed">
                                Counts are based on live and trending posts currently saved for each registered area.
                            </p>

                            <div className="space-y-6">
                                {areas.length === 0 ? (
                                    <p className="text-sm font-semibold text-slate-400">No registered areas are available.</p>
                                ) : areas.map((area) => {
                                    const count = posts.filter(post =>
                                        post.area_zone?.toLowerCase() === area.zone_name.toLowerCase()
                                        && ['LIVE', 'TRENDING'].includes(post.status)
                                    ).length;
                                    return (
                                        <div key={area.zone_name} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                                {area.zone_name}
                                            </span>
                                            <span className="text-sm font-black text-foreground">
                                                {count} {count === 1 ? 'post' : 'posts'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Card>

                    <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 relative overflow-hidden group">
                        <div className="relative z-10 space-y-8 text-left">
                             <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 shadow-sm border border-rose-100"><ShieldCheck size={24} /></div>
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-foreground leading-none">Trust Sentinel</h3>
                            </div>
                            <p className="text-sm font-medium text-slate-400 leading-relaxed italic">
                                Venue counts reflect the current verification state stored in the venue registry.
                            </p>
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                    <Clock size={16} className="text-primary" />
                                    <span className="text-[9px] font-black uppercase text-slate-500">
                                        {venueCounts === null ? 'Venue verification data unavailable' : `${venueCounts.pending} venues pending verification`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                    <Star size={16} className="text-amber-500" />
                                    <span className="text-[9px] font-black uppercase text-slate-500">
                                        {venueCounts === null ? 'Venue verification data unavailable' : `${venueCounts.verified} verified venues`}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <Zap size={64} className="absolute -bottom-6 -right-6 text-primary/5 rotate-12" />
                    </Card>
                </div>

                </div>
                </>
            ) : (
                <VenueManager />
            )}

            {studioOpen && (
                <BuzzStudio
                    postId={editingPostId}
                    onClose={() => setStudioOpen(false)}
                    onSave={fetchBuzz}
                />
            )}
        </div>
    );
}
